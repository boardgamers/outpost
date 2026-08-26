<script lang="ts">
	import type { ProductionCard } from "outpost-engine";
	import ResourceIcon from "./ResourceIcon.svelte";
	import { RESOURCE_LABELS } from "./store.svelte";

	interface Props {
		card: ProductionCard;
		selected?: boolean;
		selectable?: boolean;
		onclick?: () => void;
	}

	let { card, selected = false, selectable = false, onclick }: Props = $props();
	const hidden = $derived(card.v < 0);
	// Soft hyphen so long single-word labels wrap inside the narrow card.
	const label = $derived(RESOURCE_LABELS[card.t]?.replace("Microbiotics", "Micro\u00ADbiotics") ?? card.t);
</script>

<button
	class="pcard res-{card.t}"
	class:selected
	class:selectable
	class:hidden
	disabled={!selectable}
	title="{RESOURCE_LABELS[card.t]}{hidden ? '' : `: ${card.v} credits`}"
	{onclick}
>
	<span class="icon"><ResourceIcon resource={card.t} size={13} /></span>
	<span class="value">{hidden ? "?" : card.v}</span>
	<span class="label">{label}</span>
</button>

<style>
	.pcard {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1px;
		width: var(--card-w);
		height: var(--card-h);
		padding: 2px;
		border-radius: 6px;
		border: 1px solid color-mix(in srgb, var(--res) 60%, #000);
		background: linear-gradient(
			160deg,
			color-mix(in srgb, var(--res) 88%, #fff),
			var(--res) 65%,
			color-mix(in srgb, var(--res) 78%, #000)
		);
		color: var(--res-text);
		box-shadow: 0 2px 5px rgba(0, 0, 0, 0.35);
		user-select: none;
		transition:
			transform 0.12s ease,
			box-shadow 0.12s ease;
	}
	.icon {
		display: inline-flex;
		opacity: 0.85;
		line-height: 0;
	}
	.value {
		font-size: 16px;
		font-weight: 800;
		line-height: 1;
		text-shadow: 0 1px 1px rgba(0, 0, 0, 0.25);
	}
	.label {
		font-size: 7.5px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		text-align: center;
		line-height: 1.1;
		opacity: 0.9;
		max-width: 100%;
		hyphens: manual;
	}
	.pcard.selectable {
		cursor: pointer;
	}
	.pcard.selectable:hover {
		transform: translateY(-3px);
		box-shadow: 0 5px 10px rgba(0, 0, 0, 0.45);
	}
	.pcard.selected {
		outline: 3px solid var(--gold);
		outline-offset: 1px;
		transform: translateY(-3px);
	}
	.pcard.hidden {
		background: linear-gradient(160deg, #3a4152, #262b38 65%, #1b1f29);
		border-color: #454e63;
		color: #8f9ab0;
	}
</style>
