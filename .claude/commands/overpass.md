---
description: Generate and run an Overpass query for the project's tag schema, scoped to a bbox or place name.
argument-hint: <bbox south,west,north,east | place name>
---

Generate an Overpass QL query for community assets in: $ARGUMENTS

Use the project's tag schema from `dev-resources/architecture/community-asset-mapper-architecture.md` §4.1:
- `amenity~"community_centre|fire_station|social_facility"`
- `emergency~"water_tank|fire_hydrant|defibrillator|assembly_point"`
- `man_made=bridge`
- `ref:community_asset` (any value, surfaces our refs)

Steps:
1. If $ARGUMENTS is a bbox tuple, use it directly. If it's a place name, geocode it via the Nominatim API (`https://nominatim.openstreetmap.org/search?q=...&format=json`) and derive a bbox from the result.
2. Run the query against `https://overpass-api.de/api/interpreter` (POST body `data=<urlencoded query>`).
3. Pretty-print the result: count by tag combination, then list elements with `ref:community_asset` first, then physical assets without our ref tag.
4. If any element has `ref:community_asset` but no matching row in Neon (orphaned tag), highlight it.

Honour Overpass fair-use: timeout 30s, do not retry-loop on rate limits — surface the error.
