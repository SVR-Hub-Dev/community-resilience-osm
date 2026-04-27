-- Stored query functions from architecture §3.3.
--
-- Defined as CREATE OR REPLACE so re-running migrate against a fresh
-- branch is idempotent. Spatial filtering happens here rather than in
-- Drizzle so the schema.ts file does not need to model PostGIS types.
-- Sensitivity filtering is a parameter — the SvelteKit server layer
-- decides who is allowed to see sensitive rows (architecture §3.2).
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION asset_summary()
RETURNS JSON
LANGUAGE sql STABLE
AS $$
    SELECT json_build_object(
        'total', (SELECT count(*) FROM asset),
        'by_type', (
            SELECT json_agg(row_to_json(t))
            FROM (
                SELECT asset_type_id, count(*) AS count
                FROM asset
                GROUP BY asset_type_id
            ) t
        ),
        'by_condition', (
            SELECT json_agg(row_to_json(c))
            FROM (
                SELECT condition, count(*) AS count
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
