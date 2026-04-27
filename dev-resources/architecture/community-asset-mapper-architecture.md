# Community Asset Mapper — Architecture

*A web-based frontend for browsing and managing community-owned assets,
using OpenStreetMap as the public geographic commons and a private
Neon Postgres + PostGIS store for operational data, with Cloudflare R2
for photo blobs.*

---

## 1. Design Principles

1. **OSM for geography, Neon for operations.** Public, permanent,
   verifiable attributes (location, type, name, operator) live in OSM.
   Operational attributes (condition, inspection history, internal contacts,
   photos, maintenance schedules) live in a private Neon Postgres database
   with the PostGIS extension enabled.
2. **Stable linking via `ref:` tags.** Each community asset gets a short,
   human-readable reference (e.g. `MVC-0042`) stored as a `ref:community_asset`
   tag on the OSM feature. The same ref is the primary key in the private store.
   This survives OSM element ID changes caused by splits, merges, and
   redactions.
3. **No sensitive data in OSM.** Personal contacts, women's refuge locations,
   vulnerability assessments, sacred site details — none of these enter the
   ODbL-licensed, permanently-versioned, publicly-replicated OSM database.
4. **Offline-first field capture.** Condition surveys, inspections, and photo
   capture use KoboToolbox/ODK Collect on mobile devices, syncing to Neon
   (and R2 for photo blobs) via a webhook bridge running as a SvelteKit
   server route on Cloudflare Workers.
5. **Low/zero hosting cost.** Neon's free tier (0.5 GB storage, 1 project,
   10 branches, autosuspend after ~5 min idle) plus Cloudflare R2's free
   tier (10 GB storage, 1M Class-A ops/month) and Cloudflare Workers' free
   tier comfortably cover a community of ≤500 assets. The only external
   cost is a domain name (~AUD 15/year).

---

## 2. System Context

```text
┌──────────────────────────────────────────────────────────┐
│                    Community Members                      │
│                                                          │
│   Browser (SvelteKit)    KoboCollect (Android/iOS)       │
│         │                        │                       │
└─────────┼────────────────────────┼───────────────────────┘
          │                        │
          │  HTTPS                 │ Kobo API → webhook
          ▼                        ▼
┌──────────────────────────────────────────────────────────┐
│       SvelteKit on Cloudflare Workers (server)            │
│                                                          │
│   +server.ts routes       Cron Trigger (weekly OSM sync)  │
│         │  │                       │                     │
│         │  └────────────┬──────────┘                     │
│         ▼               ▼                                │
│  ┌──────────────┐  ┌──────────────────┐                 │
│  │ Neon Postgres│  │ Cloudflare R2     │                 │
│  │  + PostGIS   │  │  bucket: photos   │                 │
│  │ (HTTP/WS via │  │ (S3-compatible    │                 │
│  │  serverless  │  │  or Worker        │                 │
│  │  driver)     │  │  binding)         │                 │
│  └──────────────┘  └──────────────────┘                 │
└──────────┬───────────────────────────────────────────────┘
           │
           │  Overpass API / OSM API (read)
           │  iD Editor redirect (write)
           ▼
┌──────────────────────────────────────────────────────────┐
│                  OpenStreetMap                            │
│                                                          │
│   Canonical store for public, physical, verifiable data   │
│   Basemap tiles via tile.openstreetmap.org or Protomaps   │
└──────────────────────────────────────────────────────────┘
```

The split: relational and spatial data lives in **Neon Postgres** (with the
PostGIS extension); photo blobs live in **Cloudflare R2**; the SvelteKit app
itself runs on **Cloudflare Workers** (per `@sveltejs/adapter-cloudflare`),
and scheduled work (the weekly OSM sync) runs as a **Cloudflare Cron
Trigger** invoking a server route in the same Worker.

---

## 3. Database Schema (Neon Postgres + PostGIS)

The schema below is plain Postgres DDL — it runs unchanged on any Postgres
instance with the `postgis` extension enabled. On Neon, enable the
extension once via the SQL Editor (`CREATE EXTENSION IF NOT EXISTS postgis;`)
before applying these tables. In the codebase, schema changes are managed
through Drizzle Kit (`drizzle/` directory + `drizzle.config.ts`), with the
TypeScript schema defined in `src/lib/server/schema.ts`. The SQL below is
the authoritative reference shape.

### 3.1 Core tables

```sql
-- Asset types: hall, fire_station, water_tank, bridge, defibrillator,
-- evacuation_centre, playground, sports_field, social_service, etc.
CREATE TABLE asset_type (
    id              TEXT PRIMARY KEY,         -- e.g. 'community_hall'
    label           TEXT NOT NULL,            -- e.g. 'Community Hall'
    osm_tags        JSONB,                    -- expected OSM tags for matching
                                              -- e.g. {"amenity":"community_centre"}
    icon            TEXT,                     -- icon name for map rendering
    inspection_form TEXT                      -- KoboToolbox form ID, if any
);

-- The core asset register — one row per community-managed asset.
-- The `ref` is the stable join key to OSM via `ref:community_asset=*`.
CREATE TABLE asset (
    ref             TEXT PRIMARY KEY,         -- e.g. 'MVC-0042'
    asset_type_id   TEXT NOT NULL REFERENCES asset_type(id),
    name            TEXT NOT NULL,
    description     TEXT,

    -- Cached OSM linkage (refreshed by sync job)
    osm_element     TEXT,                     -- e.g. 'n12345678', 'w98765432'
    osm_lat         DOUBLE PRECISION,
    osm_lon         DOUBLE PRECISION,
    geom            GEOMETRY(Point, 4326),    -- PostGIS point, kept in sync

    -- Operational fields OSM will not hold
    owner           TEXT,                     -- legal owner
    operator_contact TEXT,                    -- e.g. 'secretary@hall.org.au'
    condition       TEXT CHECK (condition IN (
                        'good','fair','poor','critical','unknown'
                    )),
    condition_date  DATE,
    access_notes    TEXT,                     -- e.g. 'key held at 12 Main St'
    council_ref     TEXT,                     -- council asset register ID
    is_sensitive    BOOLEAN DEFAULT FALSE,    -- if true, hide from public map

    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_asset_geom ON asset USING GIST (geom);
CREATE INDEX idx_asset_type ON asset (asset_type_id);

-- Inspection / condition survey records (from Kobo or manual entry)
CREATE TABLE inspection (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_ref       TEXT NOT NULL REFERENCES asset(ref),
    inspected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    inspector       TEXT,                     -- name or user_id
    condition       TEXT CHECK (condition IN (
                        'good','fair','poor','critical'
                    )),
    notes           TEXT,
    kobo_submission TEXT,                     -- Kobo submission UUID
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Photos attached to assets or inspections
CREATE TABLE photo (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_ref       TEXT REFERENCES asset(ref),
    inspection_id   UUID REFERENCES inspection(id),
    storage_path    TEXT NOT NULL,            -- R2 object key, e.g. 'inspections/<uuid>/photo_1.jpg'
    caption         TEXT,
    taken_at        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Contacts linked to assets (never stored in OSM)
CREATE TABLE asset_contact (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_ref       TEXT NOT NULL REFERENCES asset(ref),
    role            TEXT NOT NULL,            -- e.g. 'keyholder', 'committee_chair'
    name            TEXT,
    phone           TEXT,
    email           TEXT,
    is_public       BOOLEAN DEFAULT FALSE,    -- can be shown on public map?
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 3.2 Access control (deferred — enforced at the SvelteKit server layer)

Authentication and role-based access are **not implemented in the database
layer**. Postgres Row-Level Security is intentionally not used:

- The Neon connection string is treated as a server-side secret and is
  never exposed to the browser. All queries are issued from SvelteKit
  server routes (`+server.ts` files and `+page.server.ts` load functions)
  running on Cloudflare Workers.
- Public-vs-sensitive filtering, role checks (viewer / editor / admin),
  and contact visibility are decided in the TypeScript server layer before
  a query runs. The `is_sensitive` and `is_public` flags on the rows are
  the data the server reads to make those decisions; the server does not
  trust the client to do the filtering.
- The auth provider itself (Auth.js / Lucia / a custom JWT implementation)
  is **TBD**. The architecture only commits to the *placement* of the
  check, not the identity of the provider.

If RLS is later introduced for defence-in-depth, it would use a per-request
`SET LOCAL app.user_id = ...` pattern populated by the SvelteKit handle
hook, with policies reading those session variables via `current_setting()`.

### 3.3 Server-side query functions

These are plain Postgres functions. They are invoked from SvelteKit server
routes via Drizzle's `sql` template (e.g.
`db.execute(sql\`SELECT * FROM assets_in_bbox(${w}, ${s}, ${e}, ${n}, ${incl})\`)`)
rather than via a client SDK. Because access decisions happen in the server
layer, sensitivity filtering is passed in as a parameter — the function
does not consult any auth context.

```sql
-- Find assets within a bounding box (for map viewport queries).
-- The caller (SvelteKit server) sets `p_include_sensitive` based on the
-- session's role; unauthenticated requests pass FALSE.
CREATE OR REPLACE FUNCTION assets_in_bbox(
    min_lon DOUBLE PRECISION,
    min_lat DOUBLE PRECISION,
    max_lon DOUBLE PRECISION,
    max_lat DOUBLE PRECISION,
    p_include_sensitive BOOLEAN DEFAULT FALSE
) RETURNS SETOF asset
LANGUAGE sql STABLE
AS $$
    SELECT *
    FROM asset
    WHERE geom && ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
      AND (NOT is_sensitive OR p_include_sensitive);
$$;

-- Full asset detail with latest inspection and contacts
CREATE OR REPLACE FUNCTION asset_detail(p_ref TEXT)
RETURNS JSON
LANGUAGE sql STABLE
AS $$
    SELECT json_build_object(
        'asset', (SELECT row_to_json(a) FROM asset a WHERE a.ref = p_ref),
        'latest_inspection', (
            SELECT row_to_json(i)
            FROM inspection i
            WHERE i.asset_ref = p_ref
            ORDER BY i.inspected_at DESC
            LIMIT 1
        ),
        'inspections', (
            SELECT json_agg(row_to_json(i) ORDER BY i.inspected_at DESC)
            FROM inspection i
            WHERE i.asset_ref = p_ref
        ),
        'contacts', (
            SELECT json_agg(row_to_json(c))
            FROM asset_contact c
            WHERE c.asset_ref = p_ref
        ),
        'photos', (
            SELECT json_agg(row_to_json(p))
            FROM photo p
            WHERE p.asset_ref = p_ref
        )
    );
$$;

-- Dashboard summary: counts by type and condition
CREATE OR REPLACE FUNCTION asset_summary()
RETURNS JSON
LANGUAGE sql STABLE
AS $$
    SELECT json_build_object(
        'total', (SELECT count(*) FROM asset),
        'by_type', (
            SELECT json_agg(row_to_json(t))
            FROM (
                SELECT asset_type_id, count(*) as count
                FROM asset
                GROUP BY asset_type_id
            ) t
        ),
        'by_condition', (
            SELECT json_agg(row_to_json(c))
            FROM (
                SELECT condition, count(*) as count
                FROM asset
                GROUP BY condition
            ) c
        ),
        'overdue_inspections', (
            SELECT count(*)
            FROM asset a
            WHERE a.condition_date < now() - INTERVAL '12 months'
               OR a.condition_date IS NULL
        )
    );
$$;
```

---

## 4. OSM Integration Layer

### 4.1 Overpass query — fetch community assets in an area

```javascript
// overpass.js — query wrapper
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

export async function fetchCommunityAssets(bbox) {
  const [south, west, north, east] = bbox;
  const query = `
    [out:json][timeout:30];
    (
      // Physical community infrastructure
      node["amenity"~"community_centre|fire_station|social_facility"](${south},${west},${north},${east});
      way["amenity"~"community_centre|fire_station|social_facility"](${south},${west},${north},${east});

      // Emergency assets
      node["emergency"~"water_tank|fire_hydrant|defibrillator|assembly_point"](${south},${west},${north},${east});

      // Bridges
      way["man_made"="bridge"](${south},${west},${north},${east});

      // Anything with our ref tag
      node["ref:community_asset"](${south},${west},${north},${east});
      way["ref:community_asset"](${south},${west},${north},${east});
    );
    out center tags;
  `;

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`
  });
  const data = await res.json();

  return data.elements.map(el => ({
    osmId: `${el.type[0]}${el.id}`,          // e.g. 'n12345678'
    lat: el.center?.lat ?? el.lat,
    lon: el.center?.lon ?? el.lon,
    tags: el.tags ?? {},
    ref: el.tags?.['ref:community_asset'] ?? null
  }));
}
```

### 4.2 OSM ↔ Neon sync strategy

The sync is **pull-based and eventual** — not real-time, because OSM
features change infrequently and Overpass rate limits apply.

It runs as a **Cloudflare Cron Trigger** that hits a SvelteKit server
route — e.g. `src/routes/api/cron/sync-osm/+server.ts` — guarded by a
shared secret (`CRON_SECRET`) and a header check so the route can only be
invoked by the platform. The cron schedule is declared in `wrangler.toml`
(e.g. `[triggers] crons = ["0 14 * * 0"]` for weekly Sunday 14:00 UTC).

```text
┌──────────────────────────────────────────────────┐
│  Scheduled job (Cloudflare Cron Trigger, weekly) │
│  → POST /api/cron/sync-osm (with CRON_SECRET)    │
│                                                  │
│  1. Query Overpass for all features with         │
│     ref:community_asset=* in the project bbox    │
│                                                  │
│  2. For each returned feature:                   │
│     - Match ref → asset.ref in Neon              │
│     - Update osm_element, osm_lat, osm_lon, geom │
│     - Flag any ref mismatches for review         │
│                                                  │
│  3. For assets in Neon with no OSM match:        │
│     - Flag as "unlinked" for manual resolution   │
│                                                  │
│  4. For OSM features with ref but no Neon        │
│     record: flag as "orphaned OSM tag"           │
└──────────────────────────────────────────────────┘
```

```sql
-- Sync status tracking
ALTER TABLE asset ADD COLUMN osm_sync_status TEXT
    DEFAULT 'unlinked'
    CHECK (osm_sync_status IN ('linked','unlinked','stale','orphaned'));
ALTER TABLE asset ADD COLUMN osm_last_synced TIMESTAMPTZ;
```

### 4.3 Linking a new asset to OSM

When a user creates a new asset record, the workflow is:

1. **User places a pin on the map** → a row is inserted into the `asset`
   table in Neon with `geom` set, `osm_element` null, and
   `osm_sync_status = 'unlinked'`.
2. **App searches Overpass** for nearby features matching the expected
   `asset_type.osm_tags` within 50m.
3. **If a match exists**: user confirms the link, app writes `osm_element`
   and suggests adding `ref:community_asset=MVC-0042` to the OSM feature
   (via iD editor deeplink or direct API call with OAuth2).
4. **If no match**: user can either create the feature in OSM via iD/JOSM,
   or leave the asset as Neon-only (appropriate for non-physical assets
   like services or programs).

iD editor deeplink for adding a tag to an existing feature:

```text
https://www.openstreetmap.org/edit?editor=id&node=12345678
```

---

## 5. SvelteKit Application Structure

```text
drizzle/                                  # Generated SQL migrations (Drizzle Kit)
drizzle.config.ts                         # Drizzle Kit config (points at DATABASE_URL)
wrangler.toml                             # Cloudflare Workers config (bindings, crons, secrets)
.dev.vars                                 # Local-only env vars for `wrangler dev` (gitignored)

src/
├── lib/
│   ├── components/
│   │   ├── map/
│   │   │   ├── AssetMap.svelte          # Main map (MapLibre GL JS)
│   │   │   ├── AssetMarker.svelte       # Clustered marker layer
│   │   │   ├── OsmFeatureLayer.svelte   # Overpass-sourced overlay
│   │   │   └── LayerControl.svelte      # Toggle asset types
│   │   ├── asset/
│   │   │   ├── AssetPanel.svelte        # Split-panel detail view
│   │   │   ├── AssetForm.svelte         # Create/edit form
│   │   │   ├── InspectionHistory.svelte # Timeline of inspections
│   │   │   ├── PhotoGallery.svelte      # Photo grid + upload
│   │   │   └── ContactList.svelte       # Linked contacts
│   │   ├── dashboard/
│   │   │   ├── Summary.svelte           # Counts by type/condition
│   │   │   └── OverdueList.svelte       # Assets needing inspection
│   │   └── osm/
│   │       ├── OsmLinkWizard.svelte     # Link asset ↔ OSM feature
│   │       └── OsmAttributeView.svelte  # Show OSM tags read-only
│   ├── server/
│   │   ├── db.ts                        # Neon serverless driver + Drizzle client
│   │   ├── schema.ts                    # Drizzle schema (mirrors §3 SQL)
│   │   ├── r2.ts                        # R2 client (Worker binding or S3 SDK)
│   │   ├── overpass.ts                  # Overpass query functions
│   │   └── kobo-webhook.ts              # Kobo → Neon/R2 bridge
│   ├── stores/
│   │   ├── assets.ts                    # Asset list/selection state
│   │   ├── map.ts                       # Map viewport, layers
│   │   └── auth.ts                      # Session state (auth provider TBD)
│   └── utils/
│       ├── osm-tags.ts                  # Tag → label mappings
│       ├── ref-generator.ts             # Generate next ref ID
│       └── bbox.ts                      # Viewport → bbox helpers
├── routes/
│   ├── +page.svelte                     # Map view (default)
│   ├── +layout.svelte                   # Shell with nav
│   ├── dashboard/+page.svelte           # Summary dashboard
│   ├── asset/
│   │   ├── [ref]/+page.svelte           # Asset detail page
│   │   ├── [ref]/+page.server.ts        # Server-side data load (Drizzle)
│   │   └── new/+page.svelte             # New asset wizard
│   ├── api/
│   │   ├── kobo-webhook/+server.ts      # POST endpoint for Kobo
│   │   └── cron/sync-osm/+server.ts     # Weekly OSM sync (Cron Trigger)
│   └── auth/
│       ├── login/+page.svelte
│       └── callback/+server.ts
└── app.html
```

The `db.ts` module instantiates a Neon HTTP client and wraps it with Drizzle:

```typescript
// src/lib/server/db.ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// DATABASE_URL is a pooled Neon connection string with sslmode=require,
// supplied as a Wrangler secret in production and via `.dev.vars` locally.
export const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
```

The HTTP driver works inside Cloudflare Workers without TCP support; for
the (rarer) cases that need transactions or LISTEN/NOTIFY, swap to
`drizzle-orm/neon-serverless` with the WebSocket driver.

### 5.1 Key component: the hybrid detail panel

The core UX idea is that clicking a feature on the map opens a single
panel that seamlessly blends OSM-sourced and Neon-sourced data.

Because the Neon connection string is a server-side secret and the Neon
serverless driver runs only in server contexts, the data is loaded in a
`+page.server.ts` `load` function and passed to the component as the
`data` prop:

```typescript
// src/routes/asset/[ref]/+page.server.ts
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const result = await db.execute(
    sql`SELECT asset_detail(${params.ref}) AS detail`
  );
  const detail = result[0]?.detail;

  if (!detail?.asset) throw error(404, 'Asset not found');

  return {
    asset: detail.asset,
    latestInspection: detail.latest_inspection,
    inspections: detail.inspections ?? [],
    contacts: detail.contacts ?? [],
    photos: detail.photos ?? []
  };
};
```

```svelte
<!-- src/routes/asset/[ref]/+page.svelte (simplified) -->
<script lang="ts">
  import InspectionHistory from '$lib/components/asset/InspectionHistory.svelte';
  import PhotoGallery from '$lib/components/asset/PhotoGallery.svelte';
  import type { PageData } from './$types';

  // `data` comes from the +page.server.ts load function above.
  // `osmTags` is supplied by the parent (Overpass-sourced), or null.
  let { data, osmTags = null }: { data: PageData; osmTags?: Record<string, string> | null } =
    $props();
</script>

<div class="panel">
  <h2>{data.asset.name}</h2>

  <!-- OSM-sourced attributes (read-only, canonical) -->
  {#if osmTags}
    <section class="osm-attributes">
      <h3>Public Record (from OpenStreetMap)</h3>
      <dl>
        <dt>Type</dt>
        <dd>{osmTags.amenity ?? osmTags.emergency ?? osmTags.man_made}</dd>
        <dt>Operator</dt>
        <dd>{osmTags.operator ?? '—'}</dd>
        <dt>Address</dt>
        <dd>{osmTags['addr:street'] ?? '—'}</dd>
        <dt>Phone</dt>
        <dd>{osmTags.phone ?? '—'}</dd>
        <dt>Website</dt>
        <dd>{osmTags.website ?? '—'}</dd>
      </dl>
      {#if data.asset.osm_element}
        <a
          href="https://www.openstreetmap.org/{data.asset.osm_element.replace(
            /^(n|w|r)/,
            (m) => ({ n: 'node/', w: 'way/', r: 'relation/' })[m]
          )}"
          target="_blank"
          rel="noopener"
        >
          View/edit on OSM →
        </a>
      {/if}
    </section>
  {/if}

  <!-- Neon-sourced attributes (editable, private) -->
  <section class="local-attributes">
    <h3>Community Record</h3>
    <dl>
      <dt>Condition</dt>
      <dd class="condition-{data.asset.condition ?? 'unknown'}">
        {data.asset.condition ?? 'unknown'}
      </dd>
      <dt>Last inspected</dt>
      <dd>{data.asset.condition_date ?? 'never'}</dd>
      <dt>Access notes</dt>
      <dd>{data.asset.access_notes ?? '—'}</dd>
      <dt>Council ref</dt>
      <dd>{data.asset.council_ref ?? '—'}</dd>
    </dl>
  </section>

  <!-- Contacts (server already filtered by role / public flag) -->
  {#if data.contacts.length}
    <section class="contacts">
      <h3>Contacts</h3>
      {#each data.contacts as c (c.id)}
        <div>{c.role}: {c.name} — {c.phone}</div>
      {/each}
    </section>
  {/if}

  <!-- Inspection history -->
  <InspectionHistory assetRef={data.asset.ref} />

  <!-- Photos (signed R2 URLs generated server-side) -->
  <PhotoGallery photos={data.photos} />
</div>
```

Photo URLs in the `photos` array should be **signed R2 URLs** (generated
in the load function via the S3 SDK's `getSignedUrl` against the R2
endpoint, or via the bucket binding's `createPresignedUrl` if R2 bindings
are used). The browser then loads the JPEG directly from R2; the Worker
is never on the photo-serving hot path.

### 5.2 Map configuration

The browser cannot talk to Neon directly (the connection string is a
secret). Instead the SvelteKit app exposes a thin server endpoint that
runs the bbox query via Drizzle, and the map fetches GeoJSON from it.

```typescript
// src/routes/api/assets/bbox/+server.ts
import { json, error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const w = Number(url.searchParams.get('w'));
  const s = Number(url.searchParams.get('s'));
  const e = Number(url.searchParams.get('e'));
  const n = Number(url.searchParams.get('n'));
  if ([w, s, e, n].some(Number.isNaN)) throw error(400, 'bad bbox');

  // `locals.user` is populated by the auth handle hook (TBD).
  // Until auth lands, sensitive assets are excluded from API responses.
  const includeSensitive = locals.user?.role === 'editor' || locals.user?.role === 'admin';

  const rows = await db.execute(
    sql`SELECT * FROM assets_in_bbox(${w}, ${s}, ${e}, ${n}, ${includeSensitive})`
  );

  return json(rows);
};
```

```javascript
// MapLibre GL JS setup with OSM tiles + asset overlay
import maplibregl from 'maplibre-gl';

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      // Option A: OSM raster tiles (simplest, free)
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors'
      }
      // Option B: PMTiles vector tiles (better UX, self-hosted)
      // protomaps: {
      //   type: 'vector',
      //   url: 'pmtiles://https://your-cdn.com/australia.pmtiles'
      // }
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
  },
  center: [152.48, -31.92],  // Tinonee area
  zoom: 13
});

// Fetch asset points as GeoJSON via the server endpoint (which talks to Neon)
map.on('load', async () => {
  const bbox = map.getBounds();
  const params = new URLSearchParams({
    w: String(bbox.getWest()),
    s: String(bbox.getSouth()),
    e: String(bbox.getEast()),
    n: String(bbox.getNorth())
  });
  const res = await fetch(`/api/assets/bbox?${params}`);
  const rows = await res.json();

  map.addSource('assets', {
    type: 'geojson',
    data: toGeoJSON(rows),
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 50
  });

  // Clustered circles
  map.addLayer({
    id: 'clusters', type: 'circle', source: 'assets',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#4a90d9',
      'circle-radius': ['step', ['get', 'point_count'], 20, 10, 30, 50, 40]
    }
  });

  // Individual markers with condition-based colouring
  map.addLayer({
    id: 'asset-points', type: 'circle', source: 'assets',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': [
        'match', ['get', 'condition'],
        'good',     '#22c55e',
        'fair',     '#eab308',
        'poor',     '#f97316',
        'critical', '#ef4444',
        '#94a3b8'  // unknown/default
      ],
      'circle-radius': 8,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff'
    }
  });
});
```

---

## 6. KoboToolbox Integration

### 6.1 Inspection form design (XLSForm)

| type       | name            | label                        | required | appearance   |
| ---------- | --------------- | ---------------------------- | -------- | ------------ |
| barcode    | asset_ref       | Scan asset QR code           | yes      |              |
| select_one | condition       | Overall condition            | yes      | likert       |
| text       | notes           | Notes                        | no       | multiline    |
| image      | photo_1         | Photo — front                | no       |              |
| image      | photo_2         | Photo — defect               | no       |              |
| geopoint   | location        | GPS location (auto-captured) | yes      |              |
| dateTime   | inspected_at    | Inspection date/time         | yes      |              |

choices:

| list_name  | name     | label    |
| ---------- | -------- | -------- |
| condition  | good     | Good     |
| condition  | fair     | Fair     |
| condition  | poor     | Poor     |
| condition  | critical | Critical |

### 6.2 Webhook bridge (SvelteKit API route)

The webhook receives a Kobo submission, writes the inspection and updated
asset condition to Neon via Drizzle, downloads each attached photo from
Kobo, and pushes the bytes to Cloudflare R2 — keeping only the R2 object
key in the `photo` table.

The example uses the **R2 Worker binding** path (preferred when the Worker
has a binding declared in `wrangler.toml`, e.g.
`[[r2_buckets]] binding = "PHOTOS_BUCKET", bucket_name = "photos"`). If
you'd rather use the S3-compatible API, see `src/lib/server/r2.ts` for
the AWS SDK alternative; the rest of this handler is unchanged.

Required environment variables (Wrangler secrets in production, `.dev.vars`
locally):

- `DATABASE_URL` — pooled Neon connection string (`postgresql://…?sslmode=require`)
- `KOBO_API_TOKEN` — to fetch attachments from Kobo
- `KOBO_WEBHOOK_SECRET` — shared secret Kobo includes in the webhook header
- `PHOTOS_BUCKET` — declared as an R2 binding in `wrangler.toml` (no value needed)

```typescript
// src/routes/api/kobo-webhook/+server.ts
import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { asset, inspection, photo } from '$lib/server/schema';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
  // Authenticate the webhook caller
  if (request.headers.get('x-kobo-secret') !== env.KOBO_WEBHOOK_SECRET) {
    throw error(401, 'unauthorised');
  }

  const submission = await request.json();
  const assetRef = submission.asset_ref;
  const condition = submission.condition;

  // 1. Insert inspection record
  const [insp] = await db
    .insert(inspection)
    .values({
      assetRef,
      inspectedAt: submission.inspected_at,
      inspector: submission._submitted_by ?? 'anonymous',
      condition,
      notes: submission.notes,
      koboSubmission: submission._uuid
    })
    .returning();

  // 2. Update asset condition
  await db
    .update(asset)
    .set({
      condition,
      conditionDate: submission.inspected_at,
      updatedAt: new Date()
    })
    .where(eq(asset.ref, assetRef));

  // 3. Stream each Kobo photo into R2, then record it in `photo`
  const bucket = platform!.env.PHOTOS_BUCKET; // R2Bucket binding
  for (const key of ['photo_1', 'photo_2']) {
    if (!submission[key]) continue;

    const photoUrl = submission._attachments?.find(
      (a: { filename?: string }) => a.filename?.includes(submission[key])
    )?.download_url;
    if (!photoUrl) continue;

    const photoRes = await fetch(photoUrl, {
      headers: { Authorization: `Token ${env.KOBO_API_TOKEN}` }
    });
    if (!photoRes.ok) continue;

    const objectKey = `inspections/${insp.id}/${key}.jpg`;
    await bucket.put(objectKey, photoRes.body, {
      httpMetadata: { contentType: 'image/jpeg' }
    });

    await db.insert(photo).values({
      assetRef,
      inspectionId: insp.id,
      storagePath: objectKey,
      takenAt: submission.inspected_at
    });
  }

  return json({ ok: true, inspection_id: insp.id });
};
```

The `platform.env.PHOTOS_BUCKET` reference is the Cloudflare-Workers-on-
SvelteKit pattern: the adapter exposes Worker bindings via the `platform`
parameter on `RequestEvent`. In local `wrangler dev` the same code talks
to Wrangler's local R2 simulator.

---

## 7. Neon database setup

The Neon free tier covers the entire MVP comfortably. Setup is four
steps, mirroring the pattern used by the sister `community-resilience-mvp`
project.

### 7.1 Create a Neon project

1. Sign up at [console.neon.tech](https://console.neon.tech) (GitHub or
   email; no card required for the free tier).
2. **Create Project** → name it `community-asset-mapper`. Choose a region
   close to your users (e.g. `ap-southeast-2` for Australian deployments).
3. Note that the free tier autosuspends a project after ~5 minutes of
   inactivity. The first request after idle takes ~1–2 s to wake up; this
   is acceptable for an internal tool but worth surfacing to users.

### 7.2 Enable the PostGIS extension

In the Neon **SQL Editor**, run:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

(Neon ships PostGIS preinstalled; this just registers it on the database.)

### 7.3 Get the connection string and rename the database

1. Open **Dashboard → Connection Details**.
2. Choose the **Pooled** connection (Neon multiplexes through pgbouncer —
   essential when running on Workers because each invocation gets a fresh
   client).
3. Copy the URL. It looks like:

   ```text
   postgresql://USER:PASSWORD@ep-cool-name-12345-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require
   ```

4. Replace `neondb` in the path with `community_asset_mapper` (or whatever
   you named the database — Neon's default db is `neondb`; you can rename
   via the dashboard, or just use the default and adjust here).

### 7.4 Wire the connection string into the app

For local development with `wrangler dev`, put the URL in `.dev.vars` (a
gitignored file at the project root):

```text
# .dev.vars
DATABASE_URL=postgresql://USER:PASSWORD@ep-...-pooler.ap-southeast-2.aws.neon.tech/community_asset_mapper?sslmode=require
KOBO_API_TOKEN=...
KOBO_WEBHOOK_SECRET=...
CRON_SECRET=...
```

For production, set it as a Cloudflare Workers secret (never as a plain
env var — Workers secrets are encrypted at rest):

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put KOBO_API_TOKEN
npx wrangler secret put KOBO_WEBHOOK_SECRET
npx wrangler secret put CRON_SECRET
```

### 7.5 Apply the schema

With the schema defined in `src/lib/server/schema.ts` and a Drizzle Kit
config at `drizzle.config.ts`, generate and apply migrations:

```bash
# Generate a SQL migration from the current TypeScript schema
npx drizzle-kit generate

# Apply pending migrations against the Neon DB pointed to by DATABASE_URL
npx drizzle-kit migrate
```

For first-time setup or rapid iteration in development, `npx drizzle-kit
push` shortcuts straight to a `CREATE TABLE` against the live database
without producing a migration file. Use `migrate` once the schema
stabilises.

The three SQL functions in §3.3 (`assets_in_bbox`, `asset_detail`,
`asset_summary`) live as plain `.sql` files in `drizzle/` and are applied
in order alongside the table migrations.

---

## 8. Cloudflare R2 setup (photo blobs)

R2 stores the JPEG/PNG bytes uploaded by Kobo; the `photo.storage_path`
column in Neon holds only the object key.

### 8.1 Create the bucket

In the Cloudflare dashboard: **R2 → Create bucket** → name it `photos`.
The free tier (10 GB stored, 1M Class-A ops/month, unlimited egress to
the open internet) is more than enough for the MVP.

### 8.2 Choose binding-style or S3-style access

**Worker binding (preferred when running inside the Worker):**
declare it in `wrangler.toml`:

```toml
[[r2_buckets]]
binding = "PHOTOS_BUCKET"
bucket_name = "photos"
preview_bucket_name = "photos"
```

The binding is then accessed as `platform.env.PHOTOS_BUCKET` in
`+server.ts` handlers — no credentials needed, no signing required.
This is the path the §6.2 example uses.

**S3-compatible API (for code that runs outside Cloudflare, e.g. a local
dev script or an external uploader):** generate an R2 API token in the
Cloudflare dashboard (**R2 → Manage R2 API Tokens → Create token**). Save
the credentials as Wrangler secrets:

```bash
npx wrangler secret put R2_ACCOUNT_ID
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
```

Then `src/lib/server/r2.ts` instantiates `S3Client` against
`https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`.

### 8.3 Public access for the browser

By default R2 buckets are private. The browser fetches photos via
**presigned URLs** generated server-side in the load function (signed via
the binding's `createPresignedUrl` or the S3 SDK's `getSignedUrl`),
giving short-lived, scoped read access. This keeps blobs out of the
Worker's response stream — R2 serves them directly.

For a fully public bucket (e.g. publicly-visible asset photos that don't
need access control), enable public access on the bucket and serve
photos via `https://<bucket>.<account-id>.r2.dev/<key>` or a custom
domain.

---

## 9. Deployment & Costs

| Component        | Provider                  | Cost           | Notes                                               |
| ---------------- | ------------------------- | -------------- | --------------------------------------------------- |
| Database         | Neon Free Tier            | $0             | 0.5 GB storage, 1 project, 10 branches, autosuspend |
| Photo storage    | Cloudflare R2 Free Tier   | $0             | 10 GB storage, 1M Class-A ops/mo, free egress       |
| App hosting      | Cloudflare Workers Free   | $0             | 100k requests/day, SvelteKit adapter-cloudflare     |
| Scheduled jobs   | Cloudflare Cron Triggers  | $0             | Included with Workers                               |
| Basemap tiles    | tile.openstreetmap.org    | $0             | Fair-use policy applies                             |
| Field collection | KoboToolbox Community     | $0             | 5,000 submissions/month                             |
| Auth provider    | TBD (Auth.js / Lucia / …) | $0             | Free tier on most providers                         |
| Domain name      | Any registrar             | ~AUD 15/yr     | Optional but recommended                            |
| **Total**        |                           | **~AUD 15/yr** |                                                     |

For higher-scale deployments, a self-hosted PMTiles file on Cloudflare R2
(free egress) replaces the public tile server and removes fair-use concerns.

---

## 10. OSM Tagging Convention

Document this on the OSM Wiki and post to the imports mailing list
before adding `ref:community_asset` tags to any features.

### Tag schema

| Tag                         | Example                    | Purpose                       |
| --------------------------- | -------------------------- | ----------------------------- |
| `ref:community_asset`       | `MVC-0042`                 | Stable FK to local register   |
| `amenity`                   | `community_centre`         | Standard OSM feature type     |
| `operator`                  | `Tinonee Community Inc.`   | Who runs it                   |
| `operator:type`             | `community`                | Ownership category            |
| `community_centre`          | `village_hall`             | Subtype for community centres |
| `community_centre:for`      | `senior;youth`             | Target groups                 |
| `emergency`                 | `water_tank`               | Emergency asset type          |
| `capacity`                  | `10000`                    | Tank capacity in litres       |
| `phone`                     | `+61 2 6553 XXXX`          | Public contact only           |
| `website`                   | `https://tinonee.org.au`   | Public website only           |

### What NOT to tag in OSM

- Condition ratings (`condition=poor` — subjective, not verifiable)
- Internal contact details (personal mobiles, emails of individuals)
- Inspection dates or schedules
- Council asset register IDs (use your own `ref:` namespace instead)
- Vulnerability or sensitivity flags
- Programs, services, classes, or events (not physical features)

---

## 11. Governance Checklist

Before launch, document and agree on:

- [ ] **Data steward**: named person responsible for the register
- [ ] **Bus factor ≥ 3**: at least three people trained to maintain the system
- [ ] **Annual review cadence**: schedule for checking stale/outdated records
- [ ] **Succession plan**: who takes over if the steward leaves?
- [ ] **OSM wiki page**: documenting the `ref:community_asset` tag usage
- [ ] **Privacy policy**: what personal data is collected, where stored, who can access
- [ ] **License clarity**: ODbL for OSM layer, separate license for private data
- [ ] **Kobo form versioning**: how form changes are managed over time
- [ ] **Backup schedule**: Neon point-in-time restore (free tier retains 7 days of history) plus a periodic `pg_dump` to off-site storage; document the R2 bucket lifecycle policy for photos
- [ ] **Onboarding doc**: step-by-step for new community members
