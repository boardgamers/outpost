<script lang="ts">
	import {
		KICKERS_BY_ERA,
		KICKER_SPECS,
		UPGRADE_SPECS,
		UPGRADES,
		upgradeEra,
		upgradeNumber,
		type GameState,
		type Kicker,
	} from "outpost-engine";
	import UpgradeBadges from "./UpgradeBadges.svelte";
	import CardEffect from "./CardEffect.svelte";
	import { KICKER_EFFECTS, UPGRADE_EFFECTS, effectToText, type ViewerStore } from "./store.svelte";

	interface Props {
		state: GameState;
		store: ViewerStore;
	}

	let { state, store }: Props = $props();

	const supplyLeft = $derived(UPGRADES.map((u) => ({ u, n: state.supply[u] })).filter((x) => x.n > 0));
	const pick = $derived(store.auctionPick);
	const meIndex = $derived(store.playerIndex);
	// Remaining Kicker cards per era: the pile is sorted (draw order hidden but
	// the public counts preserved), so count copies of each type still in it.
	const kickerSupply = $derived(
		([1, 2, 3] as const)
			.map((era) => ({
				era,
				counts: KICKERS_BY_ERA[era]
					.map((k) => ({ k, n: state.kickerPiles[era].filter((c) => c === k).length }))
					.filter((x) => x.n > 0),
			}))
			.filter((x) => x.counts.length > 0 || x.era === state.kickerEra)
	);

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
						<span class="uname">
							{spec.name}
							<span
								class="uera era-{upgradeEra(upgrade)}"
								title="Era {['', 'I', 'II', 'III'][upgradeEra(upgrade)]} upgrade (card #{upgradeNumber(upgrade)})"
							>
								{["", "I", "II", "III"][upgradeEra(upgrade)]}
							</span>
						</span>
						<span class="uvp">{spec.vp} VP</span>
						<span class="uprice">
							min ◈ {spec.price}{#if due < spec.price}
								· you pay ◈ {due}{/if}
						</span>
						<UpgradeBadges {upgrade} />
						<span class="ueffect"><CardEffect tokens={UPGRADE_EFFECTS[upgrade]} /></span>
					</button>
					{#if open && pick}
						<div class="bidbox">
							<div class="bidrow">
								<button onclick={() => store.bumpAuctionBid(-1)} disabled={pick.bid <= spec.price}>−</button>
								<input
									type="number"
									min={spec.price}
									max={store.maxAuctionPickBid}
									value={pick.bid}
									oninput={(e) => store.setAuctionBid(Number(e.currentTarget.value))}
								/>
								<button onclick={() => store.bumpAuctionBid(1)} disabled={pick.bid >= store.maxAuctionPickBid}
									>+1</button
								>
								<button onclick={() => store.bumpAuctionBid(5)} disabled={pick.bid >= store.maxAuctionPickBid}
									>+5</button
								>
							</div>
							<div class="bidrow">
								<button class="confirm" onclick={() => store.confirmAuction()}>Auction at ◈ {pick.bid}</button>
								<button class="cancel" onclick={() => store.cancel()}>Cancel</button>
								<span class="maxhint">max ◈ {store.maxAuctionPickBid}</span>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
	{#if state.kickerMarket.length > 0}
		<div class="caption kicker-caption">Kicker cards — era {["", "I", "II", "III"][state.kickerEra]}</div>
		<div class="cards">
			{#each state.kickerMarket as kicker, i (i)}
				{@const spec = KICKER_SPECS[kicker]}
				{@const open = pick?.marketIndex === i && pick.kicker === true}
				{@const blocked = store.turnBuys.length > 0}
				<div class="slot">
					<button
						class="ucard kcard era-{spec.era}"
						class:open
						class:clickable={store.myActionTurn && !blocked}
						disabled={!store.myActionTurn || blocked}
						title={store.myActionTurn
							? blocked
								? "Undo your staged purchases to open an auction (auctions come first)"
								: "Put up for auction"
							: spec.name}
						onclick={() => (open ? store.cancel() : store.openAuction(i, true))}
					>
						<span class="uname">{spec.name}</span>
						<span class="uvp">{spec.vp} VP</span>
						<span class="uprice">min ◈ {spec.price}</span>
						<span class="ueffect"><CardEffect tokens={KICKER_EFFECTS[kicker]} /></span>
					</button>
					{#if open && pick}
						<div class="bidbox">
							<div class="bidrow">
								<button onclick={() => store.bumpAuctionBid(-1)} disabled={pick.bid <= spec.price}>−</button>
								<input
									type="number"
									min={spec.price}
									max={store.maxAuctionPickBid}
									value={pick.bid}
									oninput={(e) => store.setAuctionBid(Number(e.currentTarget.value))}
								/>
								<button onclick={() => store.bumpAuctionBid(1)} disabled={pick.bid >= store.maxAuctionPickBid}
									>+1</button
								>
								<button onclick={() => store.bumpAuctionBid(5)} disabled={pick.bid >= store.maxAuctionPickBid}
									>+5</button
								>
							</div>
							<div class="bidrow">
								<button class="confirm" onclick={() => store.confirmAuction()}>Auction at ◈ {pick.bid}</button>
								<button class="cancel" onclick={() => store.cancel()}>Cancel</button>
								<span class="maxhint">max ◈ {store.maxAuctionPickBid}</span>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
		<div class="supply ksupply">
			{#each kickerSupply as x (x.era)}
				<span class="stag era-{x.era} ks-era" class:current={x.era === state.kickerEra}>
					<span class="stag-era">{["", "I", "II", "III"][x.era]}</span>
				</span>
				{#each x.counts as c (c.k)}
					{@const spec = KICKER_SPECS[c.k]}
					<span
						class="stag era-{x.era}"
						class:current={x.era === state.kickerEra}
						title="{spec.name} ({spec.vp} VP, list ◈ {spec.price}): {effectToText(
							KICKER_EFFECTS[c.k]
						)} ×{c.n} left in the Era {['', 'I', 'II', 'III'][x.era]} pile{x.era === state.kickerEra
							? ' (current era)'
							: ''}"
					>
						{spec.name}&nbsp;<span class="kcount">×{c.n}</span>
					</span>
				{/each}
			{/each}
		</div>
	{/if}
	<div class="supply">
		{#each supplyLeft as x (x.u)}
			{@const spec = UPGRADE_SPECS[x.u]}
			{@const era = upgradeEra(x.u)}
			<span
				class="stag era-{era}"
				title="{spec.name} ({spec.vp} VP, list ◈ {spec.price}): {effectToText(
					UPGRADE_EFFECTS[x.u]
				)} ×{x.n} left in the supply — Era {['', 'I', 'II', 'III'][era]} upgrade (card #{upgradeNumber(x.u)})"
			>
				<span class="stag-era">{["", "I", "II", "III"][era]}</span>{spec.name} ×{x.n}
			</span>
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
	.kicker-caption {
		margin-top: 4px;
	}
	/* Kicker era colors: era I blue, era II orange, era III purple. */
	.kcard.era-1 {
		border-top-color: #5aa5e0;
	}
	.kcard.era-2 {
		border-top-color: #f08c48;
	}
	.kcard.era-3 {
		border-top-color: #b48ce8;
	}
	.uera {
		font-size: 9.5px;
		font-weight: 800;
		letter-spacing: 0.06em;
		border-radius: 4px;
		padding: 1px 5px;
		margin-left: 5px;
		vertical-align: 1px;
	}
	.uera.era-1 {
		color: #5aa5e0;
		background: color-mix(in srgb, #5aa5e0 16%, transparent);
	}
	.uera.era-2 {
		color: #f08c48;
		background: color-mix(in srgb, #f08c48 16%, transparent);
	}
	.uera.era-3 {
		color: #b48ce8;
		background: color-mix(in srgb, #b48ce8 16%, transparent);
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
	.maxhint {
		font-size: 11px;
		color: var(--text-dim);
		margin-left: 2px;
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
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.stag-era {
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.04em;
		border-radius: 3px;
		padding: 0 3px;
	}
	.stag.era-1 .stag-era {
		color: #5aa5e0;
		background: color-mix(in srgb, #5aa5e0 16%, transparent);
	}
	.stag.era-2 .stag-era {
		color: #f08c48;
		background: color-mix(in srgb, #f08c48 16%, transparent);
	}
	.stag.era-3 .stag-era {
		color: #b48ce8;
		background: color-mix(in srgb, #b48ce8 16%, transparent);
	}
	.stag.dim {
		font-style: italic;
	}
	.ksupply {
		margin-top: 8px;
	}
	.stag.current {
		border-color: var(--gold);
	}
	.kcount {
		font-weight: 800;
		color: var(--text);
	}
</style>
