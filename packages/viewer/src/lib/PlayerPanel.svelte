<script lang="ts">
	import {
		FACTORIES,
		FACTORY_TYPES,
		KICKERS,
		KICKER_SPECS,
		MAX_CARD_VALUE,
		MIN_CARD_VALUE,
		UPGRADE_SPECS,
		UPGRADES,
		handValueExpected,
		handValueRange,
		productionRange,
		operators as availableOperators,
		type GameState,
		type Resource,
	} from "outpost-engine";
	import ProductionCardView from "./ProductionCardView.svelte";
	import ResourceIcon from "./ResourceIcon.svelte";
	import {
		KICKER_EFFECTS,
		RESOURCE_LABELS,
		UPGRADE_EFFECTS,
		effectToText,
		playerColor,
		type ViewerStore,
	} from "./store.svelte";

	interface Props {
		state: GameState;
		store: ViewerStore;
		index: number;
		onNameClick?: (index: number) => void;
	}

	let { state, store, index, onNameClick }: Props = $props();

	const player = $derived(state.players[index]!);
	const isMe = $derived(store.playerIndex === index);
	const avatar = $derived(store.avatars[index]);
	const initial = $derived((player.name.trim()[0] ?? "?").toUpperCase());
	const orderPos = $derived(state.purchaseOrder.indexOf(index) + 1);
	const isActive = $derived(
		!state.ended &&
			((state.phase === "actions" && state.activeSeat === index) ||
				(state.phase === "discard" && player.mustDiscard) ||
				(state.phase === "auction" &&
					(state.auction?.bids ? state.auction.bids[index] === undefined : state.auction?.activeBidder === index)) ||
				(state.phase === "auctionPayment" && state.auction?.highBidder === index))
	);
	const factories = $derived(
		FACTORY_TYPES.map((type) => ({
			type,
			items: player.factories.map((f, i) => ({ ...f, index: i })).filter((f) => f.type === type),
		})).filter((g) => g.items.length > 0)
	);
	const upgrades = $derived(UPGRADES.map((u) => ({ u, n: player.upgrades[u] })).filter((x) => x.n > 0));
	const kickers = $derived(KICKERS.map((k) => ({ k, n: player.kickers[k] })).filter((x) => x.n > 0));
	const hiddenCounts = $derived.by(() => {
		// Mega cards are public and shown as actual cards; only the hidden
		// singles are grouped into per-resource counts.
		const counts = new Map<Resource, number>();
		for (const card of player.hand) {
			if (!card.m) {
				counts.set(card.t, (counts.get(card.t) ?? 0) + 1);
			}
		}
		return [...counts.entries()];
	});
	const manning = $derived(store.manning && isMe);
	// Wily Trader / Merchant House: this panel is a valid exchange target when I
	// have picked a card to offer and this player holds a matching card.
	const exchangeTargetable = $derived(store.myExchange && !isMe && store.exchangeTargets.includes(index));
	const exchangeTargeted = $derived(exchangeTargetable && store.exchangeTarget === index);
	// Cards this seat took in exchanges this step, parked face-down on their Wily
	// Trader / Merchant House. Shown in the hand with an unknown value until the
	// step ends and they land.
	const parkedMine = $derived((state.exchange?.parked ?? []).filter((p) => p.seat === index).map((p) => p.card));
	const operators = $derived(availableOperators(player));
	const pickTotal = $derived(isMe ? store.pickTotal() : 0);
	const pickRequired = $derived(isMe ? store.pickRequired : null);
	const pickCount = $derived(isMe ? store.cardPick.length : 0);
	// While I stage the manning assignment, show the production the STAGED
	// factories would give next round — the range updates live with each toggle.
	const production = $derived.by(() => {
		if (!manning) {
			return productionRange(player);
		}
		const staged = {
			...player,
			factories: player.factories.map((f, i) => ({ ...f, manned: store.manningPick.includes(i) })),
		};
		return productionRange(staged);
	});
</script>

<div
	class="panel"
	data-tutorial={isMe ? "colony" : undefined}
	class:active={isActive}
	class:dropped={player.dropped}
	class:me={isMe}
	class:targetable={exchangeTargetable}
	class:targeted={exchangeTargeted}
	style="--pc: {playerColor(index)}"
>
	{#if exchangeTargetable}
		<button
			class="targethit"
			aria-label="trade with {player.name}"
			title="trade here: they must hand back a higher-valued card of the offered type"
			onclick={() => store.pickExchangeTarget(index)}
		></button>
	{/if}
	<div class="head">
		<button data-bgs-player={index} class="identity" onclick={() => onNameClick?.(index)} title={player.name}>
			{#if orderPos > 0}
				<span class="order" title="Purchase order this round: {orderPos}">{orderPos}</span>
			{/if}
			{#if avatar}
				<img class="avatar" src={avatar} alt="" referrerpolicy="no-referrer" />
			{:else}
				<span class="avatar fallback">{initial}</span>
			{/if}
			<span class="name">{player.name}</span>
		</button>
		{#if exchangeTargetable}
			<span class="tradetarget" title="trade target: they must hand back a higher-valued card of the offered type">
				{exchangeTargeted ? "✓ trading" : "trade"}
			</span>
		{/if}
		<span class="vp" title="victory points">{store.vpOf(index)}<span class="unit">VP</span></span>
	</div>

	<div class="row stats">
		<span title="colonists / population limit">👤 {player.population}/{store.popMaxOf(index)}</span>
		{#if player.robots > 0 || player.upgrades.robots > 0}
			<span title="Robots owned / operating limit. Excess robots remain idle."
				>🤖 {player.robots}/{store.robotMaxOf(index)}</span
			>
		{/if}
		<span title="hand cards counting toward capacity / hand capacity (research and microbiotics are exempt)">
			🂠 {store.countingOf(index)}/{store.handCapOf(index)}
		</span>
		{#if isMe}
			<span class="cash" title="total hand value in credits">◈ {store.myHandValue}</span>
			{#if player.hand.length > 0}
				{@const range = handValueRange(player, true)}
				{#if range.min !== range.max}
					<span
						class="cash dim selfrange"
						title="the hand-value range other players see for you: your card types are public, only the values are hidden (their best guess in parentheses)"
					>
						{range.min}–{range.max}
						<span class="avg">(~{Math.round(handValueExpected(player, true))})</span>
					</span>
				{/if}
			{/if}
		{:else if player.hand.length > 0}
			{@const range = handValueRange(player)}
			<span
				class="cash dim"
				title="possible hand value: card types are public, values are hidden (average shown in parentheses)"
			>
				◈ {range.min === range.max ? range.min : `${range.min}–${range.max}`}
				{#if range.min !== range.max}
					<span class="avg">(~{Math.round(handValueExpected(player))})</span>
				{/if}
			</span>
		{/if}
		{#if production.max > 0}
			<span
				class="prod"
				title="production per round: one card per manned factory plus free cards from producing upgrades (average in parentheses)"
			>
				⚙ ◈ {production.min === production.max ? production.min : `${production.min}–${production.max}`}
				{#if production.min !== production.max}
					<span class="avg">(~{Math.round(production.avg)})</span>
				{/if}
			</span>
		{/if}
		{#if player.done && !state.ended}
			<span class="done" title="has ended their turn this round">✓ done</span>
		{/if}
	</div>

	<div class="row chips" class:manning>
		{#each factories as group (group.type)}
			<span
				class="fgroup res-{group.type}"
				title="{RESOURCE_LABELS[group.type]} factories: {FACTORIES[group.type].vp} VP each and a ◈ {MIN_CARD_VALUE[
					group.type
				]}–{MAX_CARD_VALUE[group.type]} card each round when manned"
			>
				{#each group.items as factory (factory.index)}
					<button
						class="chip"
						class:manned={manning ? store.manningPick.includes(factory.index) : factory.manned}
						class:toggle={manning}
						disabled={!manning}
						title={manning ? "toggle operator" : factory.manned ? "manned" : "unmanned"}
						onclick={() => store.toggleManning(factory.index)}
					>
						<ResourceIcon resource={group.type} size={manning ? 12 : 10} />
					</button>
				{/each}
			</span>
		{/each}
		{#if factories.length === 0}
			<span class="none">no factories</span>
		{/if}
		{#if manning}
			<span class="assign">{`← Assign operators: ${operators}`}</span>
		{/if}
	</div>

	{#if upgrades.length > 0}
		<div class="row tags">
			{#each upgrades as x (x.u)}
				{@const spec = UPGRADE_SPECS[x.u]}
				<span
					class="utag"
					title="{spec.name}: {spec.vp} VP, list {spec.price}. {effectToText(UPGRADE_EFFECTS[x.u])}{x.n > 1
						? ` Owns ${x.n} copies.`
						: ''}"
					>{spec.name}{#if x.n > 1}{` ×${x.n}`}{/if}</span
				>
			{/each}
		</div>
	{/if}

	{#if kickers.length > 0}
		<div class="row tags">
			{#each kickers as x (x.k)}
				{@const spec = KICKER_SPECS[x.k]}
				<span
					class="utag ktag era-{spec.era}"
					title="{spec.name} (Kicker, era {['', 'I', 'II', 'III'][
						spec.era
					]}): {spec.vp} VP, list {spec.price}. {effectToText(KICKER_EFFECTS[x.k])}{x.n > 1
						? ` Owns ${x.n} copies.`
						: ''}"
					>{spec.name}{#if x.n > 1}{` ×${x.n}`}{/if}</span
				>
			{/each}
		</div>
	{/if}

	{#if isMe && pickCount > 0}
		<div class="row picksum">
			{#if pickRequired !== null}
				<span class="total" class:short={pickTotal < pickRequired} class:ok={pickTotal >= pickRequired}>
					◈ {pickTotal} / {pickRequired} selected
				</span>
				{#if pickTotal > pickRequired}
					<span class="lost" title="overpaid credits are lost: the colony gives no change">
						{pickTotal - pickRequired} overpaid
					</span>
				{/if}
			{:else}
				<span class="total">
					{`Selected cards: ${pickCount} · ◈ ${pickTotal}`}
				</span>
			{/if}
		</div>
	{/if}
	{#if isMe && store.myMega && (player.pendingMega?.length ?? 0) > 0}
		<div class="row hand pending">
			<span
				class="pending-label"
				title="cards just produced — values hidden until you commit to Mega cards (rule 12.1)"
			>
				produced:
			</span>
			{#each player.pendingMega ?? [] as card, i (i)}
				<ProductionCardView {card} />
			{/each}
		</div>
	{/if}
	<div class="row hand" data-tutorial={isMe ? "hand" : undefined}>
		{#if isMe}
			{#each player.hand as card, i (i)}
				{#if store.myExchange}
					<ProductionCardView
						{card}
						selectable={store.canOfferInExchange(i)}
						selected={store.exchangeCard === i}
						onclick={() => store.pickExchangeCard(i)}
					/>
				{:else}
					<ProductionCardView
						{card}
						selectable={store.interactive && !store.myMega}
						selected={store.cardPick.includes(i)}
						onclick={() => store.toggleCard(i)}
					/>
				{/if}
			{/each}
			{#each parkedMine as card, i (i)}
				<ProductionCardView {card} parked />
			{/each}
			{#if player.hand.length === 0 && parkedMine.length === 0}
				<span class="none">no cards</span>
			{/if}
		{:else}
			{#each player.hand.filter((c) => c.m) as card, i (i)}
				<ProductionCardView {card} />
			{/each}
			{#each hiddenCounts as [res, n] (res)}
				<span class="hcount res-{res}" title={`${RESOURCE_LABELS[res]} cards: ${n}`}>
					<ResourceIcon resource={res} size={14} />
					{n}
				</span>
			{/each}
			{#each parkedMine as card, i (i)}
				<ProductionCardView {card} />
			{/each}
			{#if player.hand.length === 0}
				<span class="none">no cards</span>
			{/if}
		{/if}
	</div>
	{#if isMe && store.settings !== null}
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
	{/if}
</div>

<style>
	.auto-pass {
		--auto-pass-active: color-mix(in srgb, var(--gold) 35%, var(--text-mid));
		display: flex;
		align-items: center;
		align-self: flex-start;
		gap: 8px;
		min-height: 40px;
		max-width: 100%;
		padding: 6px 9px;
		font-size: 12px;
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
	.panel {
		position: relative;
		background: var(--bg-panel);
		border: 1px solid var(--line);
		border-left: 4px solid var(--pc);
		border-radius: var(--radius);
		padding: 8px 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 220px;
		transition:
			box-shadow 0.2s ease,
			border-color 0.2s ease;
	}
	/* Full-panel click target for the Wily Trader / Merchant House exchange. */
	.targethit {
		position: absolute;
		inset: 0;
		border: none;
		border-radius: var(--radius);
		background: transparent;
		cursor: pointer;
		padding: 0;
		z-index: 2;
	}
	.targethit:hover {
		background: color-mix(in srgb, var(--gold) 8%, transparent);
	}
	.panel.active {
		border-color: var(--pc);
		box-shadow:
			0 0 0 1px var(--pc),
			0 0 14px color-mix(in srgb, var(--pc) 40%, transparent);
	}
	.panel.me {
		background: var(--bg-elevated);
	}
	.panel.targetable {
		cursor: pointer;
		border-color: var(--gold);
		box-shadow: 0 0 8px color-mix(in srgb, var(--gold) 35%, transparent);
	}
	.panel.targetable:hover {
		box-shadow:
			0 0 0 1px var(--gold),
			0 0 14px color-mix(in srgb, var(--gold) 50%, transparent);
	}
	.panel.targeted {
		border-color: var(--gold);
		box-shadow:
			0 0 0 1.5px var(--gold),
			0 0 16px color-mix(in srgb, var(--gold) 60%, transparent);
	}
	.tradetarget {
		font-size: 10px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--gold);
		border: 1px solid var(--gold);
		border-radius: 4px;
		padding: 1px 6px;
	}
	.panel.dropped {
		opacity: 0.45;
		filter: grayscale(0.8);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}
	.identity {
		display: flex;
		align-items: center;
		gap: 8px;
		background: none;
		border: none;
		padding: 0;
		min-width: 0;
	}
	.identity:hover {
		border: none;
	}
	.identity:hover .name {
		color: var(--gold);
	}
	.avatar {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		object-fit: cover;
		border: 2px solid var(--pc);
		flex-shrink: 0;
	}
	.avatar.fallback {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--pc) 30%, var(--bg-elevated));
		color: var(--text);
		font-weight: 800;
		font-size: 14px;
	}
	.name {
		font-weight: 700;
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.vp {
		font-weight: 800;
		color: var(--gold);
		font-size: 16px;
	}
	.vp .unit {
		font-size: 10px;
		font-weight: 700;
		color: var(--text-dim);
		margin-left: 2px;
	}
	.order {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--pc) 25%, var(--bg-elevated));
		border: 1px solid var(--pc);
		color: var(--text);
		font-size: 10px;
		font-weight: 800;
		flex-shrink: 0;
	}
	.row {
		display: flex;
		gap: 5px;
		align-items: center;
		flex-wrap: wrap;
		min-height: 18px;
	}
	.stats {
		font-size: 11.5px;
		color: var(--text-dim);
		gap: 10px;
	}
	.stats .done {
		color: var(--microbiotics);
		font-weight: 700;
	}
	.fgroup {
		display: inline-flex;
		flex-wrap: wrap;
		max-width: 100%;
		box-sizing: border-box;
		gap: 3px;
		padding: 3px 4px;
		border-radius: 6px;
		background: color-mix(in srgb, var(--res) 16%, transparent);
		border: 1px solid color-mix(in srgb, var(--res) 45%, transparent);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: 5px;
		border: 1.5px solid var(--res);
		background: transparent;
		color: var(--res);
		padding: 0;
	}
	.chip.manned {
		background: var(--res);
		color: var(--res-text);
		box-shadow: 0 0 4px color-mix(in srgb, var(--res) 70%, transparent);
	}
	.chip.toggle {
		cursor: pointer;
		width: 22px;
		height: 22px;
	}
	.chip.toggle:hover {
		transform: scale(1.15);
	}
	.chips.manning .fgroup {
		border-color: var(--gold);
		box-shadow: 0 0 6px color-mix(in srgb, var(--gold) 45%, transparent);
		animation: glowPulse 2s ease-in-out infinite;
	}
	.assign {
		color: var(--gold);
		font-size: 11.5px;
		font-weight: 700;
	}
	.stats .cash {
		color: var(--gold);
		font-weight: 700;
	}
	.stats .cash.dim {
		color: color-mix(in srgb, var(--gold) 65%, var(--text-dim));
		font-weight: 600;
	}
	/* Your own public range (what others see for you) sits next to your exact
	   total, smaller and dimmer so it reads as secondary information. */
	.stats .cash.selfrange {
		font-size: 10.5px;
		font-weight: 500;
		opacity: 0.85;
	}
	.stats .avg {
		opacity: 0.75;
		font-weight: 500;
	}
	.stats .prod {
		color: var(--text-mid);
		font-weight: 600;
	}
	.picksum {
		font-size: 12px;
		gap: 8px;
	}
	.picksum .total {
		font-weight: 800;
		color: var(--text);
	}
	.picksum .total.ok {
		color: var(--microbiotics);
	}
	.picksum .total.short {
		color: var(--danger);
	}
	.picksum .lost {
		color: var(--text-dim);
		font-size: 11px;
	}
	.utag {
		font-size: 11px;
		font-weight: 600;
		color: var(--text);
		background: color-mix(in srgb, var(--gold) 14%, var(--bg-elevated));
		border: 1px solid color-mix(in srgb, var(--gold) 40%, transparent);
		border-radius: 4px;
		padding: 1px 6px;
	}
	/* Kicker badges use their era color (era I blue, II orange, III purple). */
	.ktag.era-1 {
		background: color-mix(in srgb, #5aa5e0 16%, var(--bg-elevated));
		border-color: color-mix(in srgb, #5aa5e0 45%, transparent);
	}
	.ktag.era-2 {
		background: color-mix(in srgb, #f08c48 16%, var(--bg-elevated));
		border-color: color-mix(in srgb, #f08c48 45%, transparent);
	}
	.ktag.era-3 {
		background: color-mix(in srgb, #b48ce8 16%, var(--bg-elevated));
		border-color: color-mix(in srgb, #b48ce8 45%, transparent);
	}
	.hand {
		gap: 4px;
	}
	.hand.pending {
		background: color-mix(in srgb, var(--gold) 8%, var(--bg-elevated));
		border: 1px dashed color-mix(in srgb, var(--gold) 45%, transparent);
		border-radius: 6px;
		padding: 4px 6px;
		align-items: center;
	}
	.pending-label {
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--gold);
		margin-right: 2px;
	}
	.hcount {
		display: inline-flex;
		gap: 3px;
		align-items: center;
		justify-content: center;
		min-width: 20px;
		height: 20px;
		padding: 0 4px;
		border-radius: 5px;
		background: var(--res);
		border: 1px solid color-mix(in srgb, var(--res) 60%, #000);
		color: var(--res-text);
		font-size: 11px;
		font-weight: 800;
	}
	.none {
		color: var(--text-dim);
		font-size: 11px;
	}

	@media (max-width: 720px) {
		.panel {
			min-width: 0;
			padding: 6px 8px;
			gap: 4px;
		}
		.avatar {
			width: 24px;
			height: 24px;
		}
		.name {
			font-size: 13px;
		}
		.vp {
			font-size: 14px;
		}
	}
</style>
