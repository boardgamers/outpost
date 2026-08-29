<script lang="ts">
	import { KICKER_SPECS, UPGRADE_SPECS, upgradeEra } from "outpost-engine";
	import ResourceIcon from "./ResourceIcon.svelte";
	import { RESOURCE_LABELS, type EffectToken } from "./store.svelte";

	interface Props {
		tokens: EffectToken[];
	}

	let { tokens }: Props = $props();
</script>

{#each tokens as token, i (i)}
	{#if typeof token === "string"}
		{token}
	{:else if "r" in token}
		<span class="chip rchip res-{token.r}" title={RESOURCE_LABELS[token.r]}>
			<ResourceIcon resource={token.r} size={11} />
		</span>
	{:else if "card" in token}
		<span class="chip rchip res-{token.card}" title="{RESOURCE_LABELS[token.card]} card">
			<ResourceIcon resource={token.card} size={11} />
		</span>
	{:else if "f" in token}
		<span class="chip fchip res-{token.f}" title="{token.n} {RESOURCE_LABELS[token.f]} factories (manned)">
			<span class="fdots">
				{#each Array.from({ length: token.n }) as _, j (j)}
					<span class="fdot"><ResourceIcon resource={token.f} size={9} /></span>
				{/each}
			</span>
		</span>
	{:else if "u" in token}
		<span
			class="chip uchip era-{upgradeEra(token.u)}"
			title="{UPGRADE_SPECS[token.u].name} (Era {['', 'I', 'II', 'III'][upgradeEra(token.u)]})"
		>
			<span class="chip-era">{["", "I", "II", "III"][upgradeEra(token.u)]}</span>{UPGRADE_SPECS[token.u].name}
		</span>
	{:else}
		<span class="chip kchip">{KICKER_SPECS[token.k].name}</span>
	{/if}
{/each}

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 0.92em;
		font-weight: 700;
		border-radius: 4px;
		padding: 0 4px;
		white-space: nowrap;
		vertical-align: -1px;
	}
	.chip-era {
		font-size: 0.82em;
		font-weight: 800;
	}
	.uchip.era-1 {
		color: #5aa5e0;
		background: color-mix(in srgb, #5aa5e0 14%, transparent);
	}
	.uchip.era-2 {
		color: #f08c48;
		background: color-mix(in srgb, #f08c48 14%, transparent);
	}
	.uchip.era-3 {
		color: #b48ce8;
		background: color-mix(in srgb, #b48ce8 14%, transparent);
	}
	.kchip {
		color: var(--gold);
		background: color-mix(in srgb, var(--gold) 14%, transparent);
	}
	.rchip,
	.fchip {
		color: var(--res);
		background: color-mix(in srgb, var(--res) 14%, transparent);
	}
	.fdots {
		display: inline-flex;
		gap: 1px;
	}
	.fdot {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 13px;
		height: 13px;
		border-radius: 3px;
		background: var(--res);
		color: var(--res-text, #fff);
	}
</style>
