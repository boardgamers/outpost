<script lang="ts">
	import type { MarketCard } from "outpost-engine";

	let { card }: { card: MarketCard } = $props();
	const subjects = {
		dataLibrary: "archive",
		warehouse: "cargo",
		heavyEquipment: "crawler",
		nodule: "habitat",
		scientists: "observatory",
		orbitalLab: "orbital",
		robots: "robot",
		laboratory: "reactor",
		ecoplants: "greenhouse",
		outpost: "colony",
		spaceStation: "station",
		planetaryCruiser: "ship",
		moonBase: "lunar",
		iceProspector: "crawler",
		robotPrototype: "robot",
		smelter: "foundry",
		wilyTrader: "ship",
		launchFacility: "launch",
		merchantHouse: "cargo",
		ncfPrototype: "reactor",
		refinery: "foundry",
		biosphere: "greenhouse",
	} satisfies Record<MarketCard, string>;
	const subject = $derived(subjects[card]);
</script>

<svg viewBox="0 0 160 76" aria-hidden="true" focusable="false">
	<g class="terrain">
		<path d="M0 62 23 54 38 59 68 48 98 59 124 51 160 60V76H0Z" />
		<path d="m0 70 34-6 30 4 43-5 53 7M13 15h2m111 5h2m-83 9h2m98 10h2" />
		<circle cx="126" cy="18" r="11" />
	</g>
	<g class="structure">
		{#if subject === "archive"}
			<path d="m33 56 8-38 66-5 20 14v31l-70 9Z" />
			<path d="m41 18 16 13 70-4M57 31v36M33 56l24 11" />
			<path class="shade" d="m63 36 55-4v8l-55 5Zm0 15 55-5v8l-55 6Z" />
			<path class="light" d="m69 39 23-2m-23 17 23-2m11-14h7m-7 15h7" />
		{:else if subject === "cargo"}
			<path d="M25 60V36l14-15h70l24 15v24Z" />
			<path d="M25 36h108M109 21v39M35 60V40h24v20m8 0V40h32v20M39 21v15" />
			<path class="shade" d="M39 45h17v15H39Zm33 0h23v15H72Z" />
			<path class="light" d="M42 48h11m22 0h17M115 42h10m-10 6h10" />
		{:else if subject === "crawler"}
			<path d="M26 53h69l10 7-9 8H29l-10-8Z" />
			<path d="M38 53V35h36l13 18m-42-18V23h24l8 30M78 38l18-24 23 4 13 27-9 9-12-3m-14-30 16 3 10 22" />
			<path class="shade" d="M49 27h15l3 14H49Z" />
			<path class="light" d="M33 60h58M53 47h15" />
			<circle cx="31" cy="60" r="4" /><circle cx="94" cy="60" r="4" />
		{:else if subject === "robot"}
			<path
				d="M65 12h29v17H65Zm-5 23 38-3 8 25-43 2Zm8 25-5 12h13l5-13m10-1 4 14h14l-8-16M60 38 46 43l-4 19m60-25 15 8 4 13M78 12V6"
			/>
			<path class="shade" d="M70 17h18v7H70ZM70 39h23v12H70Z" />
			<path class="light" d="M73 20h12m-10 23h12m-45 19-7 3m7-3 5 6" />
		{:else if subject === "reactor" || subject === "foundry"}
			<path
				d="M27 61h108v6H27ZM37 61V34h25v27m12 0V24h24v37m11 0V37h18v24M34 34l6-10h19l6 10m6-10 6-11h19l6 11m-26 9h20"
			/>
			<path class="shade" d="M43 40h12v21H43Zm37-5h12v26H80Zm34 7h8v19h-8Z" />
			<path class="light" d="M47 44v11m37-16v16m-22-6h12m24-4h11" />
			{#if subject === "foundry"}<path d="M44 24V12h9v12m64 13V17h7v20" />{/if}
		{:else if subject === "orbital" || subject === "station"}
			<path d="m60 34 35-7 11 13-35 9Z" />
			<path d="M78 31V13h8v16M76 47v18h8V46M60 37H29m76 0h29" />
			<path class="shade" d="M13 25h34v24H13Zm103 0h34v24h-34Z" />
			<path class="light" d="M24 25v24m12-24v24m-23-12h34m80-12v24m12-24v24m-23-12h34M76 36l13-3" />
			{#if subject === "station"}<ellipse class="light" cx="81" cy="38" rx="30" ry="24" />{/if}
		{:else if subject === "ship" || subject === "launch"}
			<path d="m30 47 63-26 36 13-40 20-30 4Z" />
			<path d="m64 34 7-17 19-6 3 10M55 54l-11 12 25-3 20-9m15-9 10 12 20-6-12-14M30 47l29 11" />
			<path class="shade" d="m97 26 17 7-18 5-11-6Z" />
			<path class="light" d="m42 50 14 4m-31-1-12 4m22 2-15 6" />
			{#if subject === "launch"}<path d="M137 60V13h10v53H23m114-45h10m-10 10h10m-10 10h10" />{/if}
		{:else if subject === "observatory"}
			<path
				d="M41 61V43h63v18ZM50 43a22 22 0 0 1 44 0ZM72 21V12m-10 0h20M114 61V41m-13-15 25 13a18 18 0 0 1-25-13Zm10 5 9-12"
			/>
			<path class="shade" d="M61 48h22v13H61Z" />
			<path class="light" d="M66 33h17m-8-12v22" />
		{:else}
			<path
				d="M26 59h109v7H26ZM35 59V46a24 24 0 0 1 48 0v13m-48-13h48m-24-24v37M86 59V41h38v18l-38 1m0-19 12-12 26 12"
			/>
			<path class="shade" d="M48 49h20v10H48Zm47-4h20v14H95Z" />
			<path class="light" d="M45 39h29M99 48h12" />
			{#if subject === "greenhouse"}
				<path class="light" d="M54 59V41m0 10-9-6m9 1 10-9m36 22V44m0 9 10-5" />
			{:else if subject === "colony" || subject === "lunar"}
				<path d="M108 32V12m-8 0 18 8a12 12 0 0 1-18-8ZM20 51V36h10v15m-13-10h16" />
			{/if}
		{/if}
	</g>
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: 100%;
		color: var(--art-line, #7895a5);
		background:
			linear-gradient(0deg, #0c131ba8, transparent 65%),
			repeating-linear-gradient(0deg, #7a9fb008 0 1px, transparent 1px 4px), #19232d;
	}
	.terrain {
		fill: #26313b;
		stroke: #3b4b58;
		stroke-width: 0.7;
	}
	.structure {
		fill: #314450;
		stroke: currentColor;
		stroke-width: 1.2;
		stroke-linejoin: bevel;
	}
	.shade {
		fill: #111c25;
		stroke: #516775;
	}
	.light {
		fill: none;
		stroke: #9abdc6;
		stroke-width: 1.4;
	}
</style>
