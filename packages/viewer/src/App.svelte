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
					<div class="players" data-count={state.players.length}>
						{#each state.players as _, i (i)}
							<PlayerPanel {state} {store} index={i} onNameClick={onPlayerClick} />
						{/each}
					</div>

					{#if state.auction && !state.ended}
						<AuctionBanner {state} {store} />
					{/if}

					<MarketPanel {state} {store} />
				</div>

				<div class="side">
					<ActionBar {store} />
					<LogFeed {store} />
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
	.side {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
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
   feed in a fixed right sidebar. */
	@media (min-width: 1100px) {
		.page {
			width: fit-content;
			margin: 0 auto;
			align-items: stretch;
		}
		.columns {
			flex-direction: row;
			align-items: flex-start;
			justify-content: center;
			gap: 24px;
		}
		.main {
			flex: 0 1 auto;
			align-items: stretch;
		}
		.side {
			flex: 0 0 360px;
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
