CREATE TABLE "asset" (
	"ref" text PRIMARY KEY NOT NULL,
	"asset_type_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"osm_element" text,
	"osm_lat" double precision,
	"osm_lon" double precision,
	"owner" text,
	"operator_contact" text,
	"condition" text,
	"condition_date" date,
	"access_notes" text,
	"council_ref" text,
	"is_sensitive" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "asset_condition_check" CHECK ("asset"."condition" IN ('good','fair','poor','critical','unknown'))
);
--> statement-breakpoint
CREATE TABLE "asset_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_ref" text NOT NULL,
	"role" text NOT NULL,
	"name" text,
	"phone" text,
	"email" text,
	"is_public" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "asset_type" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"osm_tags" jsonb,
	"icon" text,
	"inspection_form" text
);
--> statement-breakpoint
CREATE TABLE "inspection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_ref" text NOT NULL,
	"inspected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"inspector" text,
	"condition" text,
	"notes" text,
	"kobo_submission" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "inspection_condition_check" CHECK ("inspection"."condition" IN ('good','fair','poor','critical'))
);
--> statement-breakpoint
CREATE TABLE "photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_ref" text,
	"inspection_id" uuid,
	"storage_path" text NOT NULL,
	"caption" text,
	"taken_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_asset_type_id_asset_type_id_fk" FOREIGN KEY ("asset_type_id") REFERENCES "public"."asset_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_contact" ADD CONSTRAINT "asset_contact_asset_ref_asset_ref_fk" FOREIGN KEY ("asset_ref") REFERENCES "public"."asset"("ref") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_asset_ref_asset_ref_fk" FOREIGN KEY ("asset_ref") REFERENCES "public"."asset"("ref") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_asset_ref_asset_ref_fk" FOREIGN KEY ("asset_ref") REFERENCES "public"."asset"("ref") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_inspection_id_inspection_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspection"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_asset_type" ON "asset" USING btree ("asset_type_id");