<script lang="ts">
	import { UPGRADE_SPECS, UPGRADES, type GameState } from "outpost-engine";
	import UpgradeBadges from "./UpgradeBadges.svelte";
	import { UPGRADE_EFFECTS, type ViewerStore } from "./store.svelte";

	interface Props {
		state: GameState;
		store: ViewerStore;
	}

	let { state, store }: Props = $props();

	const supplyLeft = $derived(UPGRADES.map((u) => ({ u, n: state.supply[u] })).filter((x) => x.n > 0));
	const pick = $derived(store.auctionPick);
	const meIndex = $derived(store.playerIndex);

	function myDue(upgrade: (typeof UPGRADES)[number]): number {
		if (meIndex === undefined) {
			return UPGRADE_SPECS[upgrade].price;
		}
		return Math.max(0, UPGRADE_SPECS[upgrade].price - store.discountOf(meIndex, upgrade));
	}
</script>

<div class="market">
	<div class="caption">Colony upgrades for auction</div>
	{#if state.market.length === 0}
		<div class="empty">The market is empty. New upgrades arrive with the next colony ship.</div>
	{:else}
		<div class="cards">
			{#each state.market as upgrade, i (i)}
				{@const spec = UPGRADE_SPECS[upgrade]}
				{@const open = pick?.marketIndex === i}
				{@const due = myDue(upgrade)}
				{@const blocked = store.turnBuys.length > 0}
				<div class="slot">
					<button
						class="ucard"
						class:open
						class:clickable={store.myActionTurn && !blocked}
						disabled={!store.myActionTurn || blocked}
						title={store.myActionTurn
							? blocked
								? "Undo your staged purchases to open an auction (auctions come first)"
								: "Put up for auction"
							: spec.name}
						onclick={() => (open ? store.cancel() : store.openAuction(i))}
					>
						<span class="uname">{spec.name}</span>
						<span class="uvp">{spec.vp} VP</span>
						<span class="uprice">
							min ◈ {spec.price}{#if due < spec.price}
								· you pay ◈ {due}{/if}
						</span>
						<UpgradeBadges {upgrade} />
						<span class="ueffect">{UPGRADE_EFFECTS[upgrade]}</span>
					</button>
					{#if open && pick}
						<div class="bidbox">
							<div class="bidrow">
								<button onclick={() => store.bumpAuctionBid(-1)} disabled={pick.bid <= spec.price}>−</button>
								<input
									type="number"
									min={spec.price}
									value={pick.bid}
									oninput={(e) => store.setAuctionBid(Number(e.currentTarget.value))}
								/>
								<button onclick={() => store.bumpAuctionBid(1)}>+1</button>
								<button onclick={() => store.bumpAuctionBid(5)}>+5</button>
							</div>
							<div class="bidrow">
								<button class="confirm" onclick={() => store.confirmAuction()}>Auction at ◈ {pick.bid}</button>
								<button class="cancel" onclick={() => store.cancel()}>Cancel</button>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
	<div class="supply">
		{#each supplyLeft as x (x.u)}
			<span class="stag" title="{UPGRADE_SPECS[x.u].name} left in the supply">{UPGRADE_SPECS[x.u].name} ×{x.n}</span>
		{/each}
		{#if supplyLeft.length === 0}
			<span class="stag dim">Supply exhausted</span>
		{/if}
	</div>
</div>

<style>
	.market {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.caption {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dim);
		padding: 0 4px;
	}
	.empty {
		background: var(--bg-panel);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 12px 14px;
		color: var(--text-dim);
		font-size: 13px;
	}
	.cards {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}
	.slot {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.ucard {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 3px;
		width: 168px;
		min-height: 118px;
		padding: 10px 12px;
		text-align: left;
		background: linear-gradient(165deg, var(--bg-elevated), var(--bg-panel));
		border: 1px solid var(--line);
		border-top: 3px solid var(--gold);
		border-radius: var(--radius);
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
	}
	.ucard.clickable:hover:not(:disabled) {
		border-color: var(--gold);
		transform: translateY(-2px);
	}
	.ucard.open {
		outline: 2px solid var(--gold);
		animation: glowPulse 2s ease-in-out infinite;
	}
	.uname {
		font-weight: 800;
		font-size: 13px;
		color: var(--text);
	}
	.uvp {
		font-size: 11px;
		font-weight: 800;
		color: var(--gold);
	}
	.uprice {
		font-size: 11.5px;
		color: var(--text-mid);
	}
	.ueffect {
		font-size: 11.5px;
		line-height: 1.35;
		color: var(--text-mid);
	}
	.bidbox {
		display: flex;
		flex-direction: column;
		gap: 6px;
		background: var(--bg-panel);
		border: 1px solid var(--gold);
		border-radius: var(--radius);
		padding: 8px;
		width: 168px;
	}
	.bidrow {
		display: flex;
		gap: 4px;
		align-items: center;
	}
	.bidrow button {
		padding: 3px 8px;
		font-size: 12px;
	}
	.bidrow input {
		width: 62px;
		padding: 3px 6px;
		font-size: 12px;
	}
	.confirm {
		border-color: var(--gold);
		font-weight: 700;
	}
	.cancel {
		color: var(--text-dim);
	}
	.supply {
		display: flex;
		gap: 5px;
		flex-wrap: wrap;
	}
	.stag {
		font-size: 11px;
		color: var(--text-mid);
		background: var(--bg-panel);
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 1px 6px;
	}
	.stag.dim {
		font-style: italic;
	}
</style>
