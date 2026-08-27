<script lang="ts">
	import { onMount } from "svelte";
	import { UPGRADE_SPECS, type FactoryType, type GameState, type Resource, type Upgrade } from "outpost-engine";
	import { playerColor } from "./store.svelte";

	// A decorative space backdrop: a few asteroids drifting at different speeds,
	// a space station slowly crossing, and an occasional comet. Fixed behind the
	// board (z-index 0); the board sits above it. Asteroids/station are pure CSS;
	// the comet is launched by JS at random intervals/positions/angles so it
	// feels organic rather than a fixed loop. Honors prefers-reduced-motion.
	// The moon surface shows per-player clusters of buildings: one shape per
	// factory type, special structures for producing upgrades, colored by owner.

	interface Props {
		gameState: GameState | null;
	}

	let { gameState }: Props = $props();

	interface Building {
		x: number;
		y: number;
		color: string;
		kind: "factory" | "upgrade";
		type: FactoryType | Upgrade;
		resource: Resource;
		manned: boolean;
	}

	interface Cluster {
		color: string;
		buildings: Omit<Building, "x" | "y">[];
	}

	const clusters = $derived.by((): Cluster[] => {
		if (!gameState) {
			return [];
		}
		return gameState.players
			.map((p, i) => {
				const buildings: Omit<Building, "x" | "y">[] = [];
				for (const f of p.factories) {
					buildings.push({
						color: playerColor(i),
						kind: "factory",
						type: f.type,
						resource: f.type,
						manned: f.manned,
					});
				}
				for (const u of Object.keys(p.upgrades) as Upgrade[]) {
					const count = p.upgrades[u];
					if (count <= 0) {
						continue;
					}
					const spec = UPGRADE_SPECS[u];
					if (!spec.produces && !spec.freeFactory) {
						continue;
					}
					for (let n = 0; n < count; n++) {
						buildings.push({
							color: playerColor(i),
							kind: "upgrade",
							type: u,
							resource: spec.produces ?? (spec.freeFactory as Resource),
							manned: true,
						});
					}
				}
				return { color: playerColor(i), buildings };
			})
			.filter((c) => c.buildings.length > 0);
	});

	const positioned = $derived.by((): Building[] => {
		const result: Building[] = [];
		const xStart = 80;
		const xEnd = 1050;
		const n = clusters.length;
		if (n === 0) {
			return [];
		}
		const clusterSpace = (xEnd - xStart) / n;
		for (let ci = 0; ci < n; ci++) {
			const cluster = clusters[ci]!;
			const cx = xStart + clusterSpace * (ci + 0.5);
			const buildings = cluster.buildings;
			for (let bi = 0; bi < buildings.length; bi++) {
				const b = buildings[bi]!;
				const row = Math.floor(bi / 4);
				const col = bi % 4;
				const rowCount = Math.min(4, buildings.length - row * 4);
				const offsetX = (col - (rowCount - 1) / 2) * 26;
				const x = cx + offsetX;
				const t = x / 1600;
				const baseY = 52 + 18 * Math.sin(t * Math.PI * 2.2) * (1 - t * 0.3);
				const y = baseY - row * 24;
				result.push({ ...b, x, y });
			}
		}
		return result;
	});

	let cometEl = $state<HTMLDivElement | null>(null);

	onMount(() => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !cometEl) {
			return;
		}
		const el = cometEl;
		let timer: ReturnType<typeof setTimeout>;
		const launch = () => {
			// Random start along the top/left, a random shallow dive angle, and a
			// random travel time, then schedule the next pass 25-70s out. The comet
			// flies along its own rotated x-axis, so the tail stays exactly opposite
			// the direction of travel.
			const startTop = 4 + Math.random() * 26; // % from top
			const angle = 8 + Math.random() * 20; // degrees, diving down-right
			const duration = 5 + Math.random() * 4; // seconds across
			const distance = Math.round(window.innerWidth * 1.35); // px to cross the screen
			el.style.setProperty("--comet-top", `${startTop}%`);
			el.style.setProperty("--comet-angle", `${angle}deg`);
			el.style.setProperty("--comet-duration", `${duration}s`);
			el.style.setProperty("--comet-distance", `${distance}px`);
			el.classList.remove("fly");
			// Force a reflow so the animation restarts with the new values.
			void el.offsetWidth;
			el.classList.add("fly");
			// Space subsequent comets out: roughly one every 3 minutes.
			timer = setTimeout(launch, 150000 + Math.random() * 90000);
		};
		// First comet after ~40s so the scene doesn't feel static on arrival.
		timer = setTimeout(launch, 38000 + Math.random() * 6000);
		return () => clearTimeout(timer);
	});
</script>

<div class="scene" aria-hidden="true">
	<!-- Asteroids: irregular rocks tumbling slowly across the sky. -->
	<svg class="rock r1" viewBox="0 0 24 24"><path d="M4 6 10 3l8 3 3 7-4 6-8 2-6-4z" /></svg>
	<svg class="rock r2" viewBox="0 0 24 24"><path d="M5 5 12 2l7 4 2 8-5 6-8 1-5-5z" /></svg>
	<svg class="rock r3" viewBox="0 0 24 24"><path d="M6 4 13 3l6 5 1 7-6 5-7-1-3-7z" /></svg>

	<!-- A space station drifting across on a long, slow orbit. -->
	<svg class="station" viewBox="0 0 48 24">
		<rect x="20" y="9" width="8" height="6" rx="1.5" />
		<rect x="4" y="10.5" width="14" height="3" rx="1" />
		<rect x="30" y="10.5" width="14" height="3" rx="1" />
		<rect x="22.5" y="2" width="3" height="5" rx="1" />
		<rect x="22.5" y="17" width="3" height="5" rx="1" />
		<circle cx="24" cy="12" r="2.2" class="core" />
	</svg>

	<!-- An occasional comet with a fading tail, launched at random intervals. -->
	<div class="comet" bind:this={cometEl}><span class="head"></span><span class="tail"></span></div>

	<!-- The outpost's moon: a cratered limb along the bottom with player buildings. -->
	<svg class="moon" viewBox="0 0 1600 160" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
		<defs>
			<linearGradient id="moonbody" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#7a6a55" />
				<stop offset="0.45" stop-color="#5d5140" />
				<stop offset="1" stop-color="#3c352a" />
			</linearGradient>
		</defs>
		<path
			class="surface"
			fill="url(#moonbody)"
			d="M0 70 Q 200 40 420 58 T 820 52 T 1220 62 T 1600 48 L1600 160 L0 160 Z"
		/>
		<path class="rim" d="M0 70 Q 200 40 420 58 T 820 52 T 1220 62 T 1600 48" />
		<g class="craters">
			<ellipse class="crater" cx="300" cy="95" rx="34" ry="9" />
			<ellipse class="crater-hi" cx="300" cy="92" rx="34" ry="8" />
			<ellipse class="crater" cx="620" cy="108" rx="22" ry="6" />
			<ellipse class="crater-hi" cx="620" cy="105" rx="22" ry="5" />
			<ellipse class="crater" cx="980" cy="92" rx="28" ry="8" />
			<ellipse class="crater-hi" cx="980" cy="89" rx="28" ry="7" />
			<ellipse class="crater" cx="1330" cy="104" rx="18" ry="5" />
			<ellipse class="crater" cx="90" cy="112" rx="20" ry="6" />
		</g>
		<g class="outpost">
			<path d="M1152 58 a13 13 0 0 1 26 0 z" />
			<path d="M1184 60 a9 9 0 0 1 18 0 z" />
			<rect x="1150" y="57" width="54" height="3" rx="1" />
			<rect x="1206" y="34" width="2.5" height="26" rx="1" />
			<circle cx="1207.2" cy="32" r="3" class="beacon" />
			<rect x="1128" y="52" width="12" height="8" rx="1" />
			<rect x="1157" y="52" width="3" height="4" rx="0.5" class="win" />
			<rect x="1164" y="52" width="3" height="4" rx="0.5" class="win" />
			<rect x="1187" y="55" width="2.5" height="3.5" rx="0.5" class="win" />
		</g>
		{#each positioned as b, i (i)}
			<g
				class="bldg"
				class:manned={b.manned}
				class:upgrade={b.kind === "upgrade"}
				style="--bc: {b.color}"
				transform="translate({b.x} {b.y})"
			>
				{#if b.kind === "factory"}
					{#if b.type === "ore"}
						<path class="body" d="M-8 0 a8 8 0 0 1 16 0 z" />
						<rect class="base" x="-9" y="-1" width="18" height="2" rx="0.8" />
					{:else if b.type === "water"}
						<rect class="body" x="-6" y="-12" width="12" height="12" rx="3" />
						<rect class="base" x="-8" y="-1" width="16" height="2" rx="0.8" />
						<line class="detail" x1="6" y1="-6" x2="10" y2="-6" />
					{:else if b.type === "titanium"}
						<path class="body" d="M-7 0 L-4 -10 L4 -10 L7 0 z" />
						<rect class="base" x="-8" y="-1" width="16" height="2" rx="0.8" />
					{:else if b.type === "research"}
						<path class="body" d="M-7 0 a7 7 0 0 1 14 0 z" />
						<line class="detail" x1="0" y1="-7" x2="0" y2="-13" />
						<circle class="detail" cx="0" cy="-14.5" r="1.8" />
						<rect class="base" x="-8" y="-1" width="16" height="2" rx="0.8" />
					{:else if b.type === "newChemicals"}
						<path class="body" d="M-2 -14 L-2 -8 L-6 0 L6 0 L2 -8 L2 -14 z" />
						<rect class="base" x="-7" y="-1" width="14" height="2" rx="0.8" />
					{/if}
				{:else}
					{#if b.type === "laboratory"}
						<path class="body" d="M-9 0 a9 9 0 0 1 18 0 z" />
						<line class="detail" x1="0" y1="-9" x2="0" y2="-15" />
						<circle class="detail" cx="0" cy="-16" r="2" />
						<rect class="base" x="-10" y="-1" width="20" height="2" rx="0.8" />
					{:else if b.type === "scientists"}
						<path class="body" d="M-7 0 a7 7 0 0 1 14 0 z" />
						<line class="detail" x1="3" y1="-5" x2="8" y2="-12" />
						<circle class="detail" cx="9" cy="-13" r="1.5" />
						<rect class="base" x="-8" y="-1" width="16" height="2" rx="0.8" />
					{:else if b.type === "orbitalLab"}
						<rect class="body" x="-5" y="-10" width="10" height="10" rx="1.5" />
						<rect class="detail" x="-12" y="-7" width="6" height="3" rx="0.5" />
						<rect class="detail" x="6" y="-7" width="6" height="3" rx="0.5" />
						<rect class="base" x="-7" y="-1" width="14" height="2" rx="0.8" />
					{:else if b.type === "spaceStation"}
						<circle class="body" cx="0" cy="-7" r="5" />
						<ellipse class="detail" cx="0" cy="-7" rx="10" ry="3" />
						<rect class="base" x="-6" y="-1" width="12" height="2" rx="0.8" />
					{:else if b.type === "planetaryCruiser"}
						<path class="body" d="M-8 0 L0 -14 L8 0 z" />
						<circle class="detail" cx="0" cy="-5" r="1.5" />
						<rect class="base" x="-9" y="-1" width="18" height="2" rx="0.8" />
					{:else if b.type === "moonBase"}
						<path class="body" d="M-10 0 a5 5 0 0 1 10 0 z" />
						<path class="body" d="M0 0 a6 6 0 0 1 12 0 z" />
						<path class="body" d="M-4 0 a4 4 0 0 1 8 0 z" transform="translate(-2 -3)" />
						<rect class="base" x="-11" y="-1" width="24" height="2" rx="0.8" />
					{:else if b.type === "outpost"}
						<rect class="body" x="-5" y="-14" width="10" height="14" rx="1" />
						<line class="detail" x1="0" y1="-14" x2="0" y2="-19" />
						<circle class="detail" cx="0" cy="-20" r="1.5" />
						<rect class="base" x="-7" y="-1" width="14" height="2" rx="0.8" />
					{:else}
						<path class="body" d="M-7 0 a7 7 0 0 1 14 0 z" />
						<rect class="base" x="-8" y="-1" width="16" height="2" rx="0.8" />
					{/if}
				{/if}
				{#if b.manned}
					<circle class="win" cx="0" cy="-4" r="1.2" />
				{/if}
			</g>
		{/each}
	</svg>
</div>

<style>
	.scene {
		position: fixed;
		inset: 0;
		z-index: 0;
		pointer-events: none;
		overflow: hidden;
	}

	.rock {
		position: absolute;
		/* Opaque blends of the old translucent greys over the bg: the rocks are
	   nearer than the starfield, so they must occlude stars, not let them
	   shine through. */
		fill: #2c3038;
		animation-name: drift, tumble;
		animation-timing-function: linear, linear;
		animation-iteration-count: infinite, infinite;
	}
	.r1 {
		width: 26px;
		top: 18%;
		animation-duration: 150s, 38s;
		animation-delay: -30s, 0s;
	}
	.r2 {
		width: 16px;
		top: 64%;
		fill: #24272e;
		animation-duration: 200s, 52s;
		animation-delay: -120s, 0s;
	}
	.r3 {
		width: 20px;
		top: 84%;
		fill: #282b33;
		animation-duration: 175s, 44s;
		animation-delay: -70s, 0s;
	}
	@keyframes drift {
		from {
			left: -6%;
		}
		to {
			left: 104%;
		}
	}
	@keyframes tumble {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.station {
		position: absolute;
		width: 56px;
		top: 40%;
		fill: rgba(140, 200, 240, 0.4);
		animation: orbit 220s linear infinite;
		animation-delay: -100s;
	}
	.station .core {
		fill: rgba(88, 182, 220, 0.7);
	}
	@keyframes orbit {
		from {
			left: -8%;
			transform: translateY(0) rotate(-4deg);
		}
		50% {
			transform: translateY(-3vh) rotate(4deg);
		}
		to {
			left: 106%;
			transform: translateY(0) rotate(-4deg);
		}
	}

	.comet {
		position: absolute;
		top: var(--comet-top, 12%);
		left: 0;
		width: 120px;
		height: 3px;
		opacity: 0;
	}
	.comet:global(.fly) {
		/* Fly along the comet's own rotated x-axis: rotate first, then translate
	   along that rotated axis, so velocity and tail are always collinear. */
		animation: cometfly var(--comet-duration, 7s) linear forwards;
	}
	.comet .head {
		position: absolute;
		right: 0;
		top: -1.5px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: rgba(230, 240, 250, 0.95);
		box-shadow: 0 0 8px 2px rgba(180, 210, 245, 0.6);
	}
	.comet .tail {
		position: absolute;
		right: 5px;
		top: 0.5px;
		width: 110px;
		height: 2px;
		border-radius: 2px;
		background: linear-gradient(to left, rgba(200, 225, 250, 0.7), transparent);
	}
	@keyframes cometfly {
		0% {
			transform: rotate(var(--comet-angle, 18deg)) translateX(-15vw);
			opacity: 0;
		}
		6% {
			opacity: 1;
		}
		85% {
			opacity: 1;
		}
		100% {
			transform: rotate(var(--comet-angle, 18deg)) translateX(var(--comet-distance, 120vw));
			opacity: 0;
		}
	}

	.moon {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		width: 100%;
		height: 160px;
		display: block;
	}
	.moon .rim {
		fill: none;
		stroke: #97815f;
		stroke-width: 2;
		opacity: 0.7;
	}
	.moon .crater {
		fill: #453c2e;
	}
	.moon .crater-hi {
		fill: none;
		stroke: #87714f;
		stroke-width: 1.2;
		opacity: 0.6;
	}
	.moon .outpost {
		fill: #2a2f3a;
	}
	.moon .outpost .win {
		fill: rgba(240, 200, 120, 0.85);
	}
	.moon .outpost .beacon {
		fill: rgba(88, 182, 220, 0.9);
		animation: beacon 2.6s ease-in-out infinite;
	}
	@keyframes beacon {
		0%,
		100% {
			opacity: 0.25;
		}
		50% {
			opacity: 1;
		}
	}

	/* Player buildings: factories and producing upgrades clustered per player.
	   Player color is the outline/accent; unmanned factories are dimmer. */
	.bldg .body {
		fill: #1a1e26;
		stroke: var(--bc);
		stroke-width: 1.2;
		opacity: 0.5;
	}
	.bldg .base {
		fill: #1a1e26;
		stroke: var(--bc);
		stroke-width: 0.8;
		opacity: 0.5;
	}
	.bldg .detail {
		stroke: var(--bc);
		stroke-width: 1;
		fill: none;
		opacity: 0.5;
	}
	.bldg.manned .body {
		fill: color-mix(in srgb, var(--bc) 35%, #1a1e26);
		opacity: 0.9;
	}
	.bldg.manned .base {
		fill: color-mix(in srgb, var(--bc) 25%, #1a1e26);
		opacity: 0.9;
	}
	.bldg.manned .detail {
		opacity: 0.9;
	}
	.bldg.upgrade .body {
		stroke-width: 1.4;
	}
	.bldg .win {
		fill: rgba(255, 240, 200, 0.9);
		animation: domeGlow 3s ease-in-out infinite;
	}
	@keyframes domeGlow {
		0%,
		100% {
			opacity: 0.5;
		}
		50% {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.rock,
		.station,
		.comet,
		.moon .outpost .beacon,
		.bldg .win {
			animation: none;
		}
		.comet {
			display: none;
		}
	}
</style>
