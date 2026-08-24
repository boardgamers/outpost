<script lang="ts">
	import { FACTORIES, FACTORY_TYPES, UPGRADE_SPECS } from "outpost-engine";
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
			case "discard": {
				const seats = s.players.flatMap((p, i) => (p.mustDiscard ? [i] : []));
				return `Waiting for ${seats.map(name).join(", ")} to discard…`;
			}
			case "actions":
				return `Waiting for ${name(s.activeSeat)} to take their turn…`;
			case "auction":
				return `Auction: waiting for ${name(s.auction?.activeBidder)} to bid…`;
			case "auctionPayment":
				return `Auction: waiting for ${name(s.auction?.highBidder)} to pay…`;
			default:
				return "";
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
	<div class="actionbar">
		{#if store.iMustDiscard && me}
			<div class="flow">
				<span class="hint warn">
					Over hand capacity: discard {store.discardExcess} more card{store.discardExcess === 1 ? "" : "s"}
					(selected {pickCount}; research and microbiotics don't count).
				</span>
				<button class="confirm" disabled={pickCount === 0} onclick={() => store.confirmDiscard()}>
					Discard selected
				</button>
			</div>
		{:else if store.myPayment && me}
			<div class="flow">
				<span class="hint gold-hint">
					You won <strong>{UPGRADE_SPECS[state.auction?.upgrade ?? "dataLibrary"].name}</strong>: select hand cards
					worth at least {store.myPaymentDue} credits (selected <strong>{total}</strong>).
				</span>
				<button class="confirm" disabled={!store.paymentValid()} onclick={() => store.confirmPayment()}>
					Pay {store.myPaymentDue}
				</button>
			</div>
		{:else if store.myActionTurn && me}
			{#if store.manning}
				<div class="flow">
					<span class="hint gold-hint">
						Assign operators: {store.manningPick.length} / {me.population + me.robots} factories manned. Click the factory
						chips in your panel to toggle them.
						{#if staged.length > 0}
							Ending the turn also confirms: {staged.join(", ")}.
						{/if}
					</span>
					<button class="confirm" onclick={() => store.confirmEndTurn()}>Confirm & end turn</button>
					<button class="cancel" onclick={() => store.cancel()}>Back</button>
				</div>
			{:else if pending}
				<div class="flow">
					<span class="hint">
						{#if pending.kind === "factory"}
							Building a <strong>{RESOURCE_LABELS[pending.factory]}</strong> factory:
						{:else if pending.kind === "population"}
							Recruiting <strong>{pending.count}</strong> colonist{pending.count === 1 ? "" : "s"}:
						{:else}
							Buying <strong>{pending.count}</strong> robot{pending.count === 1 ? "" : "s"}:
						{/if}
						selected <strong>{total}</strong> / {pending.cost} credits.
						{#if needsResearch && !hasResearch}
							<span class="warn">Payment must include a research card.</span>
						{/if}
					</span>
					{#if pending.kind === "population" || pending.kind === "robots"}
						<button onclick={() => store.bumpPendingCount(-1)} disabled={pending.count <= 1}>−</button>
						<button onclick={() => store.bumpPendingCount(1)}>+1</button>
					{/if}
					<button class="confirm" disabled={!store.pendingValid()} onclick={() => store.confirmPending()}>
						Confirm ({pending.cost})
					</button>
					<button class="cancel" onclick={() => store.cancel()}>Cancel</button>
				</div>
			{:else}
				<div class="flow wrap">
					<span class="hint">Your turn. Credits: <strong class="cash">◈ {store.myHandValue}</strong></span>
					<span class="group-label">New factory:</span>
					{#each FACTORY_TYPES as type (type)}
						{@const spec = FACTORIES[type]}
						{@const reason = factoryReason[type]}
						<button
							class="buy res-{type}"
							disabled={!store.canAffordFactory(type)}
							title={reason ?? `${RESOURCE_LABELS[type]} factory: ${spec.cost} credits, ${spec.vp} VP`}
							onclick={() => store.startFactoryPayment(type)}
						>
							<ResourceIcon resource={type} size={13} />
							{RESOURCE_LABELS[type]} · {spec.cost}
						</button>
					{/each}
					<span class="group-label">Operators:</span>
					<button
						class="buy"
						disabled={me.population >= store.popMaxOf(store.playerIndex ?? -1) || store.myHandValue < store.popCost}
						title="Recruit a colonist: {store.popCost} credits{me.upgrades.ecoplants > 0
							? ' (Ecoplants discount)'
							: ''}"
						onclick={() => store.startPopulationPayment()}
					>
						Colonist · {store.popCost}
					</button>
					{#if me.upgrades.robots > 0}
						<button
							class="buy"
							disabled={me.robots >= store.robotMaxOf(store.playerIndex ?? -1) || store.myHandValue < 10}
							title="Buy a robot: 10 credits"
							onclick={() => store.startRobotsPayment()}
						>
							Robot · 10
						</button>
					{/if}
					<button class="end" onclick={() => store.startManning()}>End turn…</button>
				</div>
				{#if staged.length > 0}
					<div class="flow">
						<span class="hint gold-hint">
							Staged this turn: {staged.join(", ")} — sent when you end the turn (undo to open an auction).
						</span>
						<button class="cancel" onclick={() => store.undoBuy()}>Undo last</button>
					</div>
				{/if}
				<div class="flow">
					<span class="hint dim">
						Click a market upgrade to auction it, or a buy button and then the hand cards to pay with.
					</span>
				</div>
			{/if}
		{:else if !store.myBidTurn}
			<div class="flow">
				<span class="hint dim">{waitingOn}</span>
			</div>
		{/if}
	</div>
{/if}

<style>
	.actionbar {
		background: var(--bg-panel);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 10px 14px;
		display: flex;
		flex-direction: column;
		gap: 6px;
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
</style>
