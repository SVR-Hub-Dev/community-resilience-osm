<script lang="ts">
	interface Photo {
		id: string;
		caption: string | null;
		signed_url: string;
	}

	let { photos }: { photos: Photo[] } = $props();
</script>

{#if photos.length === 0}
	<p class="empty">No photos yet.</p>
{:else}
	<ul class="gallery">
		{#each photos as p (p.id)}
			<li>
				<figure>
					<img src={p.signed_url} alt={p.caption ?? ''} loading="lazy" />
					{#if p.caption}
						<figcaption>{p.caption}</figcaption>
					{/if}
				</figure>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.gallery {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 0.5rem;
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.gallery li {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.gallery img {
		width: 100%;
		aspect-ratio: 4 / 3;
		object-fit: cover;
		border-radius: 0.25rem;
	}

	.empty {
		color: #6b7280;
		font-style: italic;
	}
</style>
