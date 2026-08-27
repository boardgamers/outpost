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

<SpaceScene gameState={state} />

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

					<div class="players" data-count={state.players.length}>
						{#if store.playerIndex !== undefined}
							<div class="me">
								<PlayerPanel {state} {store} index={store.playerIndex} onNameClick={onPlayerClick} />
							</div>
						{/if}
						{#each state.players as _, i (i)}
							{#if i !== store.playerIndex}
								<PlayerPanel {state} {store} index={i} onNameClick={onPlayerClick} />
							{/if}
						{/each}
					</div>

					<MarketPanel {state} {store} />
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
	/* Narrow screens are one column: auction banner, action bar, your own panel,
	   market, other players, and the event log last. Every move happens between
	   the action bar and your own board (hand cards, factory chips), so those
	   two stay adjacent instead of being split by the market. The grid becomes a
	   plain column and order does the arranging; on wide screens the DOM order
	   (players, market) is already right. */
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
	/* `display: contents` lifts the action bar and the event log out of `.side`
	   so the bar's sticky containing block is `.main`, which spans everything
	   below. The log is ordered to the very bottom — it is reference info, not
	   part of the current move. The sticky rule itself lives in
	   ActionBar.svelte (scoped styles can't reach child roots). */
	.side {
		display: contents;
	}
	.side > :global(.side) {
		order: 10;
	}
	/* One grid of player panels, yours first. */
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
		/* Action bar + event log form the sticky right sidebar again. */
		.side {
			display: flex;
			flex-direction: column;
			gap: 10px;
			grid-column: 2;
			grid-row: 1 / span 3;
			position: sticky;
			top: 16px;
		}
		.side > :global(.side) {
			order: 0;
		}
		/* Your panel rejoins the grid as a regular cell. */
		.players > .me {
			display: contents;
		}
	}
	/* Narrow screens: one column — auction banner, action bar, your own panel,
	   market, other players, event log. The players grid becomes a plain vertical
	   stack and the market is threaded between your panel and the opponents with
	   order: every move happens between the action bar and your own board (hand
	   cards, factory chips), never split by the market. */
	@media (max-width: 1099px) {
		.players {
			display: contents;
		}
		.players > .me {
			order: 3;
		}
		.players > :global(.panel) {
			order: 5;
		}
		.main > :global(.market) {
			order: 4;
		}
		.main > :global(.banner) {
			order: 1;
		}
		.side > :global(.actionbar) {
			order: 2;
		}
		.side > :global(.side) {
			order: 6;
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
	}
</style>
