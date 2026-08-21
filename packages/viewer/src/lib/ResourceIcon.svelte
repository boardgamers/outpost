<script lang="ts">
	import type { Resource } from "outpost-engine";

	interface Props {
		resource: Resource;
		size?: number;
	}

	let { resource, size = 12 }: Props = $props();
</script>

<svg class="res-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
	{#if resource === "ore"}
		<path d="M4 16 10 6l4 5 3-3 3 8z" />
		<path d="M8 16h8" class="thin" />
	{:else if resource === "water"}
		<path d="M12 3c3.5 4.5 6 7.6 6 10.5a6 6 0 1 1-12 0C6 10.6 8.5 7.5 12 3z" />
	{:else if resource === "titanium"}
		<path d="M12 3l7 4v10l-7 4-7-4V7z" />
		<path d="M12 3v18M5 7l14 10M19 7L5 17" class="thin" />
	{:else if resource === "research"}
		<circle cx="12" cy="12" r="2.2" />
		<ellipse cx="12" cy="12" rx="9" ry="3.6" class="thin" />
		<ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" class="thin" />
		<ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)" class="thin" />
	{:else if resource === "microbiotics"}
		<circle cx="9" cy="9" r="4" />
		<circle cx="16" cy="15" r="5" class="thin" />
		<circle cx="16" cy="8" r="1.6" />
	{:else if resource === "newChemicals"}
		<path d="M10 3h4M11 3v5l-5 9a3 3 0 0 0 2.6 4.5h6.8A3 3 0 0 0 18 17l-5-9V3" class="thin" />
		<path d="M8.5 14h7l1.7 3a1.5 1.5 0 0 1-1.3 2.2H8.1a1.5 1.5 0 0 1-1.3-2.2z" />
	{:else if resource === "orbitalMedicine"}
		<circle cx="12" cy="12" r="8" class="thin" />
		<path d="M12 8v8M8 12h8" />
	{:else if resource === "ringOre"}
		<circle cx="12" cy="12" r="4" />
		<ellipse cx="12" cy="12" rx="10" ry="3.4" transform="rotate(-18 12 12)" class="thin" />
	{:else if resource === "moonOre"}
		<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 6.8 6.8 0 0 0 20 14.5z" />
		<circle cx="17" cy="7" r="1.3" />
	{/if}
</svg>

<style>
	.res-icon {
		display: inline-block;
		fill: currentColor;
		stroke: currentColor;
		stroke-width: 0;
		flex-shrink: 0;
	}
	.res-icon .thin {
		fill: none;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
