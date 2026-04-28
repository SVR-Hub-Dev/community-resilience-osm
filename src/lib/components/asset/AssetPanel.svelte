<script lang="ts">
	import PhotoGallery from './PhotoGallery.svelte';

	interface Asset {
		ref: string;
		name: string;
		description: string | null;
		condition: string | null;
		condition_date: string | null;
		access_notes: string | null;
		council_ref: string | null;
		osm_element: string | null;
	}

	interface Photo {
		id: string;
		caption: string | null;
		signed_url: string;
	}

	let {
		asset,
		photos
	}: {
		asset: Asset;
		photos: Photo[];
	} = $props();

	const condition = $derived(asset.condition ?? 'unknown');

	function osmHref(element: string): string {
		const prefix = element[0];
		const id = element.slice(1);
		const path = prefix === 'n' ? 'node' : prefix === 'w' ? 'way' : 'relation';
		return `https://www.openstreetmap.org/${path}/${id}`;
	}
</script>

<article class="panel">
	<header>
		<p class="ref">{asset.ref}</p>
		<h1>{asset.name}</h1>
		{#if asset.description}
			<p class="description">{asset.description}</p>
		{/if}
	</header>

	<!-- TODO(05): "Public Record (from OSM)" section — Overpass-sourced tags. -->

	<section class="local-attributes">
		<h2>Community record</h2>
		<dl>
			<dt>Condition</dt>
			<dd>
				<span class="condition condition-{condition}">{condition}</span>
			</dd>
			<dt>Last inspected</dt>
			<dd>{asset.condition_date ?? 'never'}</dd>
			<dt>Access notes</dt>
			<dd>{asset.access_notes ?? '—'}</dd>
			<dt>Council ref</dt>
			<dd>{asset.council_ref ?? '—'}</dd>
		</dl>
		{#if asset.osm_element}
			<a class="osm-link" href={osmHref(asset.osm_element)} target="_blank" rel="noopener">
				View on OpenStreetMap →
			</a>
		{/if}
	</section>

	<!-- TODO: contacts and inspection history land in a UX-polish plan once auth gating exists. -->

	<section class="photos">
		<h2>Photos</h2>
		<PhotoGallery {photos} />
	</section>
</article>

<style>
	.panel {
		max-width: 56rem;
		margin: 2rem auto;
		padding: 1.5rem;
		background: var(--surface-strong);
		border: 1px solid var(--border);
		border-radius: 1rem;
		box-shadow: var(--shadow);
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.ref {
		margin: 0 0 0.25rem;
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--brand-strong);
	}

	h1 {
		margin: 0 0 0.25rem;
		font-size: clamp(1.4rem, 3vw, 2rem);
		line-height: 1.2;
	}

	h2 {
		margin: 0 0 0.6rem;
		font-size: 1rem;
		font-weight: 700;
	}

	.description {
		margin: 0;
		color: var(--muted);
	}

	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		column-gap: 1.25rem;
		row-gap: 0.4rem;
		margin: 0;
	}

	dt {
		color: var(--muted);
		font-size: 0.9rem;
	}

	dd {
		margin: 0;
	}

	.condition {
		display: inline-block;
		padding: 0.1rem 0.55rem;
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 600;
		text-transform: capitalize;
		border: 1px solid rgba(15, 23, 42, 0.15);
	}

	.condition-good {
		background: #dcfce7;
		color: #166534;
	}
	.condition-fair {
		background: #fef3c7;
		color: #854d0e;
	}
	.condition-poor {
		background: #ffedd5;
		color: #9a3412;
	}
	.condition-critical {
		background: #fee2e2;
		color: #991b1b;
	}
	.condition-unknown {
		background: #e2e8f0;
		color: #475569;
	}

	.osm-link {
		display: inline-block;
		margin-top: 0.75rem;
		color: var(--brand);
		text-decoration: none;
		font-weight: 600;
	}

	.osm-link:hover {
		text-decoration: underline;
	}
</style>
