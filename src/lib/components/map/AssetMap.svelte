<script lang="ts">
	import { goto } from '$app/navigation';
	import { boundsToParams } from '$lib/utils/bbox';
	import type { FeatureCollection, Point } from 'geojson';
	import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl';

	async function fetchAndUpdate(m: MlMap) {
		const params = boundsToParams(m.getBounds());
		const res = await fetch(`/api/assets/bbox?${params}`);
		if (!res.ok) return;
		const data: FeatureCollection<Point> = await res.json();
		const src = m.getSource('assets') as GeoJSONSource | undefined;
		src?.setData(data);
	}

	function mapAttachment(node: HTMLDivElement) {
		let map: MlMap | null = null;
		let debounce: ReturnType<typeof setTimeout> | null = null;
		let cancelled = false;

		(async () => {
			const maplibre = await import('maplibre-gl');
			await import('maplibre-gl/dist/maplibre-gl.css');
			if (cancelled) return;

			const m = new maplibre.Map({
				container: node,
				style: {
					version: 8,
					sources: {
						osm: {
							type: 'raster',
							tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
							tileSize: 256,
							attribution: '© OpenStreetMap contributors'
						}
					},
					layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
				},
				center: [152.48, -31.92],
				zoom: 13
			});
			map = m;

			m.on('load', () => {
				m.addSource('assets', {
					type: 'geojson',
					data: { type: 'FeatureCollection', features: [] },
					cluster: true,
					clusterMaxZoom: 14,
					clusterRadius: 50
				});
				m.addLayer({
					id: 'clusters',
					type: 'circle',
					source: 'assets',
					filter: ['has', 'point_count'],
					paint: {
						'circle-color': '#4a90d9',
						'circle-radius': ['step', ['get', 'point_count'], 20, 10, 30, 50, 40]
					}
				});
				m.addLayer({
					id: 'asset-points',
					type: 'circle',
					source: 'assets',
					filter: ['!', ['has', 'point_count']],
					paint: {
						'circle-color': [
							'match',
							['get', 'condition'],
							'good',
							'#22c55e',
							'fair',
							'#eab308',
							'poor',
							'#f97316',
							'critical',
							'#ef4444',
							'#94a3b8'
						],
						'circle-radius': 8,
						'circle-stroke-width': 2,
						'circle-stroke-color': '#ffffff'
					}
				});

				m.on('click', 'asset-points', (e) => {
					const ref = e.features?.[0]?.properties?.ref;
					if (typeof ref === 'string') goto(`/asset/${encodeURIComponent(ref)}`);
				});
				m.on('mouseenter', 'asset-points', () => {
					m.getCanvas().style.cursor = 'pointer';
				});
				m.on('mouseleave', 'asset-points', () => {
					m.getCanvas().style.cursor = '';
				});

				m.on('moveend', () => {
					if (debounce) clearTimeout(debounce);
					debounce = setTimeout(() => fetchAndUpdate(m), 200);
				});

				void fetchAndUpdate(m);
			});
		})();

		return () => {
			cancelled = true;
			if (debounce) clearTimeout(debounce);
			map?.remove();
			map = null;
		};
	}
</script>

<div {@attach mapAttachment} class="map-container" data-testid="asset-map"></div>

<style>
	.map-container {
		width: 100%;
		height: 100%;
		min-height: 100vh;
	}
</style>
