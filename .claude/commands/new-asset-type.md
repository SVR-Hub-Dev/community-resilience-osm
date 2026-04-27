---
description: Scaffold a new asset_type — Drizzle seed entry, OSM tag mapping, icon stub.
argument-hint: <id> <label>
---

Scaffold a new asset type: $ARGUMENTS

The first argument is the `id` (snake_case, e.g. `community_hall`); everything after is the human label (e.g. `Community Hall`).

Do these in order:

1. **Confirm OSM tag mapping** — invoke the `osm-tagger` subagent to choose the canonical OSM tags that should match this asset type (e.g. `{"amenity":"community_centre"}`). Do not invent tags; use the OSM wiki.

2. **Add the seed row** to the Drizzle seed file (create `src/lib/server/seeds/asset-types.ts` if it does not exist) with shape:
   ```ts
   { id, label, osmTags, icon: 'placeholder', inspectionForm: null }
   ```

3. **Add the icon placeholder** at `static/icons/asset-types/<id>.svg` — a simple labelled circle stub. Note in a comment that it needs replacing before launch.

4. **Update the architecture index** — append a row to `dev-resources/architecture/community-asset-mapper-architecture.md` §10 ("Tag schema") describing the new type.

5. **Verify** — run `npm run check` to confirm the seed compiles.

Do not run any Drizzle migrations as part of this command; the schema for `asset_type` already exists. Use `drizzle-kit push` or a seed script to insert the row.
