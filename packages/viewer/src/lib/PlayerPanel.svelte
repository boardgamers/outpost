<script lang="ts">
	import {
		FACTORIES,
		FACTORY_TYPES,
		MAX_CARD_VALUE,
		MIN_CARD_VALUE,
		UPGRADE_SPECS,
		UPGRADES,
		handValueRange,
		type GameState,
		type Resource,
	} from "outpost-engine";
	import ProductionCardView from "./ProductionCardView.svelte";
	import ResourceIcon from "./ResourceIcon.svelte";
	import { RESOURCE_LABELS, UPGRADE_EFFECTS, playerColor, type ViewerStore } from "./store.svelte";

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
	const hiddenCounts = $derived.by(() => {
		const counts = new Map<Resource, number>();
		for (const card of player.hand) {
			counts.set(card.t, (counts.get(card.t) ?? 0) + 1);
		}
		return [...counts.entries()];
	});
	const manning = $derived(store.manning && isMe);
	const operators = $derived(player.population + player.robots);
	const pickTotal = $derived(isMe ? store.pickTotal() : 0);
	const pickRequired = $derived(isMe ? store.pickRequired : null);
	const pickCount = $derived(isMe ? store.cardPick.length : 0);
</script>

<div
	class="panel"
	class:active={isActive}
	class:dropped={player.dropped}
	class:me={isMe}
	style="--pc: {playerColor(index)}"
>
	<div class="head">
		<button class="identity" onclick={() => onNameClick?.(index)} title={player.name}>
			{#if orderPos > 0}
				<span
					class="order"
					title="purchase order: buys {orderPos}{orderPos === 1
						? 'st'
						: orderPos === 2
							? 'nd'
							: orderPos === 3
								? 'rd'
								: 'th'} this round">{orderPos}</span
				>
			{/if}
			{#if avatar}
				<img class="avatar" src={avatar} alt="" referrerpolicy="no-referrer" />
			{:else}
				<span class="avatar fallback">{initial}</span>
			{/if}
			<span class="name">{player.name}</span>
		</button>
		<span class="vp" title="victory points">{store.vpOf(index)}<span class="unit">VP</span></span>
	</div>

	<div class="row stats">
		<span title="colonists / population limit">👤 {player.population}/{store.popMaxOf(index)}</span>
		{#if player.robots > 0 || player.upgrades.robots > 0}
			<span title="robots / robot limit">🤖 {player.robots}/{store.robotMaxOf(index)}</span>
		{/if}
		<span title="hand cards counting toward capacity / hand capacity (research and microbiotics are exempt)">
			🂠 {store.countingOf(index)}/{store.handCapOf(index)}
		</span>
		{#if isMe}
			<span class="cash" title="total hand value in credits">◈ {store.myHandValue}</span>
		{:else if player.hand.length > 0}
			{@const range = handValueRange(player)}
			<span class="cash dim" title="possible hand value: card types are public, values are hidden">
				◈ {range.min === range.max ? range.min : `${range.min}–${range.max}`}
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
			<span class="assign">← click to assign your {operators} operator{operators === 1 ? "" : "s"}</span>
		{/if}
	</div>

	{#if upgrades.length > 0}
		<div class="row tags">
			{#each upgrades as x (x.u)}
				{@const spec = UPGRADE_SPECS[x.u]}
				<span
					class="utag"
					title="{spec.name}: {spec.vp} VP, list {spec.price}. {UPGRADE_EFFECTS[x.u]}{x.n > 1
						? ` Owns ${x.n} copies.`
						: ''}"
					>{spec.name}{#if x.n > 1}×{x.n}{/if}</span
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
					{pickCount} card{pickCount === 1 ? "" : "s"} selected · ◈ {pickTotal}
				</span>
			{/if}
		</div>
	{/if}
	<div class="row hand">
		{#if isMe}
			{#each player.hand as card, i (i)}
				<ProductionCardView
					{card}
					selectable={store.interactive}
					selected={store.cardPick.includes(i)}
					onclick={() => store.toggleCard(i)}
				/>
			{/each}
			{#if player.hand.length === 0}
				<span class="none">no cards</span>
			{/if}
		{:else}
			{#each hiddenCounts as [res, n] (res)}
				<span class="hcount res-{res}" title="{n} {RESOURCE_LABELS[res]} card{n === 1 ? '' : 's'}">{n}</span>
			{/each}
			{#if player.hand.length === 0}
				<span class="none">no cards</span>
			{/if}
		{/if}
	</div>
</div>

<style>
	.panel {
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
	.panel.active {
		border-color: var(--pc);
		box-shadow:
			0 0 0 1px var(--pc),
			0 0 14px color-mix(in srgb, var(--pc) 40%, transparent);
	}
	.panel.me {
		background: var(--bg-elevated);
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
	.hand {
		gap: 4px;
	}
	.hcount {
		display: inline-flex;
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
