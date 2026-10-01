<script lang="ts">
	import {
		KICKERS_BY_ERA,
		KICKER_SPECS,
		UPGRADE_SPECS,
		UPGRADES,
		colonyEra,
		upgradeEra,
		upgradeNumber,
		type GameState,
		type Kicker,
	} from "outpost-engine";
	import UpgradeBadges from "./UpgradeBadges.svelte";
	import ColonyArt from "./ColonyArt.svelte";
	import CardEffect from "./CardEffect.svelte";
	import { KICKER_EFFECTS, UPGRADE_EFFECTS, effectToText, type ViewerStore } from "./store.svelte";

	interface Props {
		state: GameState;
		store: ViewerStore;
	}

	let { state, store }: Props = $props();

	const pick = $derived(store.auctionPick);
	const meIndex = $derived(store.playerIndex);
	const gameEra = $derived(state.era ?? colonyEra(state));
	// Remaining colony upgrades, grouped by era so each era gets a delimiter chip
	// and the current era a highlight — same presentation as the Kicker supply.
	const supplyByEra = $derived(
		([1, 2, 3] as const)
			.map((era) => ({
				era,
				counts: UPGRADES.map((u) => ({ u, n: state.supply[u] })).filter((x) => x.n > 0 && upgradeEra(x.u) === era),
			}))
			.filter((x) => x.counts.length > 0)
	);
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

<div class="market" data-tutorial="market">
	<div class="caption">Colony upgrades for auction</div>
	{#if state.market.length === 0}
		<div class="empty">The market is empty. New upgrades arrive with the next colony ship.</div>
	{:else}
		<div class="cards">
			{#each state.market as upgrade, i (i)}
				{@const spec = UPGRADE_SPECS[upgrade]}
				{@const open = pick?.marketIndex === i && pick.kicker !== true}
				{@const due = myDue(upgrade)}
				{@const discount = store.playerIndex === undefined ? 0 : store.discountOf(store.playerIndex, upgrade)}
				{@const blocked = store.turnBuys.length > 0}
				<div class="slot" class:expanded={open}>
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
						<span class="art"><ColonyArt card={upgrade} /></span>
						<span class="uvp">{spec.vp} VP</span>
						<span class="uprice">
							min ◈ {spec.price}
							{#if due < spec.price}
								· you pay ◈ {due}{/if}
						</span>
						<UpgradeBadges {upgrade} />
						<span class="ueffect"
							><CardEffect locale={store.preferences.locale} tokens={UPGRADE_EFFECTS[upgrade]} /></span
						>
					</button>
					{#if open && pick}
						<div class="bidbox">
							<div class="payment-preview">
								Bid ◈ {pick.bid}{#if discount > 0}
									− discount ◈ {discount}{/if}<br /><strong
									>{store.fastBid ? "Pay at most" : "Pay"} ◈ {Math.max(0, pick.bid - discount)}</strong
								>
								· you hold ◈ {store.myHandValue}
							</div>
							<div class="bidrow">
								<button onclick={() => store.bumpAuctionBid(-1)} disabled={pick.bid <= spec.price}>−</button>
								<input
									aria-label="Opening bid before discount"
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
								<button
									class="confirm"
									disabled={pick.bid < spec.price || pick.bid > store.maxAuctionPickBid}
									onclick={() => store.confirmAuction()}>Auction at ◈ {pick.bid}</button
								>
								<button class="cancel" onclick={() => store.cancel()}>Cancel</button>
								<span class="maxhint">max ◈ {store.maxAuctionPickBid}</span>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
	<details class="supply-details">
		<summary>Remaining upgrades</summary>
		<div class="supply">
			{#each supplyByEra as x (x.era)}
				<span class="stag era-{x.era} ks-era" class:current={x.era === gameEra}>
					<span class="stag-era">{["", "I", "II", "III"][x.era]}</span>
				</span>
				{#each x.counts as c (c.u)}
					{@const spec = UPGRADE_SPECS[c.u]}
					<span
						class="stag era-{x.era}"
						title="{spec.name} ({spec.vp} VP, list ◈ {spec.price}): {effectToText(
							UPGRADE_EFFECTS[c.u]
						)} ×{c.n} left in the supply — Era {['', 'I', 'II', 'III'][x.era]} upgrade (card #{upgradeNumber(
							c.u
						)}){x.era === gameEra ? ' (current era)' : ''}"
					>
						{spec.name}&nbsp;<span class="kcount">×{c.n}</span>
					</span>
				{/each}
			{/each}
			{#if supplyByEra.length === 0}
				<span class="stag dim">Supply exhausted</span>
			{/if}
		</div>
	</details>
	{#if state.kickerMarket.length > 0}
		<div class="caption kicker-caption">Kicker cards — era {["", "I", "II", "III"][state.kickerEra]}</div>
		<div class="cards">
			{#each state.kickerMarket as kicker, i (i)}
				{@const spec = KICKER_SPECS[kicker]}
				{@const open = pick?.marketIndex === i && pick.kicker === true}
				{@const blocked = store.turnBuys.length > 0}
				<div class="slot" class:expanded={open}>
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
						<span class="uname">
							{spec.name}
							<span class="uera era-{spec.era}" title="Era {['', 'I', 'II', 'III'][spec.era]} Kicker card">
								{["", "I", "II", "III"][spec.era]}
							</span>
						</span>
						<span class="art"><ColonyArt card={kicker} /></span>
						<span class="uvp">{spec.vp} VP</span>
						<span class="uprice">min ◈ {spec.price}</span>
						<span class="ueffect"><CardEffect locale={store.preferences.locale} tokens={KICKER_EFFECTS[kicker]} /></span
						>
					</button>
					{#if open && pick}
						<div class="bidbox">
							<div class="payment-preview">
								<strong>{store.fastBid ? "Pay at most" : "Pay"} ◈ {pick.bid}</strong> · you hold ◈ {store.myHandValue}
							</div>
							<div class="bidrow">
								<button onclick={() => store.bumpAuctionBid(-1)} disabled={pick.bid <= spec.price}>−</button>
								<input
									aria-label="Opening bid before discount"
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
								<button
									class="confirm"
									disabled={pick.bid < spec.price || pick.bid > store.maxAuctionPickBid}
									onclick={() => store.confirmAuction()}>Auction at ◈ {pick.bid}</button
								>
								<button class="cancel" onclick={() => store.cancel()}>Cancel</button>
								<span class="maxhint">max ◈ {store.maxAuctionPickBid}</span>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
		<details class="supply-details">
			<summary>Remaining Kicker cards</summary>
			<div class="supply ksupply">
				{#each kickerSupply as x (x.era)}
					<span class="stag era-{x.era} ks-era" class:current={x.era === state.kickerEra}>
						<span class="stag-era">{["", "I", "II", "III"][x.era]}</span>
					</span>
					{#each x.counts as c (c.k)}
						{@const spec = KICKER_SPECS[c.k]}
						<span
							class="stag era-{x.era}"
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
		</details>
	{/if}
</div>

<style>
	.payment-preview {
		font-size: 13px;
		line-height: 1.5;
		padding: 4px 0;
	}
	.payment-preview strong {
		color: var(--gold);
		font-size: 15px;
	}
	.market {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.caption {
		font-family: var(--font-console);
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
		display: grid;
		grid-template-columns: 1fr auto;
		align-content: start;
		align-items: start;
		gap: 6px;
		width: 168px;
		min-height: 190px;
		padding: 9px;
		text-align: left;
		background: linear-gradient(145deg, #202a34, var(--bg-panel) 65%);
		border: 1px solid #485562;
		border-top: 2px solid var(--card-accent, #779baa);
		border-radius: 2px;
		box-shadow:
			inset 0 0 0 2px #10151c80,
			2px 3px 0 #00000035;
	}
	.art {
		grid-column: 1 / -1;
		display: block;
		width: 100%;
		height: 70px;
		border: 1px solid #465460;
		--art-line: var(--card-accent, #7895a5);
	}
	.ucard :global(.badges) {
		grid-column: 1 / -1;
	}
	.ucard :global(.badges:empty) {
		display: none;
	}
	.ucard:disabled {
		opacity: 1;
		cursor: default;
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
		--card-accent: #5aa5e0;
	}
	.kcard.era-2 {
		--card-accent: #f08c48;
	}
	.kcard.era-3 {
		--card-accent: #b48ce8;
	}
	.uera {
		font-size: 9.5px;
		font-weight: 800;
		letter-spacing: 0.06em;
		border-radius: 1px;
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
		grid-column: 1 / -1;
		font-family: "Arial Narrow", "Liberation Sans Narrow", sans-serif;
		font-weight: 800;
		font-size: 13px;
		letter-spacing: 0.045em;
		text-transform: uppercase;
		line-height: 1.3;
		color: var(--text);
	}
	.uvp {
		grid-column: 2;
		grid-row: 3;
		font-family: var(--font-console);
		font-size: 11px;
		font-weight: 800;
		color: var(--gold);
	}
	.uprice {
		grid-column: 1;
		grid-row: 3;
		font-family: var(--font-console);
		font-size: 11.5px;
		color: var(--text-mid);
	}
	.ueffect {
		grid-column: 1 / -1;
		padding-top: 6px;
		border-top: 1px solid var(--line);
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
		flex-wrap: wrap;
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
		margin-top: 8px;
	}
	.stag {
		font-size: 11px;
		color: var(--text-mid);
		background: var(--bg-panel);
		border: 1px solid var(--line);
		border-radius: 1px;
		padding: 1px 6px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.stag-era {
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.04em;
		border-radius: 1px;
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
	@media (max-width: 720px) {
		.cards {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 8px;
		}
		.slot {
			min-width: 0;
		}
		.slot.expanded {
			grid-column: 1 / -1;
		}
		.ucard {
			width: 100%;
			min-width: 0;
			padding: 9px;
			overflow-wrap: anywhere;
			flex: 1;
		}
		.bidbox {
			width: 100%;
		}
	}

	.supply-details summary {
		cursor: pointer;
		font-size: 12px;
		color: var(--text-mid);
		padding: 10px 4px;
		min-height: 44px;
		box-sizing: border-box;
	}
	.supply-details .supply {
		margin: 0 0 8px;
	}
	@media (max-width: 600px) {
		.cards {
			display: grid;
			grid-template-columns: minmax(0, 1fr);
			gap: 6px;
		}
		.ucard {
			grid-template-columns: 72px minmax(0, 1fr) auto;
			gap: 6px 10px;
			min-height: 0;
			padding: 9px;
		}
		.art {
			grid-column: 1;
			grid-row: 2 / span 3;
			height: 65px;
		}
		.uname {
			grid-column: 1 / -1;
		}
		.uvp {
			grid-column: 3;
			grid-row: 2;
		}
		.uprice {
			grid-column: 2;
			grid-row: 2;
		}
		.ucard :global(.badges) {
			grid-column: 2 / -1;
		}
		.ueffect {
			grid-column: 2 / -1;
		}
		.bidbox {
			box-sizing: border-box;
		}
		.bidrow button {
			min-height: 44px;
		}
	}
</style>
