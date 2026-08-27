<script lang="ts">
	import { UPGRADE_SPECS, type GameState } from "outpost-engine";
	import UpgradeBadges from "./UpgradeBadges.svelte";
	import { UPGRADE_EFFECTS, type ViewerStore } from "./store.svelte";

	interface Props {
		state: GameState;
		store: ViewerStore;
	}

	let { state, store }: Props = $props();

	const auction = $derived(state.auction);
	const spec = $derived(auction ? UPGRADE_SPECS[auction.upgrade] : null);
	const nameOf = (seat: number) => state.players[seat]?.name ?? `Player ${seat + 1}`;
	const meIndex = $derived(store.playerIndex);
	const discount = $derived(auction && meIndex !== undefined ? store.discountOf(meIndex, auction.upgrade) : 0);
	const due = $derived(store.auctionDue());
	const fast = $derived(store.fastBid);
	const minBid = $derived(fast ? (spec?.price ?? 0) : (auction?.highBid ?? 0) + 1);
	const maxBid = $derived(store.maxBid);
	const pendingNames = $derived(store.fastBidPending.map(nameOf).join(", "));

	$effect(() => {
		if (store.myBidTurn) {
			store.prepareBid();
		}
	});
</script>

{#if auction && spec}
	<div class="banner">
		<div class="block">
			<span class="label">On the block</span>
			<span class="uname">{spec.name}</span>
			<span class="uvp">{spec.vp} VP · list ◈ {spec.price}</span>
			<UpgradeBadges upgrade={auction.upgrade} />
			<span class="ueffect">{UPGRADE_EFFECTS[auction.upgrade]}</span>
		</div>
		<div class="status">
			{#if fast && state.phase === "auction"}
				<div class="bid">
					Sealed bids — <strong>{store.fastBidPending.length}</strong> still to bid{#if pendingNames}
						: {pendingNames}{/if}
				</div>
				{#if store.myBidTurn}
					{#if maxBid < minBid}
						<div class="controls">
							<span class="cantbid">You can't match the list price (your max is ◈ {maxBid}).</span>
							<button class="confirm" onclick={() => store.passBid()}>Pass</button>
						</div>
					{:else}
						<div class="turn">Your sealed bid (hidden until everyone has bid):</div>
						<div class="controls">
							<button
								onclick={() => (store.bidAmount = Math.max(minBid, store.bidAmount - 1))}
								disabled={store.bidAmount <= minBid}>−1</button
							>
							<input type="number" min={minBid} max={maxBid} bind:value={store.bidAmount} />
							<button
								onclick={() => (store.bidAmount = Math.min(maxBid, store.bidAmount + 1))}
								disabled={store.bidAmount >= maxBid}>+1</button
							>
							<button
								onclick={() => (store.bidAmount = Math.min(maxBid, store.bidAmount + 5))}
								disabled={store.bidAmount >= maxBid}>+5</button
							>
							<button
								class="confirm"
								disabled={store.bidAmount < minBid || store.bidAmount > maxBid}
								onclick={() => store.confirmBid()}>Bid ◈ {store.bidAmount}</button
							>
							<button class="pass" onclick={() => store.passBid()}>Pass</button>
						</div>
						<div class="hint">
							You hold ◈ {store.myHandValue}{#if discount > 0}
								and get a −{discount} discount on this upgrade{/if}. Max bid ◈ {maxBid}. Highest bid wins at
							second-highest + 1; ties go to the earliest in turn order.
						</div>
					{/if}
				{:else}
					<div class="turn">Your bid is in — waiting for the rest…</div>
				{/if}
			{:else}
				<div class="bid">
					High bid <strong>◈ {auction.highBid}</strong> by <strong>{nameOf(auction.highBidder)}</strong>
				</div>
			{/if}
			{#if !fast && state.phase === "auction"}
				<div class="turn">
					{#if store.myBidTurn}
						Your bid: raise to at least ◈ {minBid} or pass.
					{:else}
						Waiting for {nameOf(auction.activeBidder)} to bid…
					{/if}
				</div>
				{#if store.myBidTurn}
					{#if maxBid < minBid}
						<div class="controls">
							<span class="cantbid">You can't beat the high bid (your max is ◈ {maxBid}).</span>
							<button class="confirm" onclick={() => store.passBid()}>Pass</button>
						</div>
					{:else}
						<div class="controls">
							<button
								onclick={() => (store.bidAmount = Math.max(minBid, store.bidAmount - 1))}
								disabled={store.bidAmount <= minBid}>−1</button
							>
							<input type="number" min={minBid} max={maxBid} bind:value={store.bidAmount} />
							<button
								onclick={() => (store.bidAmount = Math.min(maxBid, store.bidAmount + 1))}
								disabled={store.bidAmount >= maxBid}>+1</button
							>
							<button
								onclick={() => (store.bidAmount = Math.min(maxBid, store.bidAmount + 5))}
								disabled={store.bidAmount >= maxBid}>+5</button
							>
							<button
								class="confirm"
								disabled={store.bidAmount < minBid || store.bidAmount > maxBid}
								onclick={() => store.confirmBid()}>Bid ◈ {store.bidAmount}</button
							>
							<button class="pass" onclick={() => store.passBid()}>Pass</button>
						</div>
						<div class="hint">
							You hold ◈ {store.myHandValue}{#if discount > 0}
								and get a −{discount} discount on this upgrade{/if}. Max bid ◈ {maxBid}.
							{#if store.bidAmount >= minBid && store.bidAmount <= maxBid}
								Winning at {store.bidAmount} would cost you ◈ {Math.max(0, store.bidAmount - discount)} in cards.
							{/if}
						</div>
					{/if}
				{/if}
			{:else if state.phase !== "auction"}
				<div class="turn">
					{#if store.myPayment}
						You won: select hand cards worth at least ◈ {due} and confirm below (bid {auction.highBid}{#if discount > 0}
							− {discount} discount{/if}).
					{:else}
						Waiting for {nameOf(auction.highBidder)} to pay…
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.banner {
		display: flex;
		gap: 18px;
		align-items: flex-start;
		flex-wrap: wrap;
		background: linear-gradient(160deg, color-mix(in srgb, var(--gold) 14%, var(--bg-panel)), var(--bg-panel));
		border: 1px solid var(--gold);
		border-radius: var(--radius);
		padding: 12px 16px;
		animation: glowPulse 2.5s ease-in-out infinite;
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 170px;
	}
	.label {
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-dim);
	}
	.uname {
		font-size: 17px;
		font-weight: 800;
		color: var(--gold);
	}
	.uvp {
		font-size: 12px;
		font-weight: 700;
		color: var(--text);
	}
	.ueffect {
		font-size: 11.5px;
		color: var(--text-mid);
		max-width: 260px;
	}
	.status {
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex: 1;
		min-width: 220px;
	}
	.bid {
		font-size: 14px;
	}
	.turn {
		font-size: 13px;
		color: var(--text);
		font-weight: 600;
	}
	.controls {
		display: flex;
		gap: 6px;
		align-items: center;
		flex-wrap: wrap;
	}
	.controls input {
		width: 70px;
	}
	.confirm {
		border-color: var(--gold);
		font-weight: 700;
	}
	.pass {
		color: var(--text-dim);
	}
	.cantbid {
		font-size: 12.5px;
		color: var(--text-mid);
	}
	.hint {
		font-size: 11.5px;
		color: var(--text-dim);
	}
</style>
