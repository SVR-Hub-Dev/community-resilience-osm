import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	date,
	doublePrecision,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid
} from 'drizzle-orm/pg-core';

export const assetType = pgTable('asset_type', {
	id: text('id').primaryKey(),
	label: text('label').notNull(),
	osmTags: jsonb('osm_tags'),
	icon: text('icon'),
	inspectionForm: text('inspection_form')
});

// `geom GEOMETRY(Point, 4326)`, the GIST index, and the §4.2
// `osm_sync_status` / `osm_last_synced` columns are added by raw SQL
// in drizzle/0001_postgis.sql — Drizzle does not model PostGIS types.
export const asset = pgTable(
	'asset',
	{
		ref: text('ref').primaryKey(),
		assetTypeId: text('asset_type_id')
			.notNull()
			.references(() => assetType.id),
		name: text('name').notNull(),
		description: text('description'),

		osmElement: text('osm_element'),
		osmLat: doublePrecision('osm_lat'),
		osmLon: doublePrecision('osm_lon'),

		owner: text('owner'),
		operatorContact: text('operator_contact'),
		condition: text('condition'),
		conditionDate: date('condition_date'),
		accessNotes: text('access_notes'),
		councilRef: text('council_ref'),
		isSensitive: boolean('is_sensitive').default(false),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
	},
	(table) => [
		check(
			'asset_condition_check',
			sql`${table.condition} IN ('good','fair','poor','critical','unknown')`
		),
		index('idx_asset_type').on(table.assetTypeId)
	]
);

// Inspection condition does NOT include 'unknown' — an inspection
// always records a definite verdict.
export const inspection = pgTable(
	'inspection',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		assetRef: text('asset_ref')
			.notNull()
			.references(() => asset.ref),
		inspectedAt: timestamp('inspected_at', { withTimezone: true }).notNull().defaultNow(),
		inspector: text('inspector'),
		condition: text('condition'),
		notes: text('notes'),
		koboSubmission: text('kobo_submission'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
	},
	(table) => [
		check(
			'inspection_condition_check',
			sql`${table.condition} IN ('good','fair','poor','critical')`
		)
	]
);

export const photo = pgTable('photo', {
	id: uuid('id').primaryKey().defaultRandom(),
	assetRef: text('asset_ref').references(() => asset.ref),
	inspectionId: uuid('inspection_id').references(() => inspection.id),
	storagePath: text('storage_path').notNull(),
	caption: text('caption'),
	takenAt: timestamp('taken_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
});

export const assetContact = pgTable('asset_contact', {
	id: uuid('id').primaryKey().defaultRandom(),
	assetRef: text('asset_ref')
		.notNull()
		.references(() => asset.ref),
	role: text('role').notNull(),
	name: text('name'),
	phone: text('phone'),
	email: text('email'),
	isPublic: boolean('is_public').default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
});
