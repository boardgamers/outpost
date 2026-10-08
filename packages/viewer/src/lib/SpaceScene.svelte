<script lang="ts">
	import { onMount } from "svelte";
	import {
		FACTORIES,
		KICKERS,
		KICKER_SPECS,
		type Kicker,
		FACTORY_TYPES,
		UPGRADE_SPECS,
		upgradeNumber,
		type FactoryType,
		type GameState,
		type Resource,
		type Upgrade,
	} from "outpost-engine";
	import { RESOURCE_LABELS, type ViewerStore } from "./store.svelte";

	const RESOURCE_COLORS: Record<Resource, string> = {
		ore: "#a8b4c0",
		water: "#5aa5e0",
		titanium: "#d9a53a",
		research: "#9a86e8",
		microbiotics: "#5cbd62",
		newChemicals: "#e082c2",
		orbitalMedicine: "#55ccc6",
		ringOre: "#f08c48",
		moonOre: "#e8c550",
	};

	// A decorative space backdrop: a few asteroids drifting at different speeds,
	// a space station slowly crossing, and an occasional comet. Fixed behind the
	// board (z-index 0); the board sits above it. Asteroids/station are pure CSS;
	// the comet is launched by JS at random intervals/positions/angles so it
	// feels organic rather than a fixed loop. Honors prefers-reduced-motion.
	// The moon surface shows per-player clusters of buildings: one shape per
	// factory type, special structures for upgrades, colored by owner.

	interface Props {
		gameState: GameState | null;
		store: ViewerStore;
	}

	let { gameState, store }: Props = $props();

	interface Building {
		x: number;
		y: number;
		color: string;
		kind: "factory" | "upgrade" | "kicker";
		type: FactoryType | Upgrade | Kicker;
		resource: Resource;
		manned: boolean;
		label: string;
	}

	interface Cluster {
		color: string;
		name: string;
		biosphere: boolean;
		buildings: Omit<Building, "x" | "y">[];
	}

	// The rim path is: M0 70 Q 200 40 420 58 T 820 52 T 1220 62 T 1600 48
	// Piecewise quadratic bezier segments. Compute the exact y for a given x
	// by finding the segment and evaluating the quadratic at parameter t.
	interface Seg {
		x0: number;
		y0: number;
		cx: number;
		cy: number;
		x1: number;
		y1: number;
	}
	const RIM_SEGMENTS: Seg[] = [
		{ x0: 0, y0: 70, cx: 200, cy: 40, x1: 420, y1: 58 },
		{ x0: 420, y0: 58, cx: 640, cy: 76, x1: 820, y1: 52 },
		{ x0: 820, y0: 52, cx: 1000, cy: 28, x1: 1220, y1: 62 },
		{ x0: 1220, y0: 62, cx: 1440, cy: 96, x1: 1600, y1: 48 },
	];

	function surfaceY(x: number): number {
		for (const s of RIM_SEGMENTS) {
			if (x >= s.x0 && x <= s.x1) {
				// Solve quadratic bezier for t given x (x is monotonic in t here).
				// x(t) = (1-t)²x0 + 2(1-t)t·cx + t²x1
				// Rearranged: (x0 - 2cx + x1)t² + 2(cx - x0)t + (x0 - x) = 0
				const a = s.x0 - 2 * s.cx + s.x1;
				const b = 2 * (s.cx - s.x0);
				const c = s.x0 - x;
				let t: number;
				if (Math.abs(a) < 1e-9) {
					t = -c / b;
				} else {
					const disc = b * b - 4 * a * c;
					t = (-b + Math.sqrt(Math.max(0, disc))) / (2 * a);
					if (t < 0 || t > 1) {
						t = (-b - Math.sqrt(Math.max(0, disc))) / (2 * a);
					}
				}
				t = Math.max(0, Math.min(1, t));
				const mt = 1 - t;
				return mt * mt * s.y0 + 2 * mt * t * s.cy + t * t * s.y1;
			}
		}
		return 60;
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
						color: store.playerColor(i),
						kind: "factory",
						type: f.type,
						resource: f.type,
						manned: f.manned,
						label: `${p.name}: ${RESOURCE_LABELS[f.type]} factory (${f.manned ? "manned" : "unmanned"})`,
					});
				}
				for (const u of Object.keys(p.upgrades) as Upgrade[]) {
					const count = p.upgrades[u];
					if (count <= 0) {
						continue;
					}
					const spec = UPGRADE_SPECS[u];
					for (let n = 0; n < count; n++) {
						buildings.push({
							color: store.playerColor(i),
							kind: "upgrade",
							type: u,
							resource: spec.produces ?? (spec.freeFactory as Resource) ?? "ore",
							manned: true,
							label: `${p.name}: ${spec.name}${count > 1 ? ` ×${count}` : ""}`,
						});
					}
				}
				for (const k of KICKERS) {
					if (k === "biosphere") {
						continue;
					}
					for (let n = 0; n < p.kickers[k]; n++) {
						buildings.push({
							color: store.playerColor(i),
							kind: "kicker",
							type: k,
							resource: "ore",
							manned: true,
							label: `${p.name}: ${KICKER_SPECS[k].name} (Kicker)`,
						});
					}
				}
				return { color: store.playerColor(i), name: p.name, biosphere: p.kickers.biosphere > 0, buildings };
			})
			.filter((c) => c.buildings.length > 0);
	});

	// Order buildings so same-family ones sit together: factories first (by
	// resource type), then upgrades (by card number). Within a family, manned
	// before unmanned.
	function familyKey(b: Omit<Building, "x" | "y">): number {
		if (b.kind === "factory") {
			return FACTORY_TYPES.indexOf(b.type as FactoryType);
		}
		if (b.kind === "kicker") {
			return 200 + KICKERS.indexOf(b.type as Kicker);
		}
		return 100 + upgradeNumber(b.type as Upgrade);
	}

	const positioned = $derived.by((): Building[] => {
		const result: Building[] = [];
		const n = clusters.length;
		if (n === 0) {
			return [];
		}

		const margin = 35;
		const usableWidth = 1470;
		const spacing = 24;
		const rowGap = 27;
		for (let ci = 0; ci < n; ci++) {
			const cluster = clusters[ci]!;
			const areaWidth = usableWidth / n;
			const cx = margin + areaWidth * (ci + 0.5);
			const columns = Math.max(2, Math.floor((areaWidth - 32) / spacing));
			const families = new Map<number, Omit<Building, "x" | "y">[]>();
			for (const b of cluster.buildings) {
				const key = familyKey(b);
				const family = families.get(key) ?? [];
				family.push(b);
				families.set(key, family);
			}
			const groups = [...families.entries()].sort((a, b) => a[0] - b[0]).map(([, members]) => members);
			const rows: Omit<Building, "x" | "y">[][] = [];
			for (const kind of ["factory", "upgrade", "kicker"] as const) {
				let row: Omit<Building, "x" | "y">[] = [];
				for (const group of groups.filter((g) => g[0]!.kind === kind)) {
					for (let offset = 0; offset < group.length; offset += columns) {
						const chunk = group.slice(offset, offset + columns);
						if (row.length && row.length + chunk.length > columns) {
							rows.push(row);
							row = [];
						}
						row.push(...chunk);
					}
				}
				if (row.length) {
					rows.push(row);
				}
			}
			for (let ri = 0; ri < rows.length; ri++) {
				const row = rows[ri]!;
				row.forEach((b, col) =>
					result.push({ ...b, x: cx + (col - (row.length - 1) / 2) * spacing, y: surfaceY(cx) + 24 + ri * rowGap })
				);
			}
		}

		// SVG paints in document order: sort by y so lower (closer) buildings
		// render on top of higher ones.
		return result.sort((a, b) => a.y - b.y);
	});

	const biospheres = $derived(
		clusters
			.filter((c) => c.biosphere)
			.map((c) => {
				const buildings = positioned.filter((b) => b.color === c.color);
				const left = Math.min(...buildings.map((b) => b.x)) - 23;
				const right = Math.max(...buildings.map((b) => b.x)) + 23;
				const bottom = Math.max(...buildings.map((b) => b.y)) + 7;
				const top = Math.min(...buildings.map((b) => b.y)) - 40;
				return { ...c, left, right, bottom, top, cx: (left + right) / 2 };
			})
	);
	const groundHeight = $derived(Math.max(160, ...positioned.map((b) => b.y + 18)));

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
	<svg
		class="moon"
		viewBox="0 0 1600 {groundHeight}"
		style:height="{groundHeight}px"
		preserveAspectRatio="xMidYMax slice"
		aria-hidden="true"
	>
		<defs>
			<linearGradient id="moonbody" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#434c54" />
				<stop offset="0.45" stop-color="#303841" />
				<stop offset="1" stop-color="#1f262e" />
			</linearGradient>
		</defs>
		<path
			class="surface"
			fill="url(#moonbody)"
			d="M0 70 Q 200 40 420 58 T 820 52 T 1220 62 T 1600 48 L1600 {groundHeight} L0 {groundHeight} Z"
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

		{#each biospheres as dome}
			<g class="biosphere" style="--bc: {dome.color}">
				<title>{dome.name}: Biosphere</title>
				<path
					class="glass"
					d="M{dome.left} {dome.bottom} C{dome.left} {dome.top}, {dome.left} {dome.top}, {dome.cx} {dome.top} S{dome.right} {dome.top}, {dome.right} {dome.bottom} Z"
				/>
				<path
					class="rib"
					d="M{dome.cx} {dome.top} Q{dome.left + 12} {dome.top} {dome.left +
						18} {dome.bottom} M{dome.cx} {dome.top} Q{dome.right - 12} {dome.top} {dome.right - 18} {dome.bottom}"
				/>
				<ellipse class="seal" cx={dome.cx} cy={dome.bottom} rx={(dome.right - dome.left) / 2} ry="5" />
			</g>
		{/each}
		{#each positioned as b, i (i)}
			<g
				class="bldg"
				class:manned={b.manned}
				class:upgrade={b.kind !== "factory"}
				style="--bc: {b.color}; --rc: {RESOURCE_COLORS[b.resource]}"
				transform="translate({b.x} {b.y})"
			>
				<title>{b.label}</title>
				<ellipse class="footprint" cx="2" cy="1.5" rx="11" ry="2.5" />
				{#if b.type === "ore"}
					<path class="body" d="M-8 0v-6h6v6M0 0l3-17h2L8 0z" /><path
						class="detail"
						d="M2-12h4M1-7h6M3-17l4 5-5 5 6 6"
					/><path class="roof" d="M-9-6l3-3 5 3z" /><path class="signal" d="M-6-4h2" />
				{:else if b.type === "water"}
					<rect class="body" x="-8" y="-13" width="7" height="12" rx="3" /><rect
						class="body"
						x="2"
						y="-17"
						width="6"
						height="16"
						rx="3"
					/><path class="roof" d="M-8-10h7M2-14h6" /><path class="detail" d="M-4-1v-2H5v-2M-8-6h7M2-7h6" /><path
						class="signal"
						d="M4-11h2"
					/>
				{:else if b.type === "titanium"}
					<path class="body" d="M-8 0v-9l5-4 6 4v9zM4 0v-17h4V0" /><path class="roof" d="M-8-9l5-4 6 4M3-17h6" /><path
						class="signal"
						d="M-5-6h5v4h-5z"
					/><path class="detail" d="M5-12h2M5-8h2" />
				{:else if b.type === "research"}
					<path class="body" d="M-8 0v-5a8 8 0 0 1 16 0v5z" /><path class="roof" d="M-8-5h16M-2-12v7" /><path
						class="body"
						d="M-1-13l7-6 2 3-7 6z"
					/><path class="signal" d="M-5-3h3M2-3h3" />
				{:else if b.type === "newChemicals"}
					<path class="body" d="M-8 0v-11l2-2v-4h3v4l2 2V0M2 0v-8l2-3v-3h3v3l2 3v8z" /><path
						class="roof"
						d="M-8-8h7M2-5h7"
					/><path class="detail" d="M-1-5H2M-6-14h3" /><path class="signal" d="M-6-5v3M5-3h2" />
				{:else if b.type === "dataLibrary"}
					<path class="body" d="M-8 0v-12h5V0M-2 0v-16h5V0M4 0v-10h4V0" /><path
						class="roof"
						d="M-8-12h5M-2-16h5M4-10h4"
					/><path class="signal" d="M-6-9h1M-6-6h1M0-12h1M0-9h1M0-6h1M6-7h1" />
				{:else if b.type === "warehouse"}
					<path class="body" d="M-9 0v-10l9-5 9 5V0z" /><path class="roof" d="M-9-10h18L0-15z" /><path
						class="detail"
						d="M-5 0v-7H5v7M-5-4H5M-5-2H5"
					/><path class="signal" d="M-3-9H3" />
				{:else if b.type === "heavyEquipment"}
					<rect class="body" x="-9" y="-4" width="18" height="4" rx="2" /><path
						class="body"
						d="M-6-4v-7h6v7M0-10l5-8 3 1 1 10-3 2-2-2h4L6-14l-4 6z"
					/><path class="signal" d="M-4-9h2v3h-2z" /><path class="detail" d="M-6-2H6" />
				{:else if b.type === "nodule"}
					<path class="body" d="M-8-3v-9l4-4h8l4 4v9L4 0h-8z" /><path class="roof" d="M-8-12h16M-4-16v4M4-16v4" /><path
						class="detail"
						d="M-3 0v-5h6v5"
					/><path class="signal" d="M-5-9h3M2-9h3" />
				{:else if b.type === "scientists"}
					<path class="body" d="M-8 0v-7h12v7" /><path class="body" d="M-3-15a7 7 0 0 0 10 7z" /><path
						class="detail"
						d="M2-10l6-7M7-18l2 2M1-7v-2"
					/><path class="roof" d="M-8-7h12" /><path class="signal" d="M-5-4h5" />
				{:else if b.type === "orbitalLab"}
					<path class="body" d="M-3-3v-13l3-3 3 3v10L0-1z" /><path class="panel" d="M-9-13h5v8h-5zM4-13h5v8H4z" /><path
						class="detail"
						d="M-9-9h5M4-9h5M-3-8h-1M3-8h1M0-1v2"
					/><path class="signal" d="M0-12v5" />
				{:else if b.type === "robots"}
					<path class="body" d="M-6-13v-6H6v6zM-5-11H5v7H-5z" /><path
						class="detail"
						d="M-2-13v2M2-13v2M-5-9h-3v5M5-9h3v5M-3-4v4h-3M3-4v4h3"
					/><path class="signal" d="M-3-16h1M2-16h1" />
				{:else if b.type === "laboratory"}
					<path class="body" d="M-9 0v-6h5v-5h8v5h5v6z" /><path
						class="body"
						d="M0-11v-8M-4-15a4 4 0 1 1 8 0 4 4 0 1 1-8 0z"
					/><path class="detail" d="M-4-15h8M0-19v8" /><path class="signal" d="M-6-3h3M3-3h3" />
				{:else if b.type === "ecoplants"}
					<path class="body" d="M-9 0v-4a9 10 0 0 1 18 0v4z" /><path
						class="roof"
						d="M-9-4H9M0-14C-5-10-5-4-5 0M0-14C5-10 5-4 5 0"
					/><path class="signal" d="M0-2v-7M0-5q-5 0-3-4 3 0 3 4M0-7q0-4 3-4 2 4-3 4" />
				{:else if b.type === "outpost"}
					<path class="body" d="M-5 0v-12H5V0M-8-12v-5H8v5z" /><path class="roof" d="M-9-17l4-3H5l4 3z" /><path
						class="detail"
						d="M0-20v-4M0-23h4M-2 0v-5h4v5"
					/><path class="signal" d="M-5-15H5" />
				{:else if b.type === "spaceStation"}
					<path class="body" d="M-2 0v-20h4V0" /><ellipse class="body" cx="0" cy="-11" rx="9" ry="6" /><ellipse
						class="panel"
						cx="0"
						cy="-11"
						rx="5"
						ry="3"
					/><path class="detail" d="M0-17v3M0-8v3M-9-11h4M5-11h4" /><path class="signal" d="M-6-15l2-1M4-6l2-1" />
				{:else if b.type === "planetaryCruiser"}
					<path class="body" d="M-3-5v-10l3-7 3 7v10l5 4v-8l-5-5M-3-14l-5 5v8z" /><path
						class="roof"
						d="M-3-5h6M-3-15h6"
					/><path class="signal" d="M0-17v3M-1-3v3M2-3v3" />
				{:else if b.type === "moonBase"}
					<path class="body" d="M-9 0v-5a4 4 0 0 1 8 0v5M1 0v-5a4 4 0 0 1 8 0v5" /><path
						class="body"
						d="M-5-4v-7a5 5 0 0 1 10 0v7z"
					/><path class="roof" d="M-5-10H5M-9-4h8M1-4h8" /><path class="detail" d="M0-16v-4l4 1-4 2" /><path
						class="signal"
						d="M-7-2h3M4-2h3M-2-7h4"
					/>
				{:else if b.type === "iceProspector"}
					<path class="body" d="M-8-2v-6h9v6M1-6l4-8h3L5-2" /><path
						class="detail"
						d="M-6 0h6M-3-8v-5l-3-3M5-7l3 2-3 3"
					/><path class="signal" d="M-6-5h3" />
				{:else if b.type === "robotPrototype"}
					<path class="body" d="M-7 0v-17h14V0M-3-10v-4h6v4z" /><path
						class="detail"
						d="M-7-5H7M-3-9h6v4M-1-5v3M2-5v3"
					/><path class="signal" d="M-1-12h2" /><path class="roof" d="M-8-17H8" />
				{:else if b.type === "smelter"}
					<path class="body" d="M-8 0v-7h5l2-7h7l2 14z" /><path class="roof" d="M-2-14h9M-1-10h7" /><path
						class="signal"
						d="M0-6h5v4H0z"
					/><path class="detail" d="M-6-4h2" />
				{:else if b.type === "wilyTrader"}
					<path class="body" d="M-8 0v-8H8V0" /><path class="roof" d="M-9-8l3-5H6l3 5z" /><path
						class="detail"
						d="M-6-13l-1 5M0-13v5M6-13l1 5"
					/><path class="signal" d="M-4-5H4" />
				{:else if b.type === "launchFacility"}
					<path class="body" d="M-9 0v-20h4V0M0-3v-9l3-7 3 7v9z" /><path
						class="detail"
						d="M-9-15h9M-9-9h8M-7-20v20M0-3l-2 3M6-3l2 3"
					/><path class="signal" d="M3-11v3" />
				{:else if b.type === "merchantHouse"}
					<path class="body" d="M-8 0v-12h16V0" /><path class="roof" d="M-9-12l9-6 9 6z" /><path
						class="detail"
						d="M-5-10v8M5-10v8M-2 0v-5h4v5"
					/><path class="signal" d="M-1-10h2" />
				{:else if b.type === "ncfPrototype"}
					<path class="body" d="M-8 0v-15h16V0M-3-12v4l-2 5H5L3-8v-4z" /><path class="roof" d="M-9-15H9" /><path
						class="signal"
						d="M-2-5h4"
					/>
				{:else if b.type === "refinery"}
					<path class="body" d="M-8 0v-17h4V0M0 0v-12h4V0M5 0v-7h4v7" /><path
						class="detail"
						d="M-8-13h4M-8-8h4M-4-5h4M0-9h4M4-3h1"
					/><path class="signal" d="M-6-3v-2M2-5v-2" />
				{/if}
				<path class="base" d="M-10 0H10l-2 2H-8z" />
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
		overflow: visible;
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
		stroke: #76848e;
		stroke-width: 2;
		opacity: 0.7;
	}
	.moon .crater {
		fill: #202830;
	}
	.moon .crater-hi {
		fill: none;
		stroke: #53616b;
		stroke-width: 1.2;
		opacity: 0.6;
	}
	/* Player buildings: factories and upgrades clustered per player.
	   Player color marks the foundations and upgrade lights; unmanned factories are dimmer. */
	.bldg {
		pointer-events: all;
	}

	.biosphere .glass {
		fill: color-mix(in srgb, var(--bc) 8%, transparent);
		stroke: color-mix(in srgb, var(--bc) 65%, #e0fff5);
		stroke-width: 0.9;
	}
	.biosphere .rib {
		fill: none;
		stroke: var(--bc);
		stroke-width: 0.6;
		opacity: 0.3;
	}
	.biosphere .seal {
		fill: none;
		stroke: var(--bc);
		stroke-width: 1;
		opacity: 0.55;
	}
	.bldg {
		stroke-linecap: square;
		stroke-linejoin: bevel;
	}
	.bldg .footprint {
		fill: #17191c;
		opacity: 0.4;
	}
	.bldg .body {
		fill: #29343d;
		stroke: #526674;
		stroke-width: 0.85;
	}
	.bldg .roof {
		fill: #414e57;
		stroke: #8295a1;
		stroke-width: 0.8;
	}
	.bldg .base {
		fill: #263038;
		stroke: color-mix(in srgb, var(--bc) 65%, #637079);
		stroke-width: 0.6;
	}
	.bldg .detail {
		fill: none;
		stroke: #81929c;
		stroke-width: 0.8;
	}
	.bldg .panel {
		fill: #182c3f;
		stroke: #6c8390;
		stroke-width: 0.7;
	}
	.bldg .signal {
		fill: #34424b;
		stroke: #34424b;
		stroke-width: 1;
	}
	.bldg.manned .body {
		fill: #31434f;
		stroke: #8295a1;
	}
	.bldg.manned .roof {
		fill: #485c68;
	}
	.bldg.manned .signal {
		fill: var(--rc);
		stroke: var(--rc);
	}
	.bldg.upgrade .signal {
		fill: color-mix(in srgb, var(--bc) 65%, #c5d3d7);
		stroke: color-mix(in srgb, var(--bc) 65%, #c5d3d7);
	}
	.bldg:hover {
		filter: brightness(1.35);
	}

	@media (prefers-reduced-motion: reduce) {
		.rock,
		.station,
		.comet {
			animation: none;
		}
		.comet {
			display: none;
		}
	}
</style>
