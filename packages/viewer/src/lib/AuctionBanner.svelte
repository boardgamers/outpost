<script lang="ts">
	import { KICKER_SPECS, UPGRADE_SPECS, type GameState } from "outpost-engine";
	import CardEffect from "./CardEffect.svelte";
	import ChoiceButton from "./ChoiceButton.svelte";
	import { KICKER_EFFECTS, UPGRADE_EFFECTS, type ViewerStore } from "./store.svelte";

	interface Props {
		state: GameState;
		store: ViewerStore;
	}

	let { state, store }: Props = $props();

	const auction = $derived(state.auction);
	const spec = $derived(
		auction ? (auction.kicker ? KICKER_SPECS[auction.kicker] : UPGRADE_SPECS[auction.upgrade!]) : null
	);
	const effectTokens = $derived(
		auction ? (auction.kicker ? KICKER_EFFECTS[auction.kicker] : UPGRADE_EFFECTS[auction.upgrade!]) : []
	);
	const nameOf = (seat: number) => state.players[seat]?.name ?? `Player ${seat + 1}`;
	const meIndex = $derived(store.playerIndex);
	const discount = $derived(
		auction && auction.upgrade && meIndex !== undefined ? store.discountOf(meIndex, auction.upgrade) : 0
	);
	const due = $derived(store.auctionDue());
	const fast = $derived(!!auction?.bids);
	const minBid = $derived(store.minBid);
	const maxBid = $derived(store.maxBid);
	const pendingSeats = $derived(
		state.players.flatMap((player, seat) => (!player.dropped && auction?.bids?.[seat] === undefined ? [seat] : []))
	);
	const pendingNames = $derived(pendingSeats.map(nameOf).join(", "));
	const validBid = $derived(Number.isFinite(store.bidAmount) && store.bidAmount >= minBid && store.bidAmount <= maxBid);

	$effect(() => {
		if (store.myBidTurn) {
			store.prepareBid();
		}
	});
</script>

{#if auction && spec}
	<div class="banner" data-tutorial="auction">
		<div class="auction-layout">
			<div class="block">
				<div class="eyebrow">
					<span class="label">
						{#if fast}
							<svg width="12" height="14" viewBox="0 0 12 14" fill="none" stroke="currentColor" aria-hidden="true">
								<rect x="1.5" y="6" width="9" height="6.5" rx="1" />
								<path d="M3 6V4a3 3 0 0 1 6 0v2M6 8.5v2" />
							</svg>
							<span>Sealed bids</span>
						{:else}
							<span>Auction</span>
						{/if}
					</span>
					{#if fast && state.phase === "auction"}<span class="pending">{`${pendingSeats.length} pending`}</span>{/if}
				</div>
				<div class="card-heading">
					<span class="uname">{spec.name}</span>
					<span class="uvp">{spec.vp} VP · list ◈ {spec.price}</span>
				</div>
				<div class="ueffect"><CardEffect locale={store.preferences.locale} tokens={effectTokens} /></div>
			</div>
			<div class="status">
				{#if !fast || state.phase !== "auction"}
					<div class="bid">
						High bid <strong>◈ {auction.highBid}</strong> by
						<strong translate="no">{nameOf(auction.highBidder)}</strong>
					</div>
				{/if}
				{#if state.phase === "auction"}
					{#if store.myBidTurn}
						{#if maxBid < minBid}
							<div class="unaffordable">
								<span class="cantbid">Minimum bid is ◈ {minBid}; your maximum is ◈ {maxBid}.</span>
								<button class="confirm" onclick={() => store.passBid()}>Pass</button>
								{#if store.changingChoice}<ChoiceButton
										label="Cancel"
										kind="cancel"
										onclick={() => store.cancel()}
									/>{/if}
							</div>
						{:else}
							<div class="bid-heading">
								<label for="auction-bid">{fast ? "Your sealed bid" : "Your bid"}</label>
								<span class="limits">{`Min ◈ ${minBid} · Max ◈ ${maxBid}`}</span>
							</div>
							<div class="controls">
								<div class="stepper">
									<button
										onclick={() => (store.bidAmount = Math.max(minBid, store.bidAmount - 1))}
										disabled={store.bidAmount <= minBid}>−1</button
									>
									<input
										id="auction-bid"
										aria-label="Bid before discount"
										type="number"
										inputmode="numeric"
										min={minBid}
										max={maxBid}
										bind:value={store.bidAmount}
										onchange={() => store.setBidAmount(store.bidAmount)}
									/>
									<button
										onclick={() => (store.bidAmount = Math.min(maxBid, store.bidAmount + 1))}
										disabled={store.bidAmount >= maxBid}>+1</button
									>
									<button
										onclick={() => (store.bidAmount = Math.min(maxBid, store.bidAmount + 5))}
										disabled={store.bidAmount >= maxBid}>+5</button
									>
								</div>
								<div class="actions">
									{#if store.changingChoice}<ChoiceButton
											label="Cancel"
											kind="cancel"
											onclick={() => store.cancel()}
										/>{/if}
									{#if !fast || auction.auctioneer !== meIndex}<button class="pass" onclick={() => store.passBid()}
											>Pass</button
										>{/if}
									<button class="confirm" disabled={!validBid} onclick={() => store.confirmBid()}
										>Bid ◈ {store.bidAmount}</button
									>
								</div>
							</div>
							{#if discount > 0}
								<div class="bid-cost">
									<span>{`Discount ◈ ${discount}`}</span>
									<span class="net-cost"
										><span>{fast ? "Pay at most" : "Pay"}</span>
										<strong>◈ {validBid ? Math.max(0, store.bidAmount - discount) : "—"}</strong></span
									>
								</div>
							{/if}
						{/if}
					{:else if fast}
						{#if meIndex !== undefined && auction.bids?.[meIndex] !== undefined}
							<div class="turn">
								Bid submitted · <strong>{auction.bids[meIndex] === 0 ? "Pass" : `◈ ${auction.bids[meIndex]}`}</strong>
							</div>
							{#if store.revisableChoice}<ChoiceButton
									label="Change bid"
									kind="edit"
									onclick={() => store.changeChoice()}
								/>{/if}
						{/if}
						<div class="waiting">Waiting for {pendingNames} to bid…</div>
					{:else}
						<div class="waiting">Waiting for {nameOf(auction.activeBidder)} to bid…</div>
					{/if}
				{:else}
					<div class="turn">
						{#if store.myPayment}
							You won: select hand cards worth at least ◈ {due} and confirm below (bid {auction.highBid}{#if discount > 0}{` − ${discount} discount`}{/if}).
						{:else}
							Waiting for {nameOf(auction.highBidder)} to pay…
						{/if}
					</div>
				{/if}
				<details class="auction-details">
					<summary>Auction details</summary>
					<div class="detail-copy">
						{#if fast}
							<p>Choices stay hidden until everyone has confirmed.</p>
							<p>Highest bid wins at second-highest + 1; ties go to the earliest in turn order.</p>
							{#if store.myBidTurn}<p>Waiting for {pendingNames} to bid…</p>{/if}
						{/if}
						{#if meIndex !== undefined}
							<p>You hold ◈ {store.myHandValue}</p>
						{/if}
						<p>Cards must cover the payment; excess card value is not returned.</p>
					</div>
				</details>
			</div>
		</div>
	</div>
{/if}

<style>
	.banner {
		container-type: inline-size;
		background: linear-gradient(160deg, color-mix(in srgb, var(--gold) 8%, var(--bg-panel)), var(--bg-panel));
		border: 1px solid color-mix(in srgb, var(--gold) 55%, var(--line));
		border-left: 3px solid var(--gold);
		border-radius: var(--radius);
		padding: 12px;
	}
	.auction-layout {
		display: grid;
		gap: 12px;
	}
	.block,
	.status {
		display: flex;
		flex-direction: column;
		min-width: 0;
		gap: 6px;
	}
	.status {
		border-top: 1px solid var(--line);
		padding-top: 10px;
	}
	.eyebrow,
	.card-heading,
	.bid-heading,
	.bid-cost {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 4px 12px;
	}
	.label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--gold);
	}
	.pending,
	.limits {
		font-size: 11px;
		color: var(--text-mid);
		font-variant-numeric: tabular-nums;
	}
	.uname {
		font-size: 18px;
		font-weight: 800;
		color: var(--text);
	}
	.uvp {
		font-size: 12px;
		color: var(--text-mid);
		white-space: nowrap;
	}
	.ueffect,
	.bid,
	.waiting,
	.cantbid {
		font-size: 12px;
		color: var(--text-mid);
		overflow-wrap: anywhere;
	}
	.turn,
	.bid-heading label {
		font-size: 13px;
		font-weight: 600;
	}
	.controls {
		display: grid;
		gap: 7px;
	}
	.stepper {
		display: grid;
		grid-template-columns: 44px minmax(50px, 1fr) 44px 44px;
		gap: 6px;
	}
	.controls button,
	.unaffordable button,
	.stepper input {
		min-height: 44px;
		padding: 6px 10px;
	}
	.stepper input {
		width: 100%;
		min-width: 0;
		text-align: center;
		font-size: 16px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.actions {
		display: grid;
		grid-template-columns: minmax(70px, 0.6fr) minmax(0, 1fr);
		gap: 6px;
	}
	.confirm {
		border-color: var(--gold);
		background: color-mix(in srgb, var(--gold) 12%, var(--bg-elevated));
		font-weight: 700;
	}
	.pass {
		color: var(--text-mid);
	}
	.unaffordable {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.bid-cost {
		font-size: 12px;
		color: var(--text-mid);
	}
	.net-cost {
		color: var(--gold);
	}
	.auction-details {
		font-size: 11.5px;
		color: var(--text-dim);
	}
	.auction-details summary {
		width: fit-content;
		padding: 6px 0;
		cursor: pointer;
	}
	.detail-copy {
		color: var(--text-mid);
	}
	.detail-copy p {
		margin: 4px 0;
	}
	@container (min-width: 620px) {
		.auction-layout {
			grid-template-columns: minmax(0, 1fr) minmax(300px, 1fr);
			gap: 20px;
		}
		.status {
			border-top: 0;
			border-left: 1px solid var(--line);
			padding-top: 0;
			padding-left: 20px;
		}
	}
</style>
