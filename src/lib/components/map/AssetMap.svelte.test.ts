import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import AssetMap from './AssetMap.svelte';

describe('AssetMap', () => {
	it('renders a map container', async () => {
		// Stub the bbox endpoint so the component's first fetch doesn't 404 the test.
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), {
						headers: { 'content-type': 'application/json' }
					})
			)
		);

		const screen = render(AssetMap);
		const container = screen.getByTestId('asset-map');
		await expect.element(container).toBeInTheDocument();
	});
});
