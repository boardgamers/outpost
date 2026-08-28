<script lang="ts">
	import { VICTORY_VP, type GameState } from "outpost-engine";

	interface Props {
		state: GameState;
	}

	let { state }: Props = $props();

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
	<span class="brand">
		<svg class="brand-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
			<circle cx="12" cy="12" r="3.2" />
			<ellipse cx="12" cy="12" rx="10" ry="3.6" transform="rotate(-22 12 12)" class="ring" />
		</svg>
		OUTPOST
	</span>
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
		border-radius: 5px;
		padding: 2px 8px;
	}
	.dim {
		color: var(--text-dim);
		margin-left: auto;
	}
</style>
