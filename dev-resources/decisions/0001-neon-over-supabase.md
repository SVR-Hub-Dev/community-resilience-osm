# 0001 — Neon Postgres over Supabase

- **Status:** accepted
- **Date:** 2026-04-27
- **Deciders:** Alan Keown

## Context

The architecture (see [community-asset-mapper-architecture.md](../architecture/community-asset-mapper-architecture.md) §3 and §7) requires a Postgres + PostGIS store accessible from SvelteKit running on Cloudflare Workers, holding operational data joined to OSM via `ref:community_asset`. The two leading free-tier hosted Postgres options are Neon and Supabase. Both ship PostGIS preinstalled.

## Decision

We use **Neon Postgres** with the PostGIS extension as the primary operational store, accessed via `@neondatabase/serverless` (HTTP driver) wrapped by Drizzle ORM. Cloudflare R2 holds photo blobs separately.

## Alternatives considered

- **Supabase** — bundles Postgres + PostGIS + Auth + Storage + RLS in one product. Rejected because (a) the architecture defers auth and uses server-layer access control rather than RLS — Supabase's RLS-centric model would be unused weight; (b) Cloudflare R2 with the Worker binding has zero-cost egress and no signing overhead inside the Worker, beating Supabase Storage for the photo path; (c) the Neon HTTP driver is purpose-built for the Workers' fetch-only environment, while Supabase's pg-based client needs the WebSocket fallback which adds latency and complexity.
- **Self-hosted Postgres on a VPS** — full control but requires a paid VM, monitoring, backup management, and one more thing to maintain. Rejected on bus-factor and total-cost-of-ownership grounds.
- **Cloudflare D1** — same network as the Worker, but D1 is SQLite without PostGIS. Rejected: PostGIS spatial indexing is core to the bbox query path.

## Consequences

- **Positive:** zero hosting cost on the free tier (0.5 GB storage, 10 branches, autosuspend); HTTP driver works natively inside Workers; PostGIS GIST indexes available; clean separation between database (Neon) and blob storage (R2) matches the architecture's concerns.
- **Negative:** ~1–2 s cold-start after autosuspend (first request after ~5 min idle); no integrated auth — auth provider remains TBD and must be wired separately (deferred to phase 7).
- **Reversibility:** moderate. The schema is plain SQL with PostGIS, portable to any Postgres host. Migration cost is dominated by re-pointing `DATABASE_URL` and re-running `drizzle-kit migrate`.

## References

- Architecture doc §3 (schema), §7 (Neon setup).
- [Neon docs — serverless driver](https://neon.tech/docs/serverless/serverless-driver).
- Sister project `community-resilience-mvp` uses the same Neon-on-free-tier pattern.
