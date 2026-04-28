# Plan: 04 — Map UI (browse view, bbox API, asset detail page)

## Context

After plans [01](01-foundations.md) – [03](03-photos.md) the app has a request-scoped Drizzle/Neon client, the schema with PostGIS and the three §3.3 functions, and a server-only R2 helper that signs photo URLs. Nothing renders any of it: [src/routes/+page.svelte](../../src/routes/+page.svelte) is still the SvelteKit "Welcome" placeholder, and there is no browser path to view an asset. This plan delivers the minimum end-to-end browse experience the architecture commits to in §5 and §5.2 — a MapLibre map of community assets sourced from the `assets_in_bbox` function via a thin server endpoint, plus a detail route at `/asset/[ref]` that calls `asset_detail` and renders the Neon-side attributes alongside signed R2 photo URLs. Editing, the OSM-sourced overlay, contacts, inspection history, and authentication are deliberately out of scope so the diff stays reviewable.

## Scope

- [src/routes/+page.svelte](../../src/routes/+page.svelte) — replace the welcome placeholder with the map shell. Imports `AssetMap`, fills the viewport, renders attribution.
- [src/lib/components/map/AssetMap.svelte](../../src/lib/components/map/AssetMap.svelte) — MapLibre map component (Svelte 5 runes). Loads MapLibre client-side only (`onMount`-gated dynamic import or `if (browser)` guard), renders OSM raster tiles per architecture §5.2, fetches GeoJSON from `/api/assets/bbox` on `load` and on `moveend` (debounced), draws clustered + condition-coloured circle layers, and routes to `/asset/<ref>` on marker click.
- [src/routes/api/assets/bbox/+server.ts](../../src/routes/api/assets/bbox/+server.ts) — `GET` endpoint. Validates `w/s/e/n` query params, calls `assets_in_bbox(w, s, e, n, FALSE)` via `db.execute(sql\`...\`)`, projects`lat`/`lon`(see Approach), returns a GeoJSON`FeatureCollection`.`includeSensitive`is hard-coded`FALSE` until the auth ADR lands.
- [src/lib/utils/bbox.ts](../../src/lib/utils/bbox.ts) — pure helpers: `toGeoJSON(rows)` (row → Feature mapping) and `boundsToParams(bounds)` (MapLibre `LngLatBounds` → `URLSearchParams`). Pure functions with unit tests; no SvelteKit imports.
- [src/routes/asset/[ref]/+page.server.ts](../../src/routes/asset/%5Bref%5D/+page.server.ts) — `load` runs `SELECT asset_detail(${ref}) AS detail`, throws `404` on miss, signs each `photo.storage_path` via `getPresignedPhotoUrl(env, key, 300)` from [src/lib/server/r2.ts](../../src/lib/server/r2.ts), and returns the shape the page expects.
- [src/routes/asset/[ref]/+page.svelte](../../src/routes/asset/%5Bref%5D/+page.svelte) — page wrapper that renders `<AssetPanel data={data} />`.
- [src/lib/components/asset/AssetPanel.svelte](../../src/lib/components/asset/AssetPanel.svelte) — Neon-only panel for the MVP: name, condition badge, last-inspected date, access notes, council ref, photo gallery. The §5.1 mock-up's "Public Record (from OSM)" section, contacts, and inspection history are stubbed with comment markers but not implemented — they are dependent plans.
- [src/lib/components/asset/PhotoGallery.svelte](../../src/lib/components/asset/PhotoGallery.svelte) — minimal grid of `<img>` tags fed by the signed URLs from the load function. No upload UI.
- [src/lib/components/map/AssetMap.svelte.test.ts](../../src/lib/components/map/AssetMap.svelte.test.ts) — vitest-browser-svelte smoke test: component mounts without throwing, the map container element exists. (MapLibre's heavy WebGL is mocked-out via the same dynamic-import guard the component uses.)
- [src/lib/utils/bbox.test.ts](../../src/lib/utils/bbox.test.ts) — vitest unit coverage for `toGeoJSON` and `boundsToParams`.
- [package.json](../../package.json) — no new runtime deps. `maplibre-gl` and `@types/geojson` (transitive) already arrived in plan 01; if `@types/geojson` is not transitively available, add it as a devDep.

## Out of scope

- **OSM-sourced overlay and the §5.1 "Public Record" panel block.** Pulling OSM tags into the detail view requires an Overpass client (`src/lib/server/overpass.ts`) and a small caching layer; that belongs in `05-osm-sync.md` or a sibling plan focussed on Overpass.
- **Authentication** (`locals.user`, `is_sensitive` toggling). Architecture §3.2 leaves the provider TBD. Until that ADR lands, the bbox endpoint passes `FALSE` for `p_include_sensitive`; the detail page returns 404 for sensitive rows by virtue of the function never selecting them.
- **Inspection history component** (`InspectionHistory.svelte`) and **contact list** (`ContactList.svelte`). The data is in the `asset_detail` payload but rendering it cleanly needs design decisions (collapse vs. timeline, public vs. private contact gating). Defer to a UX-polish plan.
- **AssetForm / new-asset wizard / OSM link wizard** — separate plan; needs an editor role.
- **LayerControl / toggle asset types** — separate plan; comes after we have multiple asset types on the map.
- **Dashboard route** (`/dashboard`) — uses `asset_summary()`; small but conceptually a different surface.
- **Vector tiles / PMTiles**. The architecture allows both raster and PMTiles; we ship raster (free, immediate). Self-hosted PMTiles is a perf upgrade tracked as a follow-up.
- **Photo upload UI** — Kobo is the MVP ingestion path. Browser-direct uploads via a presigned PUT are a later enhancement (noted in plan 03's follow-ups).
- **`AssetMap` polish**: cluster expansion animations, hover tooltips, marker icons (currently coloured circles), accessibility audit. MVP is "renders, clicks navigate" — visual polish lands later.
- **Map state stores** (`src/lib/stores/map.ts`, `assets.ts`). Architecture lists them under `lib/stores/` but for one map page Svelte 5 component-local state is enough; promote to a store once a second consumer appears.

## Files touched

| File                                             | Action | Notes                                                                                                                                                                                                             |
| ------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/+page.svelte`                        | edit   | Replace welcome text with full-viewport `<AssetMap />`; add OSM attribution `<small>` per tile-server fair-use.                                                                                                   |
| `src/lib/components/map/AssetMap.svelte`         | new    | Svelte 5 runes; `$state` for the map instance; `onMount` does the dynamic import of `maplibre-gl` + `'maplibre-gl/dist/maplibre-gl.css'`. Marker click → `goto(\`/asset/\${ref}\`)`.                              |
| `src/lib/components/map/AssetMap.svelte.test.ts` | new    | Smoke test via `vitest-browser-svelte`; ~15 lines.                                                                                                                                                                |
| `src/routes/api/assets/bbox/+server.ts`          | new    | `GET` returning `FeatureCollection`. Uses `getDb(platform!.env)` from plan 02; `db.execute(sql\`...\`)`against`assets_in_bbox`. Returns`400`on bad bbox,`200`with`Cache-Control: private, max-age=30` on success. |
| `src/lib/utils/bbox.ts`                          | new    | `toGeoJSON(rows): FeatureCollection` and `boundsToParams(bounds): URLSearchParams`. Pure.                                                                                                                         |
| `src/lib/utils/bbox.test.ts`                     | new    | Vitest unit coverage for both helpers.                                                                                                                                                                            |
| `src/routes/asset/[ref]/+page.server.ts`         | new    | `load` uses `db.execute(sql\`SELECT asset_detail(${ref}) AS detail\`)`; signs each photo's`storage_path`via`getPresignedPhotoUrl`. Throws`error(404)` on missing asset.                                           |
| `src/routes/asset/[ref]/+page.svelte`            | new    | 5-line wrapper rendering `<AssetPanel data={data} />`.                                                                                                                                                            |
| `src/lib/components/asset/AssetPanel.svelte`     | new    | Neon-only panel. Comment markers `<!-- TODO(05): OSM section -->` and `<!-- TODO: contacts / history -->` flag deliberate gaps.                                                                                   |
| `src/lib/components/asset/PhotoGallery.svelte`   | new    | Grid of `<img>` with `loading="lazy"` and signed-URL `src`. Captions if present.                                                                                                                                  |
| `package.json` / `package-lock.json`             | edit   | Only if `@types/geojson` isn't already transitive — verify with `npm ls @types/geojson` before installing.                                                                                                        |

## Approach

**MapLibre is browser-only; SSR must not import it.** SvelteKit renders the page server-side first; importing `maplibre-gl` at module top level in `AssetMap.svelte` would crash SSR (it touches `window`). Two viable patterns: dynamic `import('maplibre-gl')` inside `onMount`, or guard with `if (browser)` from `$app/environment`. We use `onMount` + dynamic import — it keeps the maplibre bundle out of the SSR-rendered HTML and gives us a clean place to do `map.on('load', ...)` and `onDestroy(() => map.remove())`. The Svelte MCP `svelte-autofixer` will be run against the component before commit.

**`assets_in_bbox` returns `SETOF asset` — including `geom`.** The `geom` column comes back over the Neon HTTP wire as a hex-encoded WKB blob, which is awkward to feed to GeoJSON and bloats the response. Solve in SQL: the bbox endpoint's `db.execute` selects an explicit projection — `SELECT ref, name, asset_type_id, condition, COALESCE(osm_lat, ST_Y(geom)) AS lat, COALESCE(osm_lon, ST_X(geom)) AS lon FROM assets_in_bbox($1,$2,$3,$4,FALSE)`. This keeps the function as architected (returns full rows for callers that need them — e.g. the eventual asset_detail panel won't go through it) while giving the map endpoint exactly what it needs. `COALESCE` covers the pre-sync case where `osm_lat`/`osm_lon` are null but `geom` was set by manual entry, and the post-sync case where the cached lon/lat are authoritative.

**`includeSensitive` is hard-coded `FALSE` for now.** Architecture §3.2 explicitly defers auth, and the plan-03 follow-up "ADR — public bucket vs. presigned URLs" is intentional: short-lived signed URLs are still safe even when handed to an unauthenticated viewer of a non-sensitive asset. The day the auth ADR lands, the bbox endpoint flips to read `locals.user?.role` (the §5.2 example already shows this) — a one-line change confined to this file. No premature shape needed today.

**Detail page uses the §3.3 function, not table queries.** Tempting to bypass `asset_detail()` and use Drizzle's `db.query.asset.findFirst({ with: { inspections, photos, contacts } })` for type safety, but the architecture is explicit about consolidating reads into the SQL function (single round-trip, server-side aggregation, future RLS hook). Pay the typing cost: the load function declares an inline `type AssetDetail = { asset: ...; ... }` matching the function's `json_build_object` shape. If this typing duplication grows, follow up with a generated type from a small Zod / valibot schema.

**Photo signing happens in the load function, never the client.** Per architecture §5.1, the `photos` array on `data` arrives at the page already containing presigned URLs. The `PhotoGallery` component is a pure renderer — it never imports anything from `$lib/server/`. TTL is 300s (matching plan 03's default); for a slow-loading detail page that is more than enough, and a leaked URL is harmless within 5 minutes.

**Marker click → page navigation.** Architecture §5.1 sketches a slide-over panel and the `AssetPanel` lives under `lib/components/asset/`, but the component tree also has `routes/asset/[ref]/+page.svelte`. We commit to navigation: clicking a marker calls `goto('/asset/' + ref)`. Reasons: (1) URL-shareable detail view, (2) decouples panel UI from map state, (3) plays nicely with browser back-button, (4) `AssetPanel` is reused — same component, different host (route page now, slide-over later). Slide-over can be added in a UX plan without touching the data layer.

**Map page is unauthenticated.** No `locals.user` check yet. The bbox endpoint already filters sensitive rows out of the response. The detail page's `404` for missing-or-sensitive assets is correct behaviour for an unauthenticated viewer regardless of which axis the row was filtered on.

**Component tests stay shallow.** `AssetMap.svelte` is hard to test deeply without MapLibre running in a real browser context (which `vitest-browser-svelte` does provide via Playwright). The smoke test only confirms the component mounts and renders its container `<div>`. Real interaction coverage moves to Playwright once a `playwright/` E2E suite is added — flagged as a follow-up.

**No `process.env` introduced.** All server modules read from `platform.env` (passed into `getDb` and `getPresignedPhotoUrl`). The verification step re-runs the boundary check.

## Verification

- `npm run check` — 0 errors, 0 warnings; `App.PageData` types resolve for the detail route.
- `npm run lint` — clean.
- `npm run test` — server project: new `bbox.test.ts` passes; client project: `AssetMap.svelte.test.ts` mounts the component without throwing. Existing `r2.test.ts` and `vitest-examples` still pass.
- `npm run dev`, browser at `/`:
  - Map loads with OSM tiles; attribution `© OpenStreetMap contributors` visible.
  - Network panel shows a single `GET /api/assets/bbox?w=...&s=...&e=...&n=...` per viewport change (debounced).
  - With seeded asset rows in Neon (a test row added manually for this verification), at least one circle renders; clicking it navigates to `/asset/<ref>`.
  - Detail page renders the asset name, condition badge, and (if a `photo` row exists with a real R2 object) the image loads from the signed URL — the `<img>` `src` is an `r2.cloudflarestorage.com` URL with `X-Amz-Signature` query params.
  - 404 page for `/asset/DOES-NOT-EXIST`.
- `grep -rn "process.env\|@aws-sdk" src/` — `@aws-sdk` still only under `src/lib/server/`; `process.env` still only in `seed.ts`.
- `grep -rn "from '\$lib/server" src/lib/components src/routes/+page.svelte src/lib/components` — zero hits (server boundary intact).
- `wrangler dev --remote` smoke: bbox endpoint returns `200` with valid GeoJSON; detail endpoint returns signed URLs that 200 when fetched.

## Follow-ups

- **OSM Overpass overlay** — `05-osm-sync.md` (or a dedicated `04b-osm-overlay.md`) brings in `src/lib/server/overpass.ts`, the §5.1 "Public Record" panel section, and `OsmFeatureLayer.svelte`. Unblocked once Overpass is wired.
- **Auth ADR + `is_sensitive` gating** — flip `includeSensitive` from `FALSE` to `locals.user?.role`-based once auth lands. One-line change in `+server.ts`.
- **InspectionHistory + ContactList components** — UX-polish plan after auth (contact visibility depends on role).
- **AssetForm / OSM link wizard / new-asset route** — editor-mode plan; needs auth.
- **PMTiles upgrade** — runbook + plan to host an Australia PMTiles file on R2 (free egress) and switch the `style.sources` block; removes OSM tile-server fair-use exposure as the user base grows.
- **Playwright E2E** — once a `playwright/` directory is set up, add a real browser test for "load map → click marker → see detail page → photo loads". Pulls component testing out of `vitest-browser-svelte` for the map specifically.
- **Map state store** — once a second consumer of "current viewport / selected asset" appears (e.g. dashboard with a map preview), promote to `src/lib/stores/map.ts`.
- **Caching the bbox response** — currently `Cache-Control: private, max-age=30`. Once we have a clearer read pattern, consider the Cloudflare Cache API + a tag-based invalidation hook from the OSM sync. Not blocking.
- **Performance budget for cold-start** — the maplibre bundle is ~600 KB. Acceptable for desktop; revisit for mobile / regional connections. Track as a separate issue.
