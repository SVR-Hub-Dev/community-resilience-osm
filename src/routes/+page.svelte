<script lang="ts">
	import AssetMap from '$lib/components/map/AssetMap.svelte';
</script>

<svelte:head>
	<title>Community Asset Mapper</title>
</svelte:head>

<div class="page">
	<div class="map-stage">
		<AssetMap />
	</div>

	<div class="overlay">
		<section class="panel hero-panel">
			<p class="eyebrow">Community Asset Mapper</p>
			<h1>Community infrastructure, mapped and maintained together.</h1>
			<p>
				Browse verified community assets and inspect their condition at a glance. Zoom into local
				areas to load nearby points.
			</p>
		</section>

		<section class="panel legend-panel" aria-label="Condition legend">
			<h2>Condition</h2>
			<ul>
				<li><span class="dot good"></span>Good</li>
				<li><span class="dot fair"></span>Fair</li>
				<li><span class="dot poor"></span>Poor</li>
				<li><span class="dot critical"></span>Critical</li>
				<li><span class="dot unknown"></span>Unknown</li>
			</ul>
		</section>

		<section class="panel tips-panel">
			<h2>Tips</h2>
			<p>Drag to pan, scroll to zoom, and click a marker to open the full asset profile.</p>
		</section>
	</div>
</div>

<style>
	.page {
		position: fixed;
		inset: 0;
		overflow: hidden;
	}

	.map-stage {
		position: absolute;
		inset: 0;
	}

	.overlay {
		position: absolute;
		inset: 0;
		padding: 1rem;
		pointer-events: none;
		display: grid;
		grid-template-columns: minmax(260px, 26rem) minmax(220px, 18rem);
		grid-template-rows: auto 1fr auto;
		gap: 0.75rem;
	}

	.panel {
		pointer-events: auto;
		background: var(--surface);
		backdrop-filter: blur(8px);
		border: 1px solid var(--border);
		border-radius: 0.9rem;
		box-shadow: var(--shadow);
		padding: 0.95rem 1rem;
	}

	.hero-panel {
		grid-column: 1;
		grid-row: 1;
	}

	.legend-panel {
		grid-column: 2;
		grid-row: 1;
		justify-self: end;
		min-width: 12rem;
	}

	.tips-panel {
		grid-column: 1;
		grid-row: 3;
		align-self: end;
		max-width: 28rem;
	}

	.eyebrow {
		margin: 0 0 0.35rem;
		font-size: 0.73rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--brand-strong);
	}

	h1 {
		margin: 0 0 0.5rem;
		font-size: clamp(1.3rem, 2.4vw, 1.9rem);
		line-height: 1.2;
		text-wrap: balance;
	}

	h2 {
		margin: 0 0 0.45rem;
		font-size: 0.95rem;
		font-weight: 700;
	}

	p {
		margin: 0;
		color: var(--muted);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.35rem;
	}

	li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.92rem;
		color: var(--text);
	}

	.dot {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 999px;
		border: 1px solid rgba(15, 23, 42, 0.15);
	}

	.good {
		background: #22c55e;
	}

	.fair {
		background: #eab308;
	}

	.poor {
		background: #f97316;
	}

	.critical {
		background: #ef4444;
	}

	.unknown {
		background: #94a3b8;
	}

	@media (max-width: 900px) {
		.overlay {
			grid-template-columns: 1fr;
			grid-template-rows: auto auto 1fr;
		}

		.hero-panel,
		.legend-panel,
		.tips-panel {
			grid-column: 1;
			justify-self: stretch;
		}

		.hero-panel {
			grid-row: 1;
		}

		.legend-panel {
			grid-row: 2;
		}

		.tips-panel {
			grid-row: 3;
		}
	}

	@media (max-width: 640px) {
		.overlay {
			padding: 0.75rem;
		}
	}
</style>
