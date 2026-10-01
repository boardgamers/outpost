<script lang="ts">
	import { onMount } from "svelte";
	import {
		KICKERS,
		KICKER_SPECS,
		UPGRADE_SPECS,
		type GameState,
		type Upgrade,
		type Resource,
		type FactoryType,
		type MarketCard,
		FACTORIES,
		MIN_CARD_VALUE,
		MAX_CARD_VALUE,
		MEGA_CARDS,
	} from "outpost-engine";
	import ColonyBuilding from "./ColonyBuilding.svelte";
	import CardEffect from "./CardEffect.svelte";
	import ResourceIcon from "./ResourceIcon.svelte";
	import { RESOURCE_LABELS, playerColor, UPGRADE_EFFECTS, KICKER_EFFECTS, type EffectToken } from "./store.svelte";

	let {
		state: gameState,
		playerIndex,
		locale,
	}: { state: GameState; playerIndex?: number; locale?: unknown } = $props();
	let chosen = $state<number | null>(null);
	let page = $state(0);
	let selected = $state<string | null>(null);
	let paused = $state(false);
	let root = $state<HTMLElement | undefined>();
	let offscreen = $state(false);
	let background = $state(false);
	onMount(() => {
		const observer = new IntersectionObserver(([entry]) => {
			offscreen = !entry?.isIntersecting;
		});
		if (root) {
			observer.observe(root);
		}
		const visibility = () => {
			background = document.hidden;
		};
		visibility();
		document.addEventListener("visibilitychange", visibility);
		return () => {
			observer.disconnect();
			document.removeEventListener("visibilitychange", visibility);
		};
	});
	const seat = $derived(chosen ?? playerIndex ?? 0);
	const player = $derived(gameState.players[seat] ?? gameState.players[0]!);
	const colors: Record<string, string> = {
		ore: "#a8bac6",
		water: "#5aa5e0",
		titanium: "#dab260",
		research: "#a397dc",
		newChemicals: "#d095bd",
		microbiotics: "#77b989",
		orbitalMedicine: "#76c9c0",
		ringOre: "#d19a74",
		moonOre: "#c6bc83",
	};
	interface Site {
		id: string;
		name: string;
		type: FactoryType | MarketCard;
		color: string;
		working: boolean;
		factory: boolean;
		resource?: Resource;
		points: number;
		price: number;
		effect?: EffectToken[];
	}
	const sites = $derived.by((): Site[] => {
		const result: Site[] = player.factories.map((f, i) => ({
			id: `f${i}`,
			name: RESOURCE_LABELS[f.type] ?? f.type,
			type: f.type,
			color: colors[f.type]!,
			working: f.manned,
			factory: true,
			resource: f.type,
			points: FACTORIES[f.type].vp,
			price: FACTORIES[f.type].cost,
		}));
		for (const type of Object.keys(player.upgrades) as Upgrade[]) {
			for (let n = 0; n < player.upgrades[type]; n++) {
				const spec = UPGRADE_SPECS[type];
				result.push({
					id: `u${type}${n}`,
					name: spec.name,
					type,
					color: colors[spec.produces ?? "ore"]!,
					working: !!spec.produces,
					resource: spec.produces,
					points: spec.vp,
					price: spec.price,
					effect: UPGRADE_EFFECTS[type],
					factory: false,
				});
			}
		}
		for (const type of KICKERS) {
			for (let n = 0; n < player.kickers[type]; n++) {
				result.push({
					id: `k${type}${n}`,
					name: KICKER_SPECS[type].name,
					points: KICKER_SPECS[type].vp,
					price: KICKER_SPECS[type].price,
					effect: KICKER_EFFECTS[type],
					type,
					color: "#8daeba",
					working: false,
					factory: false,
				});
			}
		}
		return result;
	});
	const pages = $derived(Math.max(1, Math.ceil(sites.length / 8)));
	const currentPage = $derived(Math.min(page, pages - 1));
	const visible = $derived(sites.slice(currentPage * 8, currentPage * 8 + 8));
	const focused = $derived(sites.find((s) => s.id === selected));
	const working = $derived(player.factories.filter((f) => f.manned).length);
	function switchPlayer(value: string) {
		chosen = Number(value);
		page = 0;
		selected = null;
	}
</script>

{#snippet building(site: Site, number: number)}
	<path class="pad" d="M-48 0 0-23 49 0 0 24Z" />
	<path d="M-38-72H38V23H-38Z" fill="transparent" pointer-events="all" />
	<path class="shadow" d="M-12-10 48 12 74 0 17-25Z" />
	<ColonyBuilding type={site.type} resource={site.resource} idle={site.factory && !site.working} />
	<path d="M-36 5-9 18" class="ownership" />
	<circle cx="0" cy="23" r="2.5" class="status" />
	<text x="-36" y="24">{String(number).padStart(2, "0")}</text>
{/snippet}

<section
	class="colony"
	style:--owner={playerColor(seat)}
	bind:this={root}
	class:paused={paused || offscreen || background}
>
	<header>
		<div class="identity">
			<span class="signal"></span><span>Colony surface</span><span class="sector"
				>{String(seat + 1).padStart(2, "0")}</span
			>
		</div>
		<div class="controls">
			<button
				class="motion"
				aria-pressed={paused}
				aria-label={paused ? "Resume motion" : "Pause motion"}
				title={paused ? "Resume motion" : "Pause motion"}
				onclick={() => (paused = !paused)}
			>
				<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"
					>{#if paused}<path d="m8 5 11 7-11 7z" fill="currentColor" />{:else}<path
							d="M8 5v14M16 5v14"
							stroke="currentColor"
							stroke-width="4"
						/>{/if}</svg
				>
			</button>
		</div>
	</header>
	<nav class="player-tabs" aria-label="View colony">
		{#each gameState.players as p, i}
			<button
				class="player-tab"
				style:--player={playerColor(i)}
				aria-pressed={seat === i}
				onclick={() => switchPlayer(String(i))}
				title={p.name}
			>
				<span class="player-number">{i + 1}</span><span class="player-name">{p.name}</span>
			</button>
		{/each}
	</nav>
	<div class="colony-frame">
		<div class="viewport">
			<div class="telemetry">
				<span>{player.name}</span>
				<span
					class="staffing"
					role="img"
					aria-label={`${working}/${player.factories.length} factories staffed`}
					title="Staffed factories"
				>
					<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"
						><path d="M3 20V10l6-4v5l6-4v6h6v7Z" /><path d="M17 13V3h3v10M7 16v2m5-2v2m5-2v2" /></svg
					>
					{working}/{player.factories.length}
				</span>
			</div>
			<svg viewBox="0 0 900 430" role="group" aria-label="Colony buildings">
				<defs>
					<radialGradient id="colony-haze"
						><stop stop-color="#334f60" stop-opacity=".45" /><stop
							offset="1"
							stop-color="#13202a"
							stop-opacity="0"
						/></radialGradient
					>
					<linearGradient id="colony-ground" x2="0.7" y2="1"
						><stop stop-color="#303e47" /><stop offset="1" stop-color="#19252d" /></linearGradient
					>
					<pattern id="colony-grain" width="37" height="29" patternUnits="userSpaceOnUse"
						><circle cx="7" cy="13" r=".8" fill="#80939b" opacity=".25" /><path
							d="m20 22 3 -1 2 2"
							fill="none"
							stroke="#0d1922"
						/></pattern
					>
				</defs>
				<ellipse cx="450" cy="225" rx="420" ry="195" fill="url(#colony-haze)" />
				<path d="M65 217 388 55 836 244 498 417Z" fill="#091219" />
				<path d="M65 202 388 40 836 229 498 402 65 220Z" fill="#111e27" stroke="#3d515f" />
				<path d="M65 202 388 40 836 229 498 387Z" fill="url(#colony-ground)" stroke="#627481" stroke-opacity=".5" />
				<path d="M65 202 388 40 836 229 498 387Z" fill="url(#colony-grain)" />
				<path
					d="m155 239 319-160m-251 190 319-161m-250 190 320-161m-251 190 320-161m-250 190 318-160M134 167l433 185M204 132l433 185M273 97l433 185M342 62l433 185"
					fill="none"
					stroke="#72899a"
					stroke-opacity=".12"
				/>
				{#each visible as site, i (site.id)}
					{@const x = 345 + (i % 4) * 91 - Math.floor(i / 4) * 155}
					{@const y = 119 + (i % 4) * 39 + Math.floor(i / 4) * 80}
					<g
						transform="translate({x} {y})"
						style:--resource={site.color}
						style:--delay="{-i * 0.6}s"
						class:working={site.working}
						class:idle={site.factory && !site.working}
						class:chosen={selected === site.id}
						class="site"
						role="button"
						tabindex="0"
						aria-label={`${site.name}${site.factory ? ` (${site.working ? "manned" : "unmanned"})` : ""}`}
						aria-pressed={selected === site.id}
						onclick={() => (selected = site.id)}
						onkeydown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								selected = site.id;
							}
						}}
					>
						{@render building(site, currentPage * 8 + i + 1)}
					</g>
				{/each}
			</svg>
			<div class="coordinate">OUTPOST / {String(gameState.round).padStart(3, "0")}</div>
		</div>
		{#if pages > 1}
			<nav class="district-strip" aria-label="Colony districts">
				{#each Array.from({ length: pages }, (_, i) => i) as district}
					{@const contents = sites.slice(district * 8, district * 8 + 8)}
					<button
						class="district-card"
						aria-label={`District ${district + 1}`}
						aria-pressed={currentPage === district}
						title={contents.map((site) => site.name).join(", ")}
						onclick={() => {
							page = district;
							selected = null;
						}}
					>
						<svg class="district-preview" viewBox="80 15 750 390" aria-hidden="true" focusable="false">
							<path d="M65 202 388 40 836 229 498 387Z" fill="#24343f" stroke="#5e7482" stroke-width="3" />
							{#each contents as site, i}
								<g
									transform="translate({345 + (i % 4) * 91 - Math.floor(i / 4) * 155} {119 +
										(i % 4) * 39 +
										Math.floor(i / 4) * 80})"
									style:--resource={site.color}
									class:working={site.working}
									class:idle={site.factory && !site.working}
								>
									{@render building(site, district * 8 + i + 1)}
								</g>
							{/each}
						</svg>
						<span class="district-label"
							><span>District {district + 1}</span><span class="district-range"
								>{district * 8 + 1}–{district * 8 + contents.length}</span
							></span
						>
					</button>
				{/each}
			</nav>
		{/if}
	</div>

	<footer>
		<div class="readout" aria-live="polite">
			{#if focused}
				<span class="building-name" style:color={focused.color}>
					{#if focused.resource}<ResourceIcon resource={focused.resource} size={18} />{:else}<svg
							class="ui-icon"
							viewBox="0 0 24 24"
							aria-hidden="true"><path d="m3 8 9-5 9 5v10l-9 4-9-4Zm0 0 9 5 9-5M12 13v9" /></svg
						>{/if}
					<strong>{focused.name}</strong>
				</span>
				{#if focused.factory}
					<span
						class="operation"
						class:operating={focused.working}
						title={focused.working ? "Factory operating" : "Factory idle"}
					>
						<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
							<circle cx="12" cy="12" r="9" />
							{#if focused.working}<path d="m9 7 8 5-8 5z" fill="currentColor" stroke="none" />{:else}<path
									d="M9 8v8m6-8v8"
									stroke-width="2.5"
								/>{/if}
						</svg>
						{focused.working ? "Operating" : "Idle"}
					</span>
				{/if}
				<span class="building-stat">{focused.points} VP{focused.factory ? " when staffed" : ""}</span>
				<span class="building-stat">{focused.factory ? "Build cost" : "Minimum bid"}: ◈ {focused.price}</span>
				<div class="building-details">
					{#if focused.factory}
						{@const type = focused.type as FactoryType}
						{@const spec = FACTORIES[type]}
						<p class="production-detail">
							<ResourceIcon resource={type} size={16} />
							<span
								>Produces 1 {focused.name} card per round when staffed, worth ◈ {MIN_CARD_VALUE[type]}–{MAX_CARD_VALUE[
									type
								]}.</span
							>
						</p>
						<p>
							{focused.working
								? "Operated by one colonist or robot."
								: "No operator assigned. This factory produces no cards and scores no VP until staffed."}
						</p>
						{#if MEGA_CARDS[type]}<p>
								Every 4 staffed {focused.name} factories can produce one Mega card worth ◈ {MEGA_CARDS[type]!.value} instead
								of 4 singles.
							</p>{/if}
						{#if spec.requires}<p>
								Building this factory requires <strong>{UPGRADE_SPECS[spec.requires].name}</strong>.
							</p>{/if}
						{#if spec.needsResearchCard}<p>
								Building this factory requires at least one Research card in the payment.
							</p>{/if}
					{:else if focused.effect}
						<p><CardEffect tokens={focused.effect} {locale} /></p>
						{#if focused.resource}<p>Production is automatic; no colonist or robot is needed.</p>{/if}
					{/if}
				</div>
			{:else}<span>Select a building to inspect it.</span>{/if}
		</div>
	</footer>
</section>

<style>
	.colony {
		border-top: 1px solid var(--line);
		margin-top: 10px;
		color: var(--text-mid);
	}
	header,
	footer,
	.controls,
	.identity,
	nav {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	header {
		justify-content: space-between;
		padding: 12px 0;
		flex-wrap: wrap;
	}
	.identity {
		text-transform: uppercase;
		font: 11px var(--font-console);
		letter-spacing: 1.5px;
	}
	.signal {
		width: 6px;
		height: 6px;
		background: var(--owner);
		box-shadow: 0 0 10px var(--owner);
	}
	.sector {
		color: var(--owner);
	}
	.controls {
		flex-wrap: wrap;
		gap: 6px;
	}
	button {
		color: var(--text-mid);
		background: #14202a;
		border: 1px solid var(--line);
		border-radius: 2px;
		padding: 7px 10px;
		font: 11px var(--font-console);
		min-height: 32px;
		color-scheme: dark;
	}
	button {
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.player-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-bottom: 8px;
	}
	.player-tab {
		display: flex;
		align-items: center;
		gap: 8px;
		max-width: 200px;
		min-width: 0;
		background: transparent;
		border-color: transparent;
		border-bottom: 2px solid transparent;
	}
	.player-tab[aria-pressed="true"] {
		color: var(--text);
		border-bottom-color: var(--player);
		background: color-mix(in srgb, var(--player) 10%, transparent);
	}
	.player-number {
		color: var(--player);
		font-size: 10px;
	}
	.player-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.colony-frame {
		border: 1px solid #2b3b47;
		background: #0c131d;
	}
	.district-strip {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(104px, 132px));
		gap: 8px;
		padding: 10px;
		border-top: 1px solid #2b3b47;
	}
	.district-card {
		padding: 4px;
		text-align: left;
		background: #101c26;
		border: 1px solid #2b3b47;
		min-width: 0;
	}
	.district-card[aria-pressed="true"] {
		border-color: var(--owner);
		background: color-mix(in srgb, var(--owner) 10%, #101c26);
		box-shadow: inset 0 -2px var(--owner);
		color: var(--text);
	}
	.district-card:focus-visible {
		outline: 2px solid var(--text);
		outline-offset: 2px;
	}
	.district-preview {
		display: block;
		width: 100%;
		height: 62px;
		pointer-events: none;
	}
	.district-preview text {
		display: none;
	}
	.district-preview .status {
		animation: none;
	}
	.district-label {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 4px;
		padding: 4px;
		font-size: 10px;
	}
	.district-range {
		color: var(--text-dim);
		font-size: 9px;
	}
	.viewport {
		position: relative;
		overflow: hidden;
		background: radial-gradient(ellipse at 50% 70%, #172735, #0c131d 70%);
	}
	.viewport > svg {
		display: block;
		width: 100%;
		max-height: 440px;
	}
	.telemetry {
		position: absolute;
		top: 16px;
		left: 18px;
		display: grid;
		gap: 8px;
		font: 11px var(--font-console);
		z-index: 1;
		pointer-events: none;
	}
	.telemetry > span:first-child {
		color: var(--owner);
		font-size: 14px;
	}
	.coordinate {
		position: absolute;
		bottom: 12px;
		right: 16px;
		color: #69818f;
		font: 10px var(--font-console);
		letter-spacing: 2px;
	}
	.site {
		cursor: pointer;
		outline: none;
	}
	.pad {
		fill: #22343f;
		stroke: #49606e;
		stroke-width: 0.7;
	}
	.site:hover .pad,
	.site:focus-visible .pad,
	.site.chosen .pad {
		fill: #344d5c;
		stroke: var(--resource);
		stroke-width: 2;
	}
	.shadow {
		fill: #050c12;
		opacity: 0.38;
	}
	.ownership {
		stroke: var(--owner);
		stroke-width: 2;
		opacity: 0.65;
	}
	.status {
		fill: #50616c;
	}
	.working .status {
		fill: var(--resource);
		animation: pulse 3s ease-in-out infinite;
		animation-delay: var(--delay);
	}
	text {
		fill: #9bb0bc;
		font: 8px var(--font-console);
	}
	footer {
		justify-content: space-between;
		min-height: 48px;
		padding: 8px 0;
		font-size: 11px;
	}
	.building-stat {
		color: var(--text-mid);
		padding-left: 10px;
		border-left: 1px solid var(--line);
	}
	.building-details {
		flex-basis: 100%;
		max-width: 760px;
		font-size: 12px;
		line-height: 1.6;
	}
	.building-details p {
		margin: 4px 0;
	}
	.production-detail {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--text);
	}
	.readout {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.ui-icon {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
		display: inline-block;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.building-name,
	.operation,
	.staffing {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.operation {
		border-left: 1px solid var(--line);
		padding-left: 10px;
	}
	.operating {
		color: #8dbdad;
	}
	.motion {
		display: grid;
		place-items: center;
		min-width: 32px;
	}
	.readout strong {
		color: var(--text);
	}
	nav {
		flex-shrink: 0;
		font-family: var(--font-console);
		gap: 8px;
	}
	.paused .status {
		animation-play-state: paused;
	}
	@keyframes pulse {
		50% {
			opacity: 0.4;
		}
	}
	@media (max-width: 600px) {
		.district-strip {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.telemetry {
			top: 10px;
			left: 10px;
			font-size: 9px;
			gap: 4px;
		}
		.telemetry > span:first-child {
			font-size: 11px;
		}
		.viewport > svg {
			width: 135%;
			max-width: none;
			margin-left: -17.5%;
			margin-top: 36px;
		}
		.controls {
			width: 100%;
		}
		.coordinate {
			font-size: 8px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.working .status {
			animation: none;
		}
	}
</style>
