---
description: Report Neon `osm_sync_status` distribution and list unlinked / orphaned assets.
---

Report on OSM ↔ Neon sync state.

Steps:

1. Use the Neon MCP (or `psql` with `$DATABASE_URL` from `.dev.vars`) to run:
   ```sql
   SELECT osm_sync_status, count(*)
   FROM asset
   GROUP BY osm_sync_status
   ORDER BY count DESC;
   ```

2. Run:
   ```sql
   SELECT ref, name, osm_sync_status, osm_last_synced
   FROM asset
   WHERE osm_sync_status IN ('unlinked','stale','orphaned')
   ORDER BY osm_last_synced ASC NULLS FIRST
   LIMIT 50;
   ```

3. Format the output as:
   - **Summary:** counts table.
   - **Action items:** grouped by status — `unlinked` (need OSM features created or matched), `stale` (sync ran but tags drifted), `orphaned` (OSM has the ref tag but Neon has no row).

4. If the cron has not run in >7 days (compare `MAX(osm_last_synced)` to `now()`), flag it.

If the Neon MCP is unavailable, fall back to `wrangler d1` or `psql` with the connection string from `.dev.vars`. Never log the connection string.
