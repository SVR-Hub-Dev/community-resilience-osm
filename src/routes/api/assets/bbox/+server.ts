import { json, error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { toGeoJSON, type BboxRow } from '$lib/utils/bbox';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, platform }) => {
	const w = Number(url.searchParams.get('w'));
	const s = Number(url.searchParams.get('s'));
	const e = Number(url.searchParams.get('e'));
	const n = Number(url.searchParams.get('n'));
	if ([w, s, e, n].some(Number.isNaN)) throw error(400, 'bad bbox');

	const db = getDb(platform!.env);

	// Project lat/lon out so the heavy `geom` blob never crosses the wire.
	// COALESCE handles both pre-sync (geom only) and post-sync (cached lon/lat)
	// rows. `is_sensitive` is filtered inside assets_in_bbox via the FALSE arg
	// — flip to a session-derived flag once auth lands.
	const rows = (await db.execute(sql`
		SELECT
			ref,
			name,
			asset_type_id,
			condition,
			COALESCE(osm_lat, ST_Y(geom)) AS lat,
			COALESCE(osm_lon, ST_X(geom)) AS lon
		FROM assets_in_bbox(${w}, ${s}, ${e}, ${n}, FALSE)
	`)) as unknown as BboxRow[];

	return json(toGeoJSON(rows), {
		headers: { 'cache-control': 'private, max-age=30' }
	});
};
