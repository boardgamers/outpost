<script lang="ts">
	import { VICTORY_VP, MID_THRESHOLD, bigThreshold, scores, colonyEra, type GameState } from "outpost-engine";
	import type { ViewerStore } from "./store.svelte";

	interface Props {
		state: GameState;
		store: ViewerStore;
	}

	let { state, store }: Props = $props();

	const era = $derived(state.ended ? null : (state.era ?? colonyEra(state)));

	const nextThreshold = $derived(era === 1 ? MID_THRESHOLD : bigThreshold(state));
	const remaining = $derived(Math.max(0, nextThreshold - Math.max(0, ...scores(state))));

	const phaseLabel = $derived(
		state.ended
			? "Game over"
			: state.phase === "mega"
				? "Production"
				: state.phase === "discard"
					? "Discard"
					: state.phase === "actions"
						? "Actions"
						: state.phase === "auction"
							? state.auction?.bids
								? "Sealed bids"
								: "Auction"
							: "Auction payment"
	);
</script>

<div class="strip">
	<span class="brand" translate="no">
		<svg class="brand-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
			<circle cx="12" cy="12" r="3.2" />
			<ellipse cx="12" cy="12" rx="10" ry="3.6" transform="rotate(-22 12 12)" class="ring" />
		</svg>
		OUTPOST
	</span>
	<span class="item">Round <strong>{state.round}</strong></span>
	{#if era !== null}
		<span
			class="item era"
			title="Game era: sets which colony upgrades and Kicker cards are available. Evaluated from the leader's VP when the colony ship arrives — a mid-round VP change counts at the next round"
		>
			Era {["", "I", "II", "III"][era]}
		</span>
		{#if era < 3}
			<span
				class="item"
				title={`The leader needs ${nextThreshold} VP. The era changes when the next round begins. Exhausting the earlier upgrades for two consecutive rounds can also advance the era.`}
			>
				{colonyEra(state) > era ? "Next era next round" : `${remaining} VP to next era`}
			</span>
		{/if}
	{/if}
	<span class="item phase">{phaseLabel}</span>
	<span class="item dim" title="Finish the round when someone reaches 75 VP. The player with the most VP wins.">
		{VICTORY_VP} VP · finish the round
	</span>
	{#if store.canUndoMove}
		<button
			class="undo-move"
			type="button"
			title="Undo my move"
			aria-label="Undo my move"
			onclick={() => store.undoMove()}
		>
			<svg
				viewBox="0 0 20 20"
				width="18"
				height="18"
				fill="none"
				stroke="currentColor"
				stroke-width="1.8"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M7 3.5 3 7.5l4 4M3 7.5h9.5a4.5 4.5 0 0 1 0 9H9" />
			</svg>
		</button>
	{/if}
</div>

<style>
	.strip {
		box-shadow: var(--panel-bevel);
		display: flex;
		align-items: center;
		gap: 16px;
		background: var(--bg-panel);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 8px 14px;
		flex-wrap: wrap;
	}
	.brand {
		font-family: var(--font-console);
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-weight: 800;
		letter-spacing: 0.18em;
		font-size: 13px;
		color: var(--gold);
	}
	.brand-icon {
		fill: currentColor;
	}
	.brand-icon .ring {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
	}
	.item {
		font-size: 13px;
		color: var(--text);
	}
	.item strong {
		font-weight: 800;
	}
	.phase {
		font-weight: 700;
		text-transform: uppercase;
		font-size: 11px;
		letter-spacing: 0.08em;
		background: color-mix(in srgb, var(--gold) 18%, transparent);
		color: var(--gold);
		border-radius: 2px;
		padding: 2px 8px;
	}
	.era {
		font-weight: 700;
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		background: color-mix(in srgb, var(--research) 20%, transparent);
		color: var(--research);
		border-radius: 2px;
		padding: 2px 8px;
	}
	.dim {
		color: var(--text-dim);
		margin-left: auto;
	}
	/* Negative block margins keep the strip's height when the control comes and goes. */
	.undo-move {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		margin: -6px -6px -6px 0;
		padding: 0;
		color: var(--text-mid);
	}
	.undo-move:hover {
		color: var(--text);
	}
	@media (any-pointer: coarse) {
		.undo-move::before {
			content: "";
			position: absolute;
			inset: -7px;
		}
	}
</style>
