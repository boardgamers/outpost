<script lang="ts">
	import {
		FACTORIES,
		FACTORY_TYPES,
		MAX_CARD_VALUE,
		MIN_CARD_VALUE,
		UPGRADE_SPECS,
		type Upgrade,
	} from "outpost-engine";
	import ResourceIcon from "./ResourceIcon.svelte";
	import { RESOURCE_LABELS } from "./store.svelte";

	interface Props {
		upgrade: Upgrade;
	}

	let { upgrade }: Props = $props();

	const spec = $derived(UPGRADE_SPECS[upgrade]);
	const unlocks = $derived(FACTORY_TYPES.filter((t) => FACTORIES[t].requires === upgrade));
</script>

<div class="badges">
	{#if spec.produces}
		<span
			class="badge res-{spec.produces}"
			title="Produces a {RESOURCE_LABELS[spec.produces]} card each round (per copy)"
		>
			<ResourceIcon resource={spec.produces} size={11} />
			+1 card/round ({MIN_CARD_VALUE[spec.produces]}–{MAX_CARD_VALUE[spec.produces]})
		</span>
	{/if}
	{#each unlocks as type (type)}
		<span
			class="badge res-{type}"
			title="Unlocks {RESOURCE_LABELS[type]} factories (◈ {FACTORIES[type].cost} each, {FACTORIES[type].vp} VP manned)"
		>
			<ResourceIcon resource={type} size={11} />
			unlocks factory
		</span>
	{/each}
	{#if spec.freeFactory}
		<span class="badge res-{spec.freeFactory}" title="Comes with a free {RESOURCE_LABELS[spec.freeFactory]} factory">
			<ResourceIcon resource={spec.freeFactory} size={11} />
			free factory
		</span>
	{/if}
	{#if spec.handCapacityBonus}
		<span class="badge" title="+{spec.handCapacityBonus} hand capacity (per copy)">🂠 +{spec.handCapacityBonus}</span>
	{/if}
	{#if spec.populationBonus}
		<span class="badge" title="+{spec.populationBonus} population limit (per copy)">👤 +{spec.populationBonus}</span>
	{/if}
	{#if upgrade === "robots"}
		<span class="badge" title="Allows buying robots (◈ 10 each)">🤖 buy robots</span>
	{/if}
	{#if upgrade === "ecoplants"}
		<span class="badge" title="Colonists cost 5 instead of 10">👤 cost ◈ 5</span>
	{/if}
</div>

<style>
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 10.5px;
		font-weight: 700;
		color: var(--text);
		background: color-mix(in srgb, var(--res, var(--text-dim)) 14%, transparent);
		border: 1px solid color-mix(in srgb, var(--res, var(--text-dim)) 45%, transparent);
		border-radius: 5px;
		padding: 1.5px 6px;
		line-height: 1.4;
	}
	.badge :global(.res-icon) {
		color: var(--res, var(--text));
	}
</style>
