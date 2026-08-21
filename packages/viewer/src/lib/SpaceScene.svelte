<script lang="ts">
	import { onMount } from "svelte";

	// A decorative space backdrop: a few asteroids drifting at different speeds,
	// a space station slowly crossing, and an occasional comet. Fixed behind the
	// board (z-index 0); the board sits above it. Asteroids/station are pure CSS;
	// the comet is launched by JS at random intervals/positions/angles so it
	// feels organic rather than a fixed loop. Honors prefers-reduced-motion.

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

	<!-- The outpost's moon: a cratered limb along the bottom with factory domes. -->
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
		fill: rgba(150, 160, 175, 0.22);
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
		fill: rgba(150, 160, 175, 0.16);
		animation-duration: 200s, 52s;
		animation-delay: -120s, 0s;
	}
	.r3 {
		width: 20px;
		top: 84%;
		fill: rgba(150, 160, 175, 0.19);
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

	@media (prefers-reduced-motion: reduce) {
		.rock,
		.station,
		.comet,
		.moon .outpost .beacon {
			animation: none;
		}
		.comet {
			display: none;
		}
	}
</style>
