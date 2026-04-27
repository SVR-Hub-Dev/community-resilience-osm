-- PostGIS support for the asset table.
--
-- Drizzle does not model PostGIS types directly, so the spatial column,
-- the GIST index, and the §4.2 sync-status columns live here as raw SQL
-- (per architecture §3 and CLAUDE.md). Spatial reads go through the
-- stored functions in 0002_functions.sql; they do not round-trip
-- through schema.ts.
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "geom" geometry(Point, 4326);
--> statement-breakpoint
CREATE INDEX "idx_asset_geom" ON "asset" USING GIST ("geom");
--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "osm_sync_status" text DEFAULT 'unlinked';
--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_osm_sync_status_check" CHECK ("osm_sync_status" IN ('linked','unlinked','stale','orphaned'));
--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "osm_last_synced" timestamp with time zone;
