<script lang="ts">
	import AssetPanel from '$lib/components/asset/AssetPanel.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.asset.name} · Community Asset Mapper</title>
</svelte:head>

<AssetPanel asset={data.asset} photos={data.photos} />
