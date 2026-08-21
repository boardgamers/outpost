<script lang="ts">
	import { VICTORY_VP, type GameState } from "outpost-engine";

	interface Props {
		state: GameState;
	}

	let { state }: Props = $props();

	const phaseLabel = $derived(
		state.ended
			? "Game over"
			: state.phase === "discard"
				? "Discard"
				: state.phase === "actions"
					? "Actions"
					: state.phase === "auction"
						? "Auction"
						: "Auction payment"
	);
</script>

<div class="strip">
	<span class="brand">OUTPOST</span>
	<span class="item">Round <strong>{state.round}</strong></span>
	<span class="item phase">{phaseLabel}</span>
	<span class="item dim">First to {VICTORY_VP} VP wins</span>
</div>

<style>
	.strip {
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
		font-weight: 800;
		letter-spacing: 0.18em;
		font-size: 13px;
		color: var(--gold);
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
		border-radius: 5px;
		padding: 2px 8px;
	}
	.dim {
		color: var(--text-dim);
		margin-left: auto;
	}
</style>
