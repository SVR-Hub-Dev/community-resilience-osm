// Idempotent seed for the `asset_type` table. Run with `npm run db:seed`.
//
// This is a Node script invoked via tsx. It is the only file under
// src/lib/server/ allowed to read process.env — it is never imported by
// the Worker bundle. The `architecture-check` rule about DATABASE_URL
// excludes this file by being scoped to src/lib/server/**.

import { config } from 'dotenv';
import { sql } from 'drizzle-orm';
import { getDb } from './db';
import { assetType } from './schema';

config({ path: '.dev.vars' });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('DATABASE_URL is not set. Copy .dev.vars.example to .dev.vars and fill it in.');
	process.exit(1);
}

// OSM tag mappings mirror architecture §10. The icon names are stubs —
// the actual SVGs are scoped to plan 04-map-ui.
const types = [
	{
		id: 'community_hall',
		label: 'Community Hall',
		osmTags: { amenity: 'community_centre' },
		icon: 'community-hall'
	},
	{
		id: 'fire_station',
		label: 'Fire Station',
		osmTags: { amenity: 'fire_station' },
		icon: 'fire-station'
	},
	{
		id: 'water_tank',
		label: 'Water Tank',
		osmTags: { emergency: 'water_tank' },
		icon: 'water-tank'
	},
	{
		id: 'bridge',
		label: 'Bridge',
		osmTags: { man_made: 'bridge' },
		icon: 'bridge'
	},
	{
		id: 'defibrillator',
		label: 'Defibrillator',
		osmTags: { emergency: 'defibrillator' },
		icon: 'defibrillator'
	},
	{
		id: 'evacuation_centre',
		label: 'Evacuation Centre',
		osmTags: { emergency: 'assembly_point' },
		icon: 'evacuation-centre'
	},
	{
		id: 'playground',
		label: 'Playground',
		osmTags: { leisure: 'playground' },
		icon: 'playground'
	},
	{
		id: 'sports_field',
		label: 'Sports Field',
		osmTags: { leisure: 'pitch' },
		icon: 'sports-field'
	},
	{
		id: 'social_service',
		label: 'Social Service',
		osmTags: { amenity: 'social_facility' },
		icon: 'social-service'
	}
];

async function main() {
	const db = getDb({ DATABASE_URL: databaseUrl! });

	await db
		.insert(assetType)
		.values(types)
		.onConflictDoUpdate({
			target: assetType.id,
			set: {
				label: sql`excluded.label`,
				osmTags: sql`excluded.osm_tags`,
				icon: sql`excluded.icon`
			}
		});

	console.log(`Seeded ${types.length} asset_type rows.`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
