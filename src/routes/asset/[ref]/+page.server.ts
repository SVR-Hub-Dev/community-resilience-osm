import { error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { getPresignedPhotoUrl } from '$lib/server/r2';
import type { PageServerLoad } from './$types';

interface AssetRow {
	ref: string;
	asset_type_id: string;
	name: string;
	description: string | null;
	osm_element: string | null;
	osm_lat: number | null;
	osm_lon: number | null;
	owner: string | null;
	operator_contact: string | null;
	condition: string | null;
	condition_date: string | null;
	access_notes: string | null;
	council_ref: string | null;
	is_sensitive: boolean;
}

interface InspectionRow {
	id: string;
	asset_ref: string;
	inspected_at: string;
	inspector: string | null;
	condition: string | null;
	notes: string | null;
}

interface ContactRow {
	id: string;
	asset_ref: string;
	role: string;
	name: string | null;
	phone: string | null;
	email: string | null;
	is_public: boolean;
}

interface PhotoRow {
	id: string;
	asset_ref: string | null;
	inspection_id: string | null;
	storage_path: string;
	caption: string | null;
	taken_at: string | null;
}

interface AssetDetail {
	asset: AssetRow | null;
	latest_inspection: InspectionRow | null;
	inspections: InspectionRow[] | null;
	contacts: ContactRow[] | null;
	photos: PhotoRow[] | null;
}

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = getDb(platform!.env);

	const result = (await db.execute(
		sql`SELECT asset_detail(${params.ref}) AS detail`
	)) as unknown as { detail: AssetDetail | null }[];

	const detail = result[0]?.detail;
	if (!detail?.asset) throw error(404, 'Asset not found');

	const photos = await Promise.all(
		(detail.photos ?? []).map(async (p) => ({
			...p,
			signed_url: await getPresignedPhotoUrl(platform!.env, p.storage_path, 300)
		}))
	);

	return {
		asset: detail.asset,
		latestInspection: detail.latest_inspection,
		inspections: detail.inspections ?? [],
		contacts: detail.contacts ?? [],
		photos
	};
};
