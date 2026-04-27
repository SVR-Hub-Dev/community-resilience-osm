# Claude.md

## Project Configuration

- **Language**: TypeScript
- **Package Manager**: npm
- **Add-ons**: prettier, eslint, vitest, tailwindcss, sveltekit-adapter, mcp

## Project: Community Asset Mapper

A SvelteKit on Cloudflare Workers app for browsing and managing community-owned assets. Public, verifiable physical attributes live in OpenStreetMap; operational data (condition, inspections, contacts, photos) lives in a private Neon Postgres + PostGIS store. Photos in Cloudflare R2. KoboToolbox feeds field surveys via a webhook bridge.

**Source of truth: [dev-resources/architecture/community-asset-mapper-architecture.md](dev-resources/architecture/community-asset-mapper-architecture.md).** Any deviation from it requires an ADR under [dev-resources/decisions/](dev-resources/decisions/).

### Stack snapshot

- Svelte 5 **runes mode** (forced via [svelte.config.js](svelte.config.js) compiler option).
- `@sveltejs/adapter-cloudflare` → Cloudflare Workers (config in [wrangler.jsonc](wrangler.jsonc)).
- Drizzle ORM + `@neondatabase/serverless` (HTTP driver) for Neon Postgres + PostGIS.
- MapLibre GL JS for the map UI; OSM raster tiles or self-hosted PMTiles.
- Cloudflare R2 via Worker binding (`platform.env.PHOTOS_BUCKET`) for photo blobs.
- KoboToolbox → SvelteKit webhook → Neon + R2.

### Cloudflare Workers gotchas — non-negotiable

- **No Node TCP, no native modules.** Forbidden: `pg`, `node-postgres`, anything depending on `net`/`tls`. Use `@neondatabase/serverless` (HTTP) for Neon; WebSocket subdriver only for transactions / LISTEN.
- **No `process.env` outside server modules.** Use `$env/dynamic/private` in `+server.ts` and `+page.server.ts`; use `platform.env.*` for Worker bindings.
- **Database clients are request-scoped.** Never instantiate the Neon client at module top level — Workers reuse module scope across requests.
- **R2 binding inside the Worker, S3 SDK outside.** Photos never flow through the Worker response stream — return presigned URLs.

### Server-only boundary

Anything under [src/lib/server/](src/lib/server/) must never be imported from `+page.svelte` or any client component. The Neon connection string is server-only forever. SvelteKit will throw at build time, but flag any leak earlier in review.

### Drizzle workflow

- Schema source of truth: `src/lib/server/schema.ts` (mirrors §3 SQL in the architecture doc).
- `drizzle-kit push` for rapid local iteration; `drizzle-kit generate` + `migrate` once stable.
- The three SQL functions (`assets_in_bbox`, `asset_detail`, `asset_summary`) live as plain `.sql` files in `drizzle/` and are applied alongside table migrations — they are **not** expressed through Drizzle.
- PostGIS columns and GIST indexes use raw SQL migrations with a comment explaining why.

### Test commands

- `npm run check` — wrangler types + svelte-check.
- `npm run lint` — prettier + eslint.
- `npm run test` — vitest (unit + component via `vitest-browser-svelte`).
- `npx playwright test` — for end-to-end map interactions.

### Don'ts (data discipline)

- Never put condition ratings, internal contacts, sensitivity flags, or council asset register IDs in OSM. These live in Neon only.
- Never expose `DATABASE_URL` to the client.
- Never write personal phone numbers or individuals' emails to OSM.
- Never bulk-add features to OSM without going through the Imports process (wiki page, mailing list, license review).

### Skills relevance

- The **svelte MCP is mandatory** for any Svelte component work (see "Available Svelte MCP Tools" below).
- `vercel:*` skills are **not applicable** — this project is on Cloudflare Workers, not Vercel.
- `supabase:*` skills are **not applicable** — this project uses Neon, not Supabase.
- `frontend-design:frontend-design` is useful when polishing the map UI.
- `/security-review` before merging any auth or webhook code.

### Custom subagents and slash commands

- Subagents (in [.claude/agents/](.claude/agents/)): `osm-tagger`, `drizzle-migrator`, `cf-worker-reviewer`, `postgis-spatial`.
- Slash commands (in [.claude/commands/](.claude/commands/)): `/overpass`, `/new-asset-type`, `/sync-status`, `/architecture-check`, `/migration`.

### Planning workflow

Phase-scoped plans live in [dev-resources/plans/](dev-resources/plans/) numbered `01-foundations.md`, `02-data-layer.md`, etc. Each plan is one PR-sized chunk. Use `dev-resources/plans/_template.md` for new plans. ADRs in [dev-resources/decisions/](dev-resources/decisions/), runbooks in [dev-resources/runbooks/](dev-resources/runbooks/).

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available MCP servers

Configured in [.mcp.json](.mcp.json):

- **svelte** — Svelte 5 + SvelteKit docs (see tools below).
- **context7** — up-to-date docs for arbitrary libraries (Drizzle, MapLibre, Neon driver, AWS SDK).
- **playwright** — drives a real browser for map UI verification.
- **neon** — query the live Neon project once provisioned.
- **cloudflare-workers-bindings** — manage Workers config, R2 buckets, secrets.
- **cloudflare-workers-observability** — Workers logs and telemetry.

The remote Cloudflare and Neon MCPs require OAuth on first use.

## Available Svelte MCP Tools

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.
