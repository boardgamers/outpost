<script lang="ts">
	import type { FactoryType, MarketCard, Resource } from "outpost-engine";
	import ResourceIcon from "./ResourceIcon.svelte";
	let {
		type,
		resource,
		idle = false,
	}: { type: FactoryType | MarketCard; resource?: Resource; idle?: boolean } = $props();
	const marks: Partial<Record<FactoryType | MarketCard, string>> = {
		ore: "translate(-8 -15)",
		water: "translate(2 -18)",
		titanium: "translate(-7 -26)",
		research: "translate(-9 -20)",
		newChemicals: "translate(6 -14)",
		scientists: "matrix(.85 -.42 0 1 -1 -6)",
		orbitalLab: "translate(-8 -32)",
		spaceStation: "translate(-8 -38)",
		planetaryCruiser: "matrix(.9 -.45 .6 .3 -2 -17)",
		moonBase: "translate(4 -16)",
	};
</script>

<g class="model" class:idle data-building-type={type}>
	{#if type === "ore"}
		<path class="dark" d="M-34-5 0-22 33-6 0 12Z" /><path class="metal" d="M-25-10-7-54 4-49 22 7 12 12-3-33-17-5Z" />
		<path class="line" d="M-22-12 13-1M-15-29 7-20M-9-44 2-37M-7-54 20-42 29-11M20-42V-14" />
		<path class="light" d="m14-16 14-7 8 10-15 8z" /><path class="body" d="M-13-15 10-4V12L-13 1Z" />
	{:else if type === "water"}
		<path class="body" d="M-30-9V-36Q-17-49-4-36V-9Q-17 2-30-9" /><ellipse
			class="light"
			cx="-17"
			cy="-36"
			rx="13"
			ry="6"
		/>
		<path class="metal" d="M-5 3V-29Q10-43 25-29V3Q10 16-5 3" /><ellipse
			class="light"
			cx="10"
			cy="-29"
			rx="15"
			ry="7"
		/>
		<path class="line" d="M-28-21-7-13M-1-2Q10 4 22-2" />
	{:else if type === "titanium"}
		<path class="dark" d="M-31-2 0-18 32-2 0 15Z" /><path class="body" d="M-20-2-12-55 12-55 21-2 0 9Z" /><ellipse
			class="light"
			cy="-55"
			rx="12"
			ry="6"
		/>
		<path class="metal" d="M21 0V-35L33-41V-57H39V-36L28-30V4Z" /><path class="line" d="M-16-36H16M-19-13 0-5 19-13" />
		<path class="glow" d="M-7-1V-8H7V-1Z" />
	{:else if type === "research"}
		<path class="body" d="M-31-6 0-22 31-6V3L0 17-31 3Z" /><path class="glass" d="M-27-7Q-28-52 0-55Q28-42 27-7L0 6Z" />
		<path class="line" d="M0-55V6M-20-34 0-25 23-35M24-15V-67" /><circle class="accent" cx="24" cy="-68" r="2" />
	{:else if type === "newChemicals"}
		<path class="dark" d="M-33-5 0-21 33-5 0 12Z" />
		<path class="body" d="M-29-6V-52Q-23-61-17-52V-6M-12 0V-63Q-6-70 0-63V0M5 4V-43Q12-52 19-43V4" />
		<path class="line" d="M-29-38H-17M-12-49H0M-29-23H-17M-12-31H0M-17-46-12-43M0-36 6-32" />
		<path class="metal" d="M0-17 24-27 33-21V3L10 13 0 7Z" /><path class="light" d="M0-17 10-11 33-21 24-27Z" />
	{:else if type === "dataLibrary"}
		<path class="body" d="M-29-31 5-47 30-34V0L-4 16-29 3Z" /><path class="light" d="M-29-31 5-47 30-34-4-18Z" />
		<path class="line" d="M-4-18V16M3-15 24-25M3-7 24-17M3 1 24-9" /><path
			class="accent"
			d="M-22-23-12-18M-22-14-12-9M-22-5-12 0"
		/>
		<path class="metal" d="M-9-38V-54L5-61 17-54V-43" />
	{:else if type === "warehouse"}
		<path class="body" d="M-35-9V-22Q-17-52 2-29L34-15V4L-2 20Z" /><path
			class="light"
			d="M-35-22Q-17-52 2-29L34-15Q15-38-3-15Z"
		/>
		<path class="dark" d="M4-8 27-18V2L4 13Z" /><path
			class="line"
			d="M7-4 24-12M7 1 24-7M7 6 24-2M-25-28 6-14M-14-33 17-19"
		/>
	{:else if type === "heavyEquipment"}
		<path class="dark" d="M-34-5 5-23 31-10V1L-8 19-34 7Z" /><path class="line" d="m-29 5 19 8 36-17m-48-6 20 8" />
		<path class="metal" d="M-18-20 5-30 20-22V-6L-2 5-18-3Z" /><path class="glass" d="M-12-19 3-26V-12L-12-5Z" />
		<path class="light" d="M13-19 20-53 30-57 40-19 33-16 25-43 21-14Z" /><path
			class="body"
			d="M30-16 43-22 47-6 32 0Z"
		/>
	{:else if type === "nodule"}
		<path class="body" d="M-35-4-27-29-7-38 5-12 35 0 18 15-4 5-16 11Z" />
		<path class="light" d="M-27-29-7-38 10-30 5-12Z" /><path class="glass" d="M-24-18-14-22-9-10-19-6Z" />
		<path class="metal" d="M3-12 22-22 35 0 18 9Z" /><path class="line" d="M-27-2-13 4M12-9 24-14M20 1 28-3" />
	{:else if type === "scientists"}
		<path class="body" d="M-13-9 11-20 30-11V6L6 17-13 8Z" /><path class="light" d="M-13-9 11-20 30-11 6 0Z" />
		<path class="line" d="M-24 4V-38M1-8V-54M-33-53-13-31M-11-64 13-43" />
		<path class="dish" d="M-39-47Q-16-52-11-23Q-33-24-39-47ZM-13-61Q12-66 17-38Q-7-39-13-61Z" />
		<circle class="accent" cx="-25" cy="-37" r="2" />
	{:else if type === "orbitalLab"}
		<path class="line" d="M-15 9 0-19 16 10M0-19V-41" />
		<path class="solar" d="M-43-44-16-33-16-17-43-28ZM16-34 43-47V-30L16-17Z" />
		<path class="line" d="M-36-41V-25M-27-38V-21M24-38V-21M34-43V-26" />
		<path class="metal" d="M-12-36 0-43 13-36V-16L0-9-12-16Z" /><path class="line" d="M0-43V-64M-9-58H9" />
	{:else if type === "robots"}
		<path class="dark" d="M-33 0 0-17 32 0 0 17Z" /><path class="metal" d="M-29 0V-48L12-67 17-61-23-41V4Z" />
		<path class="line" d="M12-65V-28M-23-40 16-21M-4-4V-25L12-38 24-21" /><circle
			class="light"
			cx="12"
			cy="-38"
			r="5"
		/>
		<path class="body" d="M-10-13 1-18 11-13V1L0 6-10 1Z" /><path class="accent" d="M18-21 25-18 30-25" />
	{:else if type === "laboratory"}
		<path class="body" d="M-35 0-12-51 5-44 35-1 5 15Z" /><path class="glass" d="M-12-51 5-44 35-1 13-7Z" />
		<path class="light" d="M-35 0-12-51 13-7 5 15Z" /><path class="glass" d="M-25-4-12-32 2-7-3 4Z" />
		<path class="line" d="M-12-32-12-4M-21-12-4-4M12-28 27-13" />
	{:else if type === "ecoplants"}
		<path class="body" d="M-39-6-5-24 35-7V4L0 22-39 6Z" /><path
			class="glass"
			d="M-39-6Q-28-42-5-24L35-7Q11-23 0 11Z"
		/>
		<path class="line" d="M-28-12Q-19-34-8-18M-16-6Q-7-26 5-12M-3 0Q7-19 18-6" />
		<path class="green" d="m-24-6 4-12 5 10m5 8 4-12 5 10m6 8 4-12 5 10" />
	{:else if type === "outpost"}
		<path class="body" d="M-31-3 0-18 32-3V8L0 22-31 8Z" /><path class="metal" d="M-12-6V-48L5-56 19-48V-6L3 2Z" />
		<path class="light" d="M-20-45 3-57 28-45 5-32Z" /><path class="glass" d="M-20-45 5-32 28-45V-33L5-20-20-33Z" />
		<path class="line" d="M3-57V-77M3-74 20-68 3-62" />
	{:else if type === "spaceStation"}
		<path class="line" d="M-26 8-15-22M25 8 15-22M0 15V-21" />
		<ellipse class="ring" cy="-34" rx="38" ry="20" /><ellipse class="line" cy="-35" rx="30" ry="14" />
		<path class="metal" d="M-8-45 3-51 13-45V-23L2-17-8-23Z" /><path class="line" d="M-36-35H-8M13-35H36M2-51V-68" />
	{:else if type === "planetaryCruiser"}
		<path class="dark" d="M-37 3 12-22 40-8-6 17Z" />
		<path class="body" d="M-37-12-17-35-3-31 30-38 44-33 23-13 8-6-9 3Z" />
		<path class="light" d="M-37-12-17-35-8-17 30-38 44-33 2-9-9 3-13-14Z" />
		<path class="metal" d="M-28-29-19-34-8-13-16-8Z M-13-3-4-8 3 5-6 10Z" />
		<path class="glass" d="M16-27 30-33 25-23 10-17Z" /><path class="accent" d="m-26-14 7-4m9 23 7-4" />
		<path class="line" d="M-21-6V4M7 0V10M27-22V-10" />
	{:else if type === "moonBase"}
		<path class="body" d="M-38 0-17-10 33-4 39 5 9 19Z" /><path class="metal" d="M-20-7 4-19 21-11 1 2Z" />
		<path class="light" d="M-38-1Q-42-33-22-34Q-2-23-6 2L-20 9Z M0 4Q-1-28 18-28Q37-15 34 5L17 14Z" />
		<path class="line" d="M-22-34-20 9M18-28 17 14M-34-11-9-6M3-4 31-2" />
	{:else if type === "iceProspector"}
		<path class="dark" d="M-29-1 10-20 31-10V2L-8 20-29 10Z" /><path
			class="metal"
			d="M-22-16 3-28 22-16V0L-4 12-22 1Z"
		/>
		<path class="glass" d="M-19-15 1-24V-11L-19-2Z" /><path class="light" d="M15-24 24-29 40 1 31 6Z" />
		<path class="line" d="M24-22 32-26M28-15 36-19M32-8 40-12M-23 8-6 15 28-1" />
	{:else if type === "robotPrototype"}
		<path class="metal" d="M-13-28 0-35 14-28V-10L0-3-13-10Z" /><path
			class="light"
			d="M-10-44 2-50 13-44V-31L1-25-10-31Z"
		/>
		<path class="glass" d="M-5-40 9-40V-35H-5Z" /><path
			class="line thick"
			d="M-13-24-26-12-20-3M14-24 27-14 23-5M-7-8-13 8-23 12M7-7 13 10 24 14"
		/>
	{:else if type === "smelter"}
		<path class="body" d="M-33-4V-32L-12-42 7-33V0L-12 10Z" /><path class="light" d="M-33-32-12-42 7-33-13-23Z" />
		<path class="dark" d="M-25-10V-23L-14-18V-4Z" /><path
			class="metal"
			d="M8-13Q21-23 35-13L30 5Q20 13 12 5Z"
		/><ellipse class="ember" cx="21" cy="-13" rx="13" ry="6" />
		<path class="line" d="M3-16 10-10M-22-37V-62H-14V-37" />
	{:else if type === "wilyTrader"}
		<path class="body" d="M-35-12-17-29 12-24 35-6 24 7-15 7Z" /><path class="light" d="M-17-29 12-24 22-11-6-7Z" />
		<path class="glass" d="M-29-12-16-23-9-12-18-3Z" /><path class="metal" d="M-5-7 21-12V3L-5 9Z" /><path
			class="line"
			d="M2-7V6M11-9V4M-25 1V11M21 6V15"
		/>
	{:else if type === "launchFacility"}
		<path class="dark" d="M-33 2 0-14 35 2 0 19Z" /><path
			class="line"
			d="M-26 5V-67H-9M-26-47H-8M-26-27H-8M-26-67-13-47-26-27-13-7"
		/>
		<path class="light" d="M-5-7V-47Q-5-66 4-76Q14-62 14-47V-7Z" /><path
			class="metal"
			d="M-5-21-15-5-5-8M14-21 25-5 14-8"
		/>
		<path class="glass" d="M-3-44H12V-34H-3Z" /><path class="dark" d="M-3-7H12L9 1H0Z" />
	{:else if type === "merchantHouse"}
		<path class="body" d="M-33-5 0-21 33-5V8L0 23-33 8Z" /><path class="light" d="M-38-28 0-47 39-29 0-10Z" />
		<path class="line" d="M-31-25V6M0-11V21M32-25V6" /><path
			class="accent"
			d="M-30-31-15-23M-14-39 2-31M2-44 18-36M17-37 33-29"
		/>
		<path class="metal" d="M-22-4-9-10 3-4-10 2ZM4 7 17 1 27 6 14 12Z" />
	{:else if type === "ncfPrototype"}
		<path class="line" d="M-26 7V-52H23V7M-26-52-9-64H37V-6M23-52 37-64M-26 7 23 7" />
		<ellipse class="glass" cx="-1" cy="-27" rx="19" ry="23" /><path class="metal" d="M-20-29 18-29V-23H-20Z" /><path
			class="line"
			d="M-1-50V-61M-1-4V8"
		/>
		<circle class="accent" cx="-1" cy="-36" r="4" />
	{:else if type === "refinery"}
		<path class="body" d="M-32 0V-51H-22V0M-16 6V-69H-6V6M1 10V-43H11V10" />
		<path class="light" d="M-34-52-27-56-20-52-27-48ZM-18-70-11-74-4-70-11-66ZM-1-44 6-48 13-44 6-40Z" />
		<path class="line" d="M-27-42H-11V-24H6M-29-27H-24M-14-53H-9M-14-36H-9M3-22H8" />
		<ellipse class="metal" cx="26" cy="-5" rx="13" ry="17" /><path class="line" d="M15-5H37" />
	{:else if type === "biosphere"}
		<ellipse class="body" cy="5" rx="40" ry="18" /><path
			class="green"
			d="M-20 6-16-21-12 6M-3 11 2-24 7 11M16 6 21-14 26 6"
		/>
		<path class="glass translucent" d="M-40 5Q-42-58 0-65Q43-45 40 5Q0 34-40 5Z" />
		<path class="line" d="M0-65-24-32-40 5M0-65 24-32 40 5M-24-32H24L0 16ZM-40 5 0 16 40 5M-24-32-22 20M24-32 22 20" />
	{/if}
	{#if resource && marks[type]}
		<g transform={marks[type]}><g class="factory-mark"><ResourceIcon {resource} size={16} /></g></g>
	{/if}
</g>

<style>
	.model {
		stroke-linejoin: bevel;
	}
	.body {
		fill: #344954;
		stroke: #79919e;
		stroke-width: 0.9;
	}
	.metal {
		fill: #4b6472;
		stroke: #8ca2ad;
		stroke-width: 0.9;
	}
	.light {
		fill: #6e8792;
		stroke: #a8bbc3;
		stroke-width: 0.8;
	}
	.dark {
		fill: #16242e;
		stroke: #4d6573;
		stroke-width: 0.8;
	}
	.glass {
		fill: #365969;
		stroke: #96bcc9;
		stroke-width: 1;
	}
	.line {
		fill: none;
		stroke: #91a8b5;
		stroke-width: 1.3;
	}
	.thick {
		stroke-width: 6;
	}
	.solar {
		fill: #233e55;
		stroke: #6c9ab3;
		stroke-width: 1;
	}
	.dish {
		fill: #708a97;
		stroke: #abc1c9;
		stroke-width: 1;
	}
	.ring {
		fill: none;
		stroke: #718c9a;
		stroke-width: 10;
	}
	.green {
		fill: #477a62;
		stroke: #78a18b;
		stroke-width: 2;
	}
	.translucent {
		fill: #456e804a;
	}
	.accent {
		fill: var(--resource);
		stroke: var(--resource);
		stroke-width: 2;
	}
	.ember,
	.glow {
		fill: #bb8c55;
	}
	.factory-mark {
		color: var(--resource);
		opacity: 0.28;
	}
	:global(.working) .factory-mark {
		opacity: 1;
		animation: colony-resource-pulse 3s ease-in-out infinite;
		animation-delay: var(--delay, 0s);
	}
	:global(.paused) .factory-mark {
		animation-play-state: paused;
	}
	:global(.district-preview) .factory-mark {
		animation: none;
	}
	.idle .body,
	.idle .metal,
	.idle .light,
	.idle .glass {
		fill: #29353f;
		stroke: #4b5b64;
	}
	.idle .glow,
	.idle .ember {
		fill: #384149;
	}
	@keyframes colony-resource-pulse {
		50% {
			opacity: 0.55;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.working) .factory-mark {
			animation: none;
		}
	}
</style>
