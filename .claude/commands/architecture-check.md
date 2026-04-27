---
description: Diff the current code against the architecture doc and flag drift.
---

Audit the codebase against `dev-resources/architecture/community-asset-mapper-architecture.md`.

Check each of these architectural invariants and report any violation with file:line:

1. **Server-only boundary** — search for imports of `$lib/server/*` from any file under `src/routes/**/*.svelte` or `src/lib/components/**`. Any hit is a leak.
2. **No client-side `DATABASE_URL`** — search for `DATABASE_URL` in `src/**` excluding `src/lib/server/**`, `src/routes/**/+server.ts`, and `+page.server.ts`. Any hit is a leak.
3. **Module-scope DB clients** — grep for `drizzle(neon(` at module top level (not inside a function/handler). Workers reuse module scope; the client must be request-scoped.
4. **R2 binding usage** — any photo-serving code path that reads R2 bytes into the Worker response (rather than returning a presigned URL) violates §5.1.
5. **Cron / webhook auth** — every route under `src/routes/api/cron/**` and `src/routes/api/kobo-webhook/**` must check a shared secret header before doing work.
6. **Sensitive data in OSM** — search the codebase for any code that writes `condition`, `is_sensitive`, internal contacts, or council asset register IDs to the OSM API. None of these belong in OSM.
7. **`ref:community_asset` convention** — any OSM write code must use this tag key, not `ref=` or other variants.
8. **Schema drift** — diff `src/lib/server/schema.ts` against the SQL in §3 of the architecture; any column missing or type-mismatched is drift.

For each violation, output: file:line, the rule violated (with §reference), and the suggested fix. If everything passes, say "no drift detected" — don't pad the report.
