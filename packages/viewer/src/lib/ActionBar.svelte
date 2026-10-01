<script lang="ts">
	import {
		FACTORIES,
		FACTORY_TYPES,
		MAX_CARD_VALUE,
		MEGA_CARDS,
		MIN_CARD_VALUE,
		UPGRADE_SPECS,
		auctionCard,
		operators,
	} from "outpost-engine";
	import ResourceIcon from "./ResourceIcon.svelte";
	import { RESOURCE_LABELS, type ViewerStore } from "./store.svelte";

	interface Props {
		store: ViewerStore;
	}

	let { store }: Props = $props();

	const state = $derived(store.state);
	const me = $derived(store.me);
	const pending = $derived(store.pending);
	const staged = $derived(
		store.turnBuys.map((buy) =>
			buy.buy === "factory"
				? `${RESOURCE_LABELS[buy.factory]} factory`
				: buy.buy === "population"
					? `${buy.count} colonist${buy.count === 1 ? "" : "s"}`
					: `${buy.count} robot${buy.count === 1 ? "" : "s"}`
		)
	);
	const total = $derived(store.pickTotal());
	const pickCount = $derived(store.cardPick.length);
	const auctionName = $derived(state?.auction ? auctionCard(state.auction).name : "");
	const needsResearch = $derived(pending?.kind === "factory" && FACTORIES[pending.factory].needsResearchCard === true);
	const hasResearch = $derived(!!me && store.cardPick.some((i) => me.hand[i]?.t === "research"));
	const waitingOn = $derived.by((): string => {
		const s = state;
		if (!s || s.ended) {
			return "";
		}
		const name = (seat: number | undefined) =>
			seat === undefined ? "…" : (s.players[seat]?.name ?? `Player ${seat + 1}`);
		switch (s.phase) {
			case "mega": {
				const seats = s.players.flatMap((p, i) => ((p.pendingMega?.length ?? 0) > 0 ? [i] : []));
				return `Waiting for ${seats.map(name).join(", ")} to take production…`;
			}
			case "discard": {
				const seats = s.players.flatMap((p, i) => (p.mustDiscard ? [i] : []));
				return `Waiting for ${seats.map(name).join(", ")} to discard…`;
			}
			case "exchange":
				return `Wily Trader / Merchant House: waiting for ${name(s.exchange?.seat)} to trade…`;
			case "actions":
				return `Waiting for ${name(s.activeSeat)} to take their turn…`;
			case "auction": {
				if (s.auction?.bids) {
					const pending = s.players.flatMap((p, i) => (!p.dropped && s.auction?.bids?.[i] === undefined ? [i] : []));
					return `Sealed bids: waiting for ${pending.map(name).join(", ")}…`;
				}
				return `Auction: waiting for ${name(s.auction?.activeBidder)} to bid…`;
			}
			case "auctionPayment":
				return `Auction: waiting for ${name(s.auction?.highBidder)} to pay…`;
			default:
				return "";
		}
	});
	const idleOperators = $derived(me ? Math.max(0, operators(me) - store.manningPick.length) : 0);
	const idleFactories = $derived(me ? me.factories.length - store.manningPick.length : 0);

	// Preselect sensible cards when a payment or discard is asked of the player
	// (adjustable by clicking cards; one suggestion per context).
	$effect(() => {
		if (store.autoSuggested) {
			return;
		}
		if (store.myPayment) {
			store.autoSuggested = true;
			store.suggestPayment(store.myPaymentDue);
		} else if (store.iMustDiscard) {
			store.autoSuggested = true;
			store.suggestDiscard();
		}
	});

	const factoryReason = $derived.by((): Partial<Record<(typeof FACTORY_TYPES)[number], string>> => {
		if (!me) {
			return {};
		}
		return {
			titanium: me.upgrades.heavyEquipment === 0 ? "requires Heavy Equipment" : undefined,
			research: me.upgrades.laboratory === 0 ? "requires Laboratory" : undefined,
			newChemicals: !me.hand.some((c) => c.t === "research") ? "needs a research card in payment" : undefined,
		};
	});
</script>

{#if state && !state.ended && !store.replay.active && !store.myBidTurn}
	<div class="actionbar" class:browsing={store.myActionTurn && !pending} data-tutorial="actions">
		{#if store.myMega && me}
			<div class="flow mega-flow">
				<span class="hint gold-hint">
					Production: choose Mega cards before drawing. Each Mega replaces the production of 4 staffed factories; other
					factories produce single cards.
				</span>
				{#each Object.entries(store.megaEligible) as [resource, groups] (resource)}
					{@const mega = MEGA_CARDS[resource as keyof typeof MEGA_CARDS]}
					{@const taking = store.megaTake[resource] ?? 0}
					<div class="mega-row">
						<span class="mega-name">
							Mega {RESOURCE_LABELS[resource] ?? resource}
							{#if mega}
								<em>(◈ {mega.value})</em>{/if}
						</span>
						<span class="mega-stepper">
							<button class="step" disabled={taking <= 0} onclick={() => store.setMegaTake(resource, taking - 1)}
								>−</button
							>
							<span class="count">{taking}/{groups}</span>
							<button
								class="step"
								disabled={taking >= (groups ?? 0)}
								onclick={() => store.setMegaTake(resource, taking + 1)}>+</button
							>
						</span>
					</div>
				{/each}
				<button class="confirm" onclick={() => store.confirmMega()}>
					{store.megaTakeCount > 0 ? `Take ${store.megaTakeCount} mega` : "Take all as singles"}
				</button>
			</div>
		{:else if store.iMustDiscard && me}
			<div class="flow">
				<span class="hint warn">
					{`Hand limit exceeded. Cards still to discard: ${store.discardExcess} (selected: ${pickCount}; Research and Microbiotics do not count).`}
				</span>
				<button class="confirm" disabled={pickCount === 0} onclick={() => store.confirmDiscard()}>
					Discard selected
				</button>
			</div>
		{:else if store.myPayment && me}
			<div class="flow">
				<span class="hint gold-hint">
					You won {auctionName}: select hand cards worth at least ◈ {store.myPaymentDue}
					(selected ◈ {total}).
				</span>
				<button class="confirm" disabled={!store.paymentValid()} onclick={() => store.confirmPayment()}>
					Pay ◈ {store.myPaymentDue}
				</button>
			</div>
		{:else if store.myExchange && me}
			<div class="flow">
				<span class="hint gold-hint">
					Wily Trader / Merchant House: click one of your
					{store.exchangeOfferTypes.map((t) => RESOURCE_LABELS[t] ?? t).join("/")}
					cards to offer, then a player to trade with. They must hand back a higher-valued card of the same type if they have
					one.
				</span>
				<button
					class="confirm"
					disabled={store.exchangeCard === null || store.exchangeTarget === null}
					onclick={() => store.confirmExchange()}
				>
					Trade
				</button>
				<button class="cancel" onclick={() => store.passExchange()}>Pass</button>
			</div>
		{:else if store.myActionTurn && me}
			{#if store.manning}
				<div class="flow">
					<span class="hint gold-hint">
						Assign operators — click the glowing factory chips in your panel to toggle them.
						<span>{`Factories staffed: ${store.manningPick.length}/${me.factories.length}.`}</span>
						{#if idleOperators > 0 && idleFactories > 0}
							<span class="warn">
								Assign {Math.min(idleOperators, idleFactories)} more before ending your turn.
							</span>
						{/if}
						{#if staged.length > 0}
							Also confirms: {staged.join(", ")}.
						{/if}
					</span>
					<button
						class="confirm"
						disabled={idleOperators > 0 && idleFactories > 0}
						onclick={() => store.confirmEndTurn()}>End turn</button
					>
					<button class="cancel" onclick={() => store.cancel()}>Back</button>
				</div>
			{:else if pending}
				<div class="flow">
					<span class="hint">
						{#if pending.kind === "factory"}
							{`Building ${pending.count} ${RESOURCE_LABELS[pending.factory]} ${pending.count === 1 ? "factory" : "factories"} (produces ◈ ${MIN_CARD_VALUE[pending.factory]}–${MAX_CARD_VALUE[pending.factory]} per round when manned):`}
						{:else if pending.kind === "population"}
							{`Colonists to recruit: ${pending.count}`}
						{:else}
							{`Robots to buy: ${pending.count}`}
						{/if}
						selected ◈ {total} / ◈ {pending.cost}.
						{#if needsResearch && !hasResearch}
							<span class="warn"
								>Payment must include a research card{pending.kind === "factory" && pending.count > 1
									? ` per factory (◈ ${pending.count} research)`
									: ""}.</span
							>
						{/if}
					</span>
					{#if pending.kind === "factory" || pending.kind === "population" || pending.kind === "robots"}
						<button onclick={() => store.bumpPendingCount(-1)} disabled={pending.count <= 1}>−</button>
						<button onclick={() => store.bumpPendingCount(1)}>+1</button>
					{/if}
					<button class="confirm" disabled={!store.pendingValid()} onclick={() => store.confirmPending()}>
						Confirm (◈ {pending.cost})
					</button>
					<button class="cancel" onclick={() => store.cancel()}>Cancel</button>
				</div>
			{:else}
				<div class="flow wrap purchase-options">
					<span class="hint">Your turn. Credits: <strong class="cash">◈ {store.myHandValue}</strong></span>
					<div class="factory-options">
						<div class="factory-label">New factory</div>
						<div class="factory-buttons">
							{#each FACTORY_TYPES as type (type)}
								{@const spec = FACTORIES[type]}
								{@const reason = factoryReason[type]}
								<button
									class="buy res-{type}"
									disabled={!store.canAffordFactory(type)}
									title={reason ??
										`${RESOURCE_LABELS[type]} factory: ◈ ${spec.cost}, ${spec.vp} VP manned, produces a ◈ ${MIN_CARD_VALUE[type]}–${MAX_CARD_VALUE[type]} card each round when manned`}
									onclick={() => store.startFactoryPayment(type)}
								>
									<ResourceIcon resource={type} size={13} />
									{RESOURCE_LABELS[type]} · ◈ {spec.cost}
								</button>
							{/each}
						</div>
					</div>
					<div class="operator-options">
						<span class="group-label">Operators:</span>
						<button
							class="buy"
							disabled={me.population >= store.popMaxOf(store.playerIndex ?? -1) || store.myHandValue < store.popCost}
							title="Recruit a colonist: {store.popCost} credits{me.upgrades.ecoplants > 0
								? ' (Ecoplants discount)'
								: ''}"
							onclick={() => store.startPopulationPayment()}
						>
							Colonist · ◈ {store.popCost}
						</button>
						{#if me.upgrades.robots > 0}
							<button
								class="buy"
								disabled={store.myHandValue < 10}
								title="Buy a robot: 10 credits"
								onclick={() => store.startRobotsPayment()}
							>
								Robot · ◈ 10
							</button>
						{/if}
						<button class="end" onclick={() => store.startManning()}>Assign operators…</button>
					</div>
				</div>
				{#if staged.length > 0}
					<div class="flow">
						<span class="hint gold-hint">
							Staged this turn: {staged.join(", ")} (undo to open an auction).
						</span>
						<button class="cancel" onclick={() => store.undoBuy()}>Undo last</button>
					</div>
				{/if}
				<details class="action-help">
					<summary>How to buy</summary>
					<p class="hint dim">
						Click a market upgrade to auction it, or a buy button and then the hand cards to pay with.
					</p>
				</details>
			{/if}
		{:else}
			<div class="flow">
				<span class="hint dim">{waitingOn}</span>
			</div>
		{/if}
	</div>
{/if}

<style>
	.actionbar {
		box-shadow: var(--panel-bevel);
		background: var(--bg-panel);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 10px 14px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	/* Narrow screens: the bar concludes every interaction (pay, confirm,
	   discard), so keep it pinned while scrolling down to the hand cards. Wide
	   screens already pin the whole sidebar from App.svelte. */
	@media (max-width: 1099px) {
		.actionbar {
			position: sticky;
			top: 10px;
			z-index: 5;
		}
	}
	.flow {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.hint {
		color: var(--text);
		font-size: 13px;
	}
	.hint.dim {
		color: var(--text-dim);
	}
	.gold-hint {
		color: var(--gold);
		font-weight: 600;
	}
	.warn {
		color: var(--danger);
		font-weight: 600;
	}
	.buy {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 5px 10px;
		font-size: 12.5px;
		font-weight: 700;
	}
	.buy.res-ore,
	.buy.res-water,
	.buy.res-titanium,
	.buy.res-research,
	.buy.res-newChemicals {
		border-color: color-mix(in srgb, var(--res) 65%, transparent);
	}
	.buy[class*="res-"] :global(.res-icon) {
		color: var(--res);
	}
	.confirm {
		border-color: var(--gold);
		font-weight: 700;
	}
	.mega-flow {
		row-gap: 6px;
	}
	.mega-row {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 3px 8px;
		border: 1px solid color-mix(in srgb, var(--gold) 35%, transparent);
		border-radius: 2px;
	}
	.mega-name {
		font-size: 12.5px;
		font-weight: 600;
		color: var(--text);
	}
	.mega-name em {
		font-style: normal;
		color: var(--gold);
	}
	.mega-stepper {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.mega-stepper .step {
		min-width: 24px;
		padding: 1px 6px;
		font-size: 13px;
		font-weight: 700;
		line-height: 1.4;
	}
	.mega-stepper .count {
		min-width: 34px;
		text-align: center;
		font-size: 12.5px;
		font-weight: 700;
		color: var(--gold);
	}
	.cancel {
		color: var(--text-dim);
	}
	.end {
		margin-left: auto;
		border-color: var(--gold);
		font-weight: 700;
	}
	.group-label {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dim);
		margin-left: 4px;
		align-self: center;
	}
	.cash {
		color: var(--gold);
	}

	.purchase-options {
		align-items: stretch;
	}
	.purchase-options > .hint {
		flex-basis: 100%;
	}
	.factory-options {
		flex-basis: 100%;
	}
	.factory-label {
		font-size: 12px;
		font-weight: 700;
		color: var(--text);
		margin-bottom: 6px;
	}
	.factory-buttons .buy:not(:disabled) {
		background: color-mix(in srgb, var(--res) 15%, var(--bg-panel));
	}
	.action-help summary {
		cursor: pointer;
		min-height: 44px;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.action-help summary::after {
		content: "+";
		margin-left: auto;
	}
	details[open] > summary::after {
		content: "−";
	}
	.factory-buttons,
	.operator-options {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		align-items: center;
	}
	.operator-options {
		flex-basis: 100%;
		border-top: 1px solid var(--line);
		padding-top: 8px;
	}
	.operator-options .group-label {
		flex-basis: 100%;
		margin: 0;
	}
	.action-help {
		font-size: 12px;
		color: var(--text-dim);
	}
	@media (max-width: 1099px) and (max-height: 600px) {
		.actionbar {
			position: static;
		}
	}
	@media (max-width: 600px) {
		.actionbar {
			padding: 6px 10px;
		}
		.actionbar.browsing {
			position: static;
		}
		.buy,
		.end {
			min-height: 44px;
		}
		.factory-buttons {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.buy {
			padding: 6px;
			font-size: 12px;
		}
	}
</style>
