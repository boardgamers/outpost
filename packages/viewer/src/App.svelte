<script lang="ts">
	import type { ViewerStore } from "./lib/store.svelte";
	import HeaderStrip from "./lib/HeaderStrip.svelte";
	import MarketPanel from "./lib/MarketPanel.svelte";
	import AuctionBanner from "./lib/AuctionBanner.svelte";
	import PlayerPanel from "./lib/PlayerPanel.svelte";
	import ActionBar from "./lib/ActionBar.svelte";
	import GameEndBanner from "./lib/GameEndBanner.svelte";
	import ReplayBar from "./lib/ReplayBar.svelte";
	import LogFeed from "./lib/LogFeed.svelte";
	import SpaceScene from "./lib/SpaceScene.svelte";

	interface Props {
		store: ViewerStore;
		onPlayerClick?: (index: number) => void;
	}

	let { store, onPlayerClick }: Props = $props();
	const state = $derived(store.state);
</script>

<SpaceScene />

{#if state}
	<div class="board">
		<div class="page">
			<ReplayBar {store} />
			<HeaderStrip {state} />
			<GameEndBanner {store} />

			<div class="columns">
				<div class="main">
					{#if state.auction && !state.ended}
						<AuctionBanner {state} {store} />
					{/if}

					<div class="side">
						<ActionBar {store} />
						<LogFeed {store} />
					</div>

					<MarketPanel {state} {store} />

					<div class="players" data-count={state.players.length}>
						{#each state.players as _, i (i)}
							<PlayerPanel {state} {store} index={i} onNameClick={onPlayerClick} />
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
{:else}
	<div class="loading">Waiting for game state…</div>
{/if}

<style>
	.board {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px;
		max-width: 1400px;
		/* Center the board within a wide iframe so large screens don't leave a
   one-sided empty gutter. */
		margin: 0 auto;
		width: 100%;
	}
	.page {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	/* Narrow screens are one column: auction banner, action bar, market, then the
	   player panels. The action bar and the hand cards (the two halves of any
	   move) stay adjacent instead of being split by the market. */
	.columns {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.main {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}
	/* `display: contents` lifts the action bar out of `.side` so its sticky
	   containing block is `.main`, which spans the market and the player panels —
	   otherwise the bar could not travel past the event feed. The sticky rule
	   itself lives in ActionBar.svelte (scoped styles can't reach child roots). */
	.side {
		display: contents;
	}
	.players {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(230px, 100%), 1fr));
		grid-auto-rows: min-content;
		align-content: start;
		gap: 10px;
		align-items: start;
	}
	/* Wide screens: two columns — players/market on the left, action bar + event
	   feed in a fixed right sidebar. The main column grows to fill the board, so
	   the header strip and the content row always share the same width (sizing
	   the page to its content instead would track unwrapped log lines and drift
	   wider than what's visible). */
	@media (min-width: 1100px) {
		.columns {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 360px;
			align-items: start;
			gap: 14px 24px;
		}
		.main {
			display: contents;
		}
		/* .banner/.market are child-component roots, so they need :global to be
		   visible to this scoped stylesheet. */
		.main > .players,
		.main > :global(.banner),
		.main > :global(.market) {
			grid-column: 1;
		}
		.main > .players {
			grid-row: 1;
		}
		.main > :global(.banner) {
			grid-row: 2;
		}
		.main > :global(.market) {
			grid-row: 3;
		}
		.side {
			display: flex;
			flex-direction: column;
			gap: 10px;
			grid-column: 2;
			grid-row: 1 / span 3;
			position: sticky;
			top: 16px;
		}
	}
	.loading {
		padding: 40px;
		text-align: center;
		color: var(--text-dim);
	}

	@media (max-width: 720px) {
		.board {
			padding: 10px;
			gap: 10px;
		}
		.players {
			grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
			gap: 8px;
		}
	}
</style>
