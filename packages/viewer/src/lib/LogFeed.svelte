<script lang="ts">
	import type { ViewerStore } from "./store.svelte";

	interface Props {
		store: ViewerStore;
	}

	let { store }: Props = $props();
	const lines = $derived(store.logLines);
	const recent = $derived(
		lines
			.map((line, index) => ({ line, index }))
			.slice(-150)
			.reverse()
	);
</script>

<div class="side">
	<div class="caption">Recent events</div>
	<div class="feed">
		{#each recent as item (item.index)}
			{@const era = item.line.match(/^Era (II|III) begins/)?.[1]}
			{#if era}
				<div class="eramark era-{era === 'II' ? 2 : 3}">Era {era} begins</div>
				<div class="entry" class:latest={item.index === lines.length - 1}>
					{item.line.replace(/^Era (II|III) begins — /, "")}
				</div>
			{:else}
				<div class="entry" class:latest={item.index === lines.length - 1}>{item.line}</div>
			{/if}
		{/each}
		{#if recent.length === 0}
			<div class="entry dim">No events yet</div>
		{/if}
	</div>
</div>

<style>
	.side {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.caption {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dim);
		padding: 0 4px;
	}
	.feed {
		background: var(--bg-panel);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 8px 12px;
		max-height: 320px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.entry {
		font-size: 12px;
		color: var(--text);
		border-bottom: 1px solid color-mix(in srgb, var(--line) 50%, transparent);
		padding-bottom: 3px;
	}
	.entry:last-child {
		border-bottom: none;
	}
	.entry.latest {
		color: var(--gold);
		font-weight: 600;
	}
	.entry.dim {
		color: var(--text-dim);
	}
	.eramark {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		text-align: center;
		padding: 5px 10px;
		margin: 4px -12px 2px;
		border-top: 1px solid;
		border-bottom: 1px solid;
	}
	.eramark.era-2 {
		color: #f08c48;
		background: color-mix(in srgb, #f08c48 22%, transparent);
		border-color: color-mix(in srgb, #f08c48 55%, transparent);
	}
	.eramark.era-3 {
		color: #b48ce8;
		background: color-mix(in srgb, #b48ce8 22%, transparent);
		border-color: color-mix(in srgb, #b48ce8 55%, transparent);
	}
</style>
