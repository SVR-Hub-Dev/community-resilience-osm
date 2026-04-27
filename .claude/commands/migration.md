---
description: Generate a Drizzle migration from the current schema and open it for review.
argument-hint: <description>
---

Generate a new Drizzle migration: $ARGUMENTS

Steps:

1. Confirm the working tree is clean for `src/lib/server/schema.ts` (or that the user explicitly intends the staged change).
2. Run `npx drizzle-kit generate --name="$ARGUMENTS"` — captures the description in the filename.
3. Read the newly generated SQL file under `drizzle/` and report:
   - The DDL operations it will perform.
   - Any destructive operations (`DROP COLUMN`, `DROP TABLE`, type narrowing) — these need explicit user confirmation.
   - Whether a backfill or `USING` clause is needed for any altered column.
4. Invoke the `drizzle-migrator` subagent for a safety review of the migration.
5. Do **not** apply the migration. Stop here and let the user run `npx drizzle-kit migrate` themselves once they've reviewed.

If there is no schema change to capture (Drizzle reports "No changes detected"), say so and exit.
