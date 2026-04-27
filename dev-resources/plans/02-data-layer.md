# Plan: 02 — Data layer (Drizzle schema, PostGIS migrations, seed)

## Context

[01-foundations.md](01-foundations.md) installed the Drizzle / Neon / MapLibre dependency baseline and stubbed [src/lib/server/db.ts](../../src/lib/server/db.ts) as a request-scoped factory, but with no `schema` import. The data layer is now the blocker for every subsequent plan: the OSM sync (`05`), Kobo webhook, asset detail page, and bbox API endpoint all need the tables, the spatial index, and the three SQL functions defined in [community-asset-mapper-architecture.md](../architecture/community-asset-mapper-architecture.md) §3.1, §3.3, and §4.2. This plan lands the Drizzle schema, the raw-SQL PostGIS migration, the three stored functions, and a seed for `asset_type` — so plans 03+ can assume a working DB.

## Scope

- [src/lib/server/schema.ts](../../src/lib/server/schema.ts) — Drizzle declarations for `asset_type`, `asset` (non-spatial columns only), `inspection`, `photo`, `asset_contact`. `condition` CHECK constraints expressed via Drizzle's `check()` helper. Foreign keys, defaults, and timestamps mirror architecture §3.1 exactly.
- Raw SQL migration adding the PostGIS bits Drizzle deliberately does **not** model: `CREATE EXTENSION IF NOT EXISTS postgis`, the `geom GEOMETRY(Point, 4326)` column on `asset`, the `idx_asset_geom` GIST index, and the §4.2 `osm_sync_status` + `osm_last_synced` columns. Generated as a `--custom` Drizzle migration so the journal stays in sync.
- Raw SQL migration installing the three §3.3 functions (`assets_in_bbox`, `asset_detail`, `asset_summary`) using `CREATE OR REPLACE FUNCTION`, also as a `--custom` migration.
- [src/lib/server/db.ts](../../src/lib/server/db.ts) — wire `* as schema` into the `drizzle(neon(...), { schema })` call so `db.query.asset.findFirst(...)` works in callers.
- [src/lib/server/seed.ts](../../src/lib/server/seed.ts) — idempotent seed of `asset_type` rows (community_hall, fire_station, water_tank, bridge, defibrillator, evacuation_centre, playground, sports_field, social_service). `osm_tags` JSON matches the OSM tagging convention in architecture §10.
- [package.json](../../package.json) — `db:generate`, `db:migrate`, `db:push`, `db:seed` scripts. `seed` runs `tsx src/lib/server/seed.ts`.
- README chore: add a one-paragraph "Database setup" pointer covering `cp .dev.vars.example .dev.vars`, `CREATE EXTENSION postgis` in the Neon SQL Editor, and `npm run db:migrate && npm run db:seed`. (Carried over from the 01 follow-ups.)

## Out of scope

- R2 binding in [wrangler.jsonc](../../wrangler.jsonc) and `src/lib/server/r2.ts` — `03-photos.md`.
- Any `+server.ts` route or `+page.server.ts` load that *uses* the schema (bbox endpoint, `/asset/[ref]`) — `04-map-ui.md` and a later plan.
- Cron trigger and `/api/cron/sync-osm/+server.ts` — `05-osm-sync.md`. The `osm_sync_status` and `osm_last_synced` columns land here, but nothing populates them yet.
- Kobo webhook handler — its own plan; only the `inspection` and `photo` tables need to exist for it.
- Auth (`is_sensitive` filtering by role, `locals.user`) — deferred per architecture §3.2; ADR pending.
- Provisioning the Neon project itself and running `CREATE EXTENSION postgis` in the Neon SQL Editor — runbook step (mention in README), not code.
- Drizzle Studio config, RLS policies, or any per-row security — explicitly rejected by §3.2.

## Files touched

| File | Action | Notes |
| - | - | - |
| `src/lib/server/schema.ts` | new | Drizzle tables: `assetType`, `asset`, `inspection`, `photo`, `assetContact`. No `geom` column here — added via raw SQL migration |
| `src/lib/server/db.ts` | edit | `import * as schema from './schema'`; pass `{ schema }` to `drizzle()` so the typed query API is available |
| `src/lib/server/seed.ts` | new | tsx-runnable script; uses `getDb({ DATABASE_URL: process.env.DATABASE_URL! })`. Upserts `asset_type` rows via `onConflictDoUpdate` |
| `drizzle/0000_<name>.sql` | new (generated) | Output of `drizzle-kit generate` — the four non-spatial tables + indexes + check constraints |
| `drizzle/0001_postgis.sql` | new (custom) | `drizzle-kit generate --custom --name postgis`; hand-edited to add extension, `geom` column, GIST index, `osm_sync_status`, `osm_last_synced`. Header comment explains *why* it's raw |
| `drizzle/0002_functions.sql` | new (custom) | `drizzle-kit generate --custom --name functions`; hand-edited to contain the three §3.3 `CREATE OR REPLACE FUNCTION` bodies verbatim |
| `drizzle/meta/_journal.json` | edit (auto) | Updated by `drizzle-kit generate` for each of the three migrations above |
| `package.json` | edit | Add `tsx` to devDeps; add `db:generate` / `db:migrate` / `db:push` / `db:seed` scripts |
| `package-lock.json` | edit | Regenerated |
| `README.md` | edit | Append "Database setup" paragraph (3–5 lines). Carries over the README follow-up from plan 01 |

## Approach

**Why the geom column is split out.** Drizzle's `pg-core` does not have first-class PostGIS types; the workarounds (custom types, raw SQL columns inside `pgTable`) muddy the schema and round-trip poorly through `drizzle-kit generate`. The architecture is explicit: "PostGIS columns and GIST indexes use raw SQL migrations with a comment explaining why." `schema.ts` therefore declares `asset` *without* `geom`, and `0001_postgis.sql` adds `geom`, the GIST index, and the §4.2 sync columns. Server code that needs spatial filtering goes through the §3.3 stored functions (`assets_in_bbox`, etc.), which is the architecture's intended path anyway — Drizzle is for the relational columns; PostGIS is reached via `db.execute(sql\`...\`)`.

**Custom migrations vs. numbered raw files.** Earlier drafts considered dropping `0001_postgis.sql` into `drizzle/` by hand. That breaks `drizzle/meta/_journal.json` — the next `drizzle-kit generate` would skip the file or renumber on top of it. Using `drizzle-kit generate --custom --name postgis` creates a properly-journaled migration with an empty body that we then fill in. Same for `--name functions`.

**CHECK constraints.** Drizzle 0.30+ supports `check('condition_check', sql\`condition IN ('good','fair','poor','critical','unknown')\`)` inside the table builder's third argument. Asset and inspection have *different* allowed sets (asset adds `'unknown'`); preserve the distinction.

**Foreign keys.** `asset.assetTypeId` references `asset_type(id)`; `inspection.assetRef`, `photo.assetRef`, `assetContact.assetRef` reference `asset(ref)`; `photo.inspectionId` references `inspection(id)`. Default `onDelete` behaviour is `no action`, which matches the architecture's silence on cascades — explicit follow-up if we want `on delete cascade` for photos when an inspection is deleted.

**`getDb` signature change.** Adding `{ schema }` does not change the call site shape (`getDb(platform.env)`). The type of the returned client gains the `db.query.<table>` API. No callers exist yet, so no churn.

**Seed idempotency.** `INSERT ... ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, osm_tags = EXCLUDED.osm_tags, icon = EXCLUDED.icon, inspection_form = EXCLUDED.inspection_form;` — re-running the seed updates labels and icons without duplicating rows. `inspection_form` left null until Kobo form IDs are minted.

**Function file is concatenated, not split.** §3.3 has three functions; they could live in three files but `drizzle-kit` applies one `.sql` per migration. Concatenating them into `0002_functions.sql` is simplest and the file is still small (~60 lines). If they grow, splitting into per-function migrations is trivial later.

**Verification target is a Neon dev branch.** Don't run any of this against the production branch. Create a `dev` Neon branch via the dashboard or `neonctl branches create`, point `.dev.vars` `DATABASE_URL` at it, and run `db:migrate` + `db:seed` there. The runbook for promoting to the main branch belongs in `dev-resources/runbooks/` — out of scope for this plan but worth flagging.

## Verification

- `npx drizzle-kit generate` produces a clean migration file matching the architecture §3.1 columns; diff has zero unexpected `ALTER` or rename statements.
- `npx drizzle-kit generate --custom --name postgis` and `... --name functions` create stub files; after editing, `npx drizzle-kit migrate` against a Neon **dev branch** applies all three with no errors.
- `psql "$DATABASE_URL" -c "\d asset"` shows `geom geometry(Point,4326)` and `osm_sync_status text` columns plus the `idx_asset_geom` GIST index.
- `psql "$DATABASE_URL" -c "SELECT proname FROM pg_proc WHERE proname IN ('assets_in_bbox','asset_detail','asset_summary');"` returns three rows.
- `npm run db:seed` exits 0; re-running it exits 0 with no row-count change (idempotent).
- `psql "$DATABASE_URL" -c "SELECT count(*) FROM asset_type;"` returns 9 (the seeded types).
- `psql "$DATABASE_URL" -c "SELECT asset_summary();"` returns valid JSON with `total: 0` (no assets yet).
- `npm run check` (svelte-check + wrangler types) passes; the typed `db.query.asset` API resolves in TypeScript.
- `npm run lint` passes.
- `grep -r "process.env" src/` still only matches `seed.ts` (Node script) — never under `src/lib/server/db.ts` or any route.
- No browser-facing changes in this plan; nothing to verify in Playwright.

## Follow-ups

- **`/architecture-check`** run after this plan lands — confirm no drift between `schema.ts` and §3.1.
- **Runbook**: `dev-resources/runbooks/neon-branch-promotion.md` — document promoting schema from Neon dev branch to main, including the manual `CREATE EXTENSION postgis` if a fresh project. Currently the runbook directory is empty.
- **`asset_type` icon assets**: the `icon` column stores a name; the actual SVG/PNG files belong with the map UI (`04-map-ui.md`).
- **ADR candidate — `onDelete` policy**: should deleting an `asset` cascade to `inspection`, `photo`, `asset_contact`? Architecture is silent. Worth a one-page ADR before any UI exposes a delete button.
- **ADR candidate — `getDb` factory vs. `locals.db` in `hooks.server.ts`**: same follow-up as 01. After 03/04 land and we see how much `getDb(platform.env)` boilerplate accumulates, decide.
- **`03-photos.md`** unblocked by this plan: `photo` table exists, R2 binding next.
- **`05-osm-sync.md`** unblocked: `osm_sync_status` / `osm_last_synced` columns exist for the cron job to populate.
