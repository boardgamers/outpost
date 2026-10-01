<script lang="ts">
	import type { ProductionCard } from "outpost-engine";
	import ResourceIcon from "./ResourceIcon.svelte";
	import { RESOURCE_LABELS } from "./store.svelte";

	interface Props {
		card: ProductionCard;
		selected?: boolean;
		selectable?: boolean;
		/** Marks a card parked on a Wily Trader / Merchant House until the exchange step ends. */
		parked?: boolean;
		onclick?: () => void;
	}

	let { card, selected = false, selectable = false, parked = false, onclick }: Props = $props();
	const hidden = $derived(card.v < 0);
	// Soft hyphens so long words wrap inside the narrow card only when needed.
	const label = $derived(
		RESOURCE_LABELS[card.t]?.replace("Microbiotics", "Micro\u00ADbiotics").replace("Chemicals", "Chemi\u00ADcals") ??
			card.t
	);
</script>

<button
	class="pcard res-{card.t}"
	class:selected
	class:selectable
	class:hidden
	class:parked
	class:mega={card.m === true}
	disabled={!selectable}
	title={parked
		? "Received in an exchange — parked on your Wily Trader / Merchant House until the exchange step ends."
		: `${card.m ? "Mega " : ""}${RESOURCE_LABELS[card.t]}${hidden ? "" : `: ${card.v} credits`}${card.m ? " (counts as 4 cards toward hand capacity)" : ""}`}
	{onclick}
>
	<span class="icon"><ResourceIcon resource={card.t} size={13} /></span>
	<span class="value">{hidden ? "?" : card.v}</span>
	<span class="label">{card.m ? `Mega ${label}` : label}</span>
</button>

<style>
	.pcard {
		position: relative;
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1px;
		width: var(--card-w);
		height: var(--card-h);
		padding: 2px;
		border-radius: 1px;
		border: 1px solid color-mix(in srgb, var(--res) 50%, #27323d);
		border-top: 3px solid var(--res);
		background: linear-gradient(135deg, color-mix(in srgb, var(--res) 18%, #202831), #141b24 80%);
		color: var(--text);
		box-shadow:
			inset 0 0 0 2px #00000020,
			1px 2px 0 #00000050;
		user-select: none;
		transition:
			transform 0.12s ease,
			box-shadow 0.12s ease;
	}
	.pcard:disabled {
		opacity: 1;
		cursor: default;
	}
	.icon {
		display: inline-flex;
		color: var(--res);
		line-height: 0;
	}
	.value {
		color: var(--text);
		font-family: var(--font-console);
		font-size: 20px;
		font-weight: 800;
		line-height: 1;
	}
	.label {
		font-family: "Arial Narrow", "Liberation Sans Narrow", sans-serif;
		font-size: 6.5px;
		color: color-mix(in srgb, var(--res) 55%, var(--text));
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.025em;
		text-align: center;
		line-height: 1.1;
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
	.pcard.parked {
		border-style: dashed;
		border-color: color-mix(in srgb, var(--gold) 55%, #454e63);
		opacity: 0.75;
		cursor: help;
	}
	.pcard.mega {
		border-width: 2px;
		border-color: var(--gold);
		box-shadow:
			0 0 0 1px color-mix(in srgb, var(--gold) 55%, transparent),
			0 2px 6px rgba(0, 0, 0, 0.4);
	}
	.pcard.mega .label {
		font-size: 6px;
		letter-spacing: 0;
	}
	.pcard.mega .value {
		font-size: 18px;
	}
</style>
