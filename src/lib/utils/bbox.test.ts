import { describe, it, expect } from 'vitest';
import { toGeoJSON, boundsToParams, type BboxRow } from './bbox';

describe('toGeoJSON', () => {
	it('returns an empty FeatureCollection for no rows', () => {
		const fc = toGeoJSON([]);
		expect(fc).toEqual({ type: 'FeatureCollection', features: [] });
	});

	it('maps a row to a Point Feature with [lon, lat] order', () => {
		const rows: BboxRow[] = [
			{
				ref: 'MVC-0042',
				name: 'Tinonee Hall',
				asset_type_id: 'community_hall',
				condition: 'good',
				lat: -31.92,
				lon: 152.48
			}
		];
		const fc = toGeoJSON(rows);
		expect(fc.features).toHaveLength(1);
		const feat = fc.features[0];
		expect(feat.geometry).toEqual({ type: 'Point', coordinates: [152.48, -31.92] });
		expect(feat.properties).toEqual({
			ref: 'MVC-0042',
			name: 'Tinonee Hall',
			asset_type_id: 'community_hall',
			condition: 'good'
		});
	});

	it('passes through a null condition', () => {
		const fc = toGeoJSON([
			{
				ref: 'MVC-0001',
				name: 'X',
				asset_type_id: 'water_tank',
				condition: null,
				lat: 0,
				lon: 0
			}
		]);
		expect(fc.features[0]?.properties?.condition).toBeNull();
	});
});

describe('boundsToParams', () => {
	it('serialises a MapLibre-shaped bounds object to w/s/e/n', () => {
		const bounds = {
			getWest: () => 152.4,
			getSouth: () => -31.95,
			getEast: () => 152.55,
			getNorth: () => -31.88
		};
		const params = boundsToParams(bounds);
		expect(params.get('w')).toBe('152.4');
		expect(params.get('s')).toBe('-31.95');
		expect(params.get('e')).toBe('152.55');
		expect(params.get('n')).toBe('-31.88');
	});
});
