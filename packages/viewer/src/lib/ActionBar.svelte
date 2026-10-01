<script lang="ts">
	import {
		FACTORIES,
		FACTORY_TYPES,
		MAX_CARD_VALUE,
		MEGA_CARDS,
		MIN_CARD_VALUE,
		UPGRADE_SPECS,
		auctionCard,
		needsMegaChoice,
		operators,
	} from "outpost-engine";
	import ResourceIcon from "./ResourceIcon.svelte";
	import { RESOURCE_LABELS, type ViewerStore } from "./store.svelte";

	interface Props {
		store: ViewerStore;
	}

	let { store }: Props = $props();

	const state = $derived(store.state);
	$effect(() => {
		store.submitAutomaticMega();
	});
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
				const seats = s.players.flatMap((p, i) => (needsMegaChoice(p) ? [i] : []));
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

{#if state && !state.ended && !store.replay.active}
	<div class="actionbar" class:browsing={store.myActionTurn && !pending} data-tutorial="actions">
		{#if !store.myBidTurn}
			{#if store.myMega && me}
				<div class="flow mega-flow">
					<span class="hint gold-hint">
						Production: choose Mega cards before drawing. Each Mega replaces the production of 4 staffed factories;
						other factories produce single cards.
					</span>
					<span class="hint dim">Choices stay hidden until everyone has confirmed.</span>
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
						cards to offer, then a player to trade with. They must hand back a higher-valued card of the same type if they
						have one.
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
				{/if}
			{:else}
				<div class="flow">
					{#if state?.phase === "mega" && me?.megaChoice !== undefined}
						<span class="hint">Production choice locked.</span>
						<span class="hint dim">Choices stay hidden until everyone has confirmed.</span>
					{/if}
					<span class="hint dim">{waitingOn}</span>
				</div>
			{/if}
		{/if}

		{#if me && store.settings !== null}
			<div class="automatic-settings">
				<button
					class="auto-pass"
					type="button"
					role="switch"
					name="autoPassBids"
					aria-checked={store.autoPassBids}
					onclick={() => store.setAutoPassBids(!store.autoPassBids)}
					disabled={!store.canEditSettings}
					title="Automatically pass an auction when your cards and discounts cannot cover the required bid. This can reveal that your hand is too weak."
				>
					<span class="auto-pass-track" aria-hidden="true"><span class="auto-pass-thumb"></span></span>
					<span class="auto-pass-label">Pass auctions I can't afford</span>
				</button>
				<label
					class="mega-setting"
					title="Automatically submits each round, including this round if you haven't chosen yet."
				>
					<span class="setting-label">Automatic production choice</span>
					<select
						value={store.autoMega}
						onchange={(event) => store.setAutoMega(event.currentTarget.value)}
						disabled={!store.canEditSettings}
					>
						<option value="ask">Megas: ask each round</option>
						<option value="maximum">Always take maximum Megas</option>
						<option value="singles">Always take singles</option>
					</select>
				</label>
			</div>
		{/if}
	</div>
{/if}

<style>
	.automatic-settings {
		border-top: 1px solid var(--line);
		padding-top: 6px;
		margin-top: 4px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px 16px;
	}
	.mega-setting {
		color: var(--text-mid);
		font-size: 11px;
		max-width: 100%;
	}
	.setting-label {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	.mega-setting select {
		color-scheme: dark;
		color: var(--text);
		background: var(--bg-panel);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 6px 8px;
		font: inherit;
		width: 100%;
		min-width: 0;
		min-height: 32px;
	}
	.auto-pass {
		--auto-pass-active: color-mix(in srgb, var(--gold) 35%, var(--text-mid));
		display: flex;
		align-items: center;
		align-self: flex-start;
		gap: 8px;
		min-height: 32px;
		max-width: 100%;
		padding: 2px 0;
		font-size: 11px;
		line-height: 1.3;
		text-align: start;
		color: var(--text-mid);
		border-color: transparent;
		background: transparent;
		cursor: pointer;
		touch-action: manipulation;
	}
	.auto-pass:hover:not(:disabled) {
		border-color: transparent;
		background: color-mix(in srgb, var(--text) 4%, transparent);
	}
	.auto-pass:focus-visible {
		outline: 2px solid var(--gold);
		outline-offset: 2px;
	}
	.auto-pass-track {
		display: flex;
		align-items: center;
		flex: 0 0 30px;
		height: 18px;
		padding: 2px;
		border: 1px solid var(--text-dim);
		border-radius: 9px;
		background: var(--line);
	}
	.auto-pass-thumb {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--text-mid);
	}
	.auto-pass[aria-checked="true"] .auto-pass-track {
		justify-content: flex-end;
		border-color: color-mix(in srgb, var(--auto-pass-active) 55%, var(--line));
		background: color-mix(in srgb, var(--auto-pass-active) 15%, var(--bg-panel));
	}
	.auto-pass[aria-checked="true"] .auto-pass-thumb {
		background: var(--auto-pass-active);
	}
	.auto-pass:disabled {
		cursor: default;
		opacity: 0.6;
	}

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
