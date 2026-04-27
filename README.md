# Community Asset Mapper

A web app for browsing and managing community-owned assets — halls, fire stations, water tanks, defibrillators, evacuation centres, playgrounds, and the like. Public, verifiable physical attributes live in [OpenStreetMap](https://www.openstreetmap.org/); operational data (condition, inspections, contacts, photos) lives in a private Neon Postgres + PostGIS store.

> Status: early scaffolding. The architecture is fixed; the implementation is being built phase by phase under [dev-resources/plans/](dev-resources/plans/).

## Strategy

The split is deliberate:

- **OSM is the geographic commons.** Location, type, name, and operator are the kind of facts the rest of the world benefits from knowing, and OSM already hosts them under a permanent, replicated, ODbL-licensed store. We tag community assets with a stable `ref:community_asset` reference (e.g. `MVC-0042`) so OSM element churn (splits, merges, redactions) doesn't break the link.
- **Neon holds what OSM must not.** Condition ratings, inspection history, internal contacts, sensitivity flags, council asset register IDs — none of that is appropriate for a public, permanently-versioned database. It lives in Neon, keyed by the same `ref`.
- **R2 holds the photos.** Photo blobs are served via presigned URLs; they never stream through the Worker response.
- **KoboToolbox feeds the field.** Surveys and inspections are captured offline on mobile, then posted to a SvelteKit webhook that writes to Neon and R2.

Full rationale, schema, and integration patterns: [dev-resources/architecture/community-asset-mapper-architecture.md](dev-resources/architecture/community-asset-mapper-architecture.md). Background research: [dev-resources/research/osm-feasibility-study.md](dev-resources/research/osm-feasibility-study.md). Why Neon over Supabase: [dev-resources/decisions/0001-neon-over-supabase.md](dev-resources/decisions/0001-neon-over-supabase.md).

## Stack

- **SvelteKit** (Svelte 5, runes mode) on **Cloudflare Workers** via [`@sveltejs/adapter-cloudflare`](https://kit.svelte.dev/docs/adapter-cloudflare).
- **Neon Postgres + PostGIS** via the [`@neondatabase/serverless`](https://github.com/neondatabase/serverless) HTTP driver. Drizzle ORM for schema and queries.
- **Cloudflare R2** via Worker binding (`platform.env.PHOTOS_BUCKET`) for photo storage; presigned URLs for delivery.
- **MapLibre GL JS** for the map UI; OSM raster tiles or self-hosted PMTiles.
- **KoboToolbox** for offline field capture, syncing through a SvelteKit webhook route.
- **Cloudflare Cron Triggers** for the weekly OSM sync.

The Workers runtime imposes hard constraints: no Node TCP, no native modules, no module-scope DB clients, no `process.env` outside server modules. See [CLAUDE.md](CLAUDE.md) for the full list.

## Layout

```text
src/
  lib/
    server/                 # server-only — Neon client, schema, webhooks. Never import from client code.
    assets/                 # static assets imported by Svelte
  routes/                   # SvelteKit routes (+page.svelte, +page.server.ts, +server.ts)
drizzle/                    # generated migrations + raw SQL for PostGIS functions
dev-resources/              # architecture, plans, decisions, runbooks, research
  architecture/             # source-of-truth design doc
  plans/                    # one plan per PR-sized phase
  decisions/                #  Architecture Decision Records (ADRs) — immutable once accepted
  runbooks/                 # operational how-tos
  research/                 # feasibility studies, prior art
.claude/
  agents/                   # osm-tagger, drizzle-migrator, cf-worker-reviewer, postgis-spatial
  commands/                 # /overpass, /new-asset-type, /sync-status, /architecture-check, /migration
wrangler.jsonc              # Cloudflare Workers config
svelte.config.js            # adapter + runes mode
```

## Development

```sh
npm install
npm run dev              # vite dev server
npm run dev -- --open    # ...and open the browser
```

Other scripts:

| Command           | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `npm run build`   | `wrangler types --check && vite build` — produces the Worker bundle. |
| `npm run preview` | Serves the built Worker locally via `wrangler dev`.                  |
| `npm run check`   | Wrangler types + svelte-check.                                       |
| `npm run lint`    | Prettier + ESLint.                                                   |
| `npm run test`    | Vitest (unit + component via `vitest-browser-svelte`).               |
| `npm run format`  | Prettier write.                                                      |
| `npm run gen`     | Regenerate Worker binding types from `wrangler.jsonc`.               |

End-to-end map interactions are exercised with `npx playwright test`.

### Environment

Server-side secrets (Neon connection string, Kobo webhook secret) come from `$env/dynamic/private` in server modules. Worker bindings (R2 bucket, future KV / Durable Objects) come from `platform.env.*`. The Neon `DATABASE_URL` must never reach the client bundle — `src/lib/server/` enforces this at build time.

### Database setup

```sh
cp .dev.vars.example .dev.vars   # then fill in DATABASE_URL pointing at your Neon dev branch
```

Once in the [Neon SQL Editor](https://console.neon.tech), enable PostGIS on the target branch:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

Then apply migrations and seed the `asset_type` rows:

```sh
npm run db:migrate
npm run db:seed
```

`db:push` is available for rapid iteration in development, but `db:migrate` against committed migration files is the standard path. See [dev-resources/plans/02-data-layer.md](dev-resources/plans/02-data-layer.md) for context.

## Data discipline

These rules are non-negotiable:

- No condition ratings, internal contacts, sensitivity flags, or council asset register IDs in OSM.
- No personal phone numbers or individuals' email addresses in OSM.
- No bulk imports to OSM without going through the [Imports process](https://wiki.openstreetmap.org/wiki/Import) (wiki page, mailing list, license review).
- No `DATABASE_URL` exposed to the client.

## Contributing

1. Read [dev-resources/architecture/community-asset-mapper-architecture.md](dev-resources/architecture/community-asset-mapper-architecture.md). Any deviation requires an ADR under [dev-resources/decisions/](dev-resources/decisions/).
2. Plans live in [dev-resources/plans/](dev-resources/plans/), numbered `01-foundations.md`, `02-data-layer.md`, etc. One plan = one PR-sized chunk. Use [`_template.md`](dev-resources/plans/_template.md) for new plans.
3. Run `npm run check && npm run lint && npm run test` before opening a PR.
