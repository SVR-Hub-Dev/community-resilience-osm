import type { FeatureCollection, Feature, Point } from 'geojson';

export interface BboxRow {
	ref: string;
	name: string;
	asset_type_id: string;
	condition: string | null;
	lat: number;
	lon: number;
}

export type AssetFeature = Feature<
	Point,
	{
		ref: string;
		name: string;
		asset_type_id: string;
		condition: string | null;
	}
>;

export function toGeoJSON(rows: readonly BboxRow[]): FeatureCollection<Point> {
	return {
		type: 'FeatureCollection',
		features: rows.map(
			(r): AssetFeature => ({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
				properties: {
					ref: r.ref,
					name: r.name,
					asset_type_id: r.asset_type_id,
					condition: r.condition
				}
			})
		)
	};
}

export interface LngLatBoundsLike {
	getWest(): number;
	getSouth(): number;
	getEast(): number;
	getNorth(): number;
}

export function boundsToParams(bounds: LngLatBoundsLike): URLSearchParams {
	return new URLSearchParams({
		w: String(bounds.getWest()),
		s: String(bounds.getSouth()),
		e: String(bounds.getEast()),
		n: String(bounds.getNorth())
	});
}
