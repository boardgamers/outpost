<script lang="ts">
	import { UPGRADE_SPECS, upgradeEra, type Resource, type Upgrade } from "outpost-engine";
	import ResourceIcon from "./ResourceIcon.svelte";
	import { RESOURCE_LABELS } from "./store.svelte";

	interface Props {
		text: string;
	}

	let { text }: Props = $props();

	type Token =
		| { kind: "text"; value: string }
		| { kind: "upgrade"; upgrade: Upgrade }
		| { kind: "resource"; resource: Resource }
		| { kind: "factory"; resource: Resource; count: number; label: string };

	const UPGRADE_NAMES = new Map<Upgrade, string>(
		(Object.keys(UPGRADE_SPECS) as Upgrade[]).map((u) => [u, UPGRADE_SPECS[u].name])
	);
	const RESOURCE_NAMES = new Map<Resource, string>(
		(Object.entries(RESOURCE_LABELS) as [Resource, string][]).map(([r, label]) => [r, label])
	);

	// Longest-first so "New Chemicals" / "Orbital Medicine" / "Ring Ore" / "Moon Ore"
	// match before their single-word prefixes ("New", "Ring", "Moon", "Ore").
	const NAMES: { label: string; token: Token }[] = [
		...[...UPGRADE_NAMES.entries()].map(([upgrade, label]) => ({
			label,
			token: { kind: "upgrade", upgrade } as Token,
		})),
		...[...RESOURCE_NAMES.entries()].map(([resource, label]) => ({
			label,
			token: { kind: "resource", resource } as Token,
		})),
	].sort((a, b) => b.label.length - a.label.length);

	// "2 ore factories" / "two Ore factories" → a factory token (manned-factory icons).
	const RESOURCE_WORD = [...RESOURCE_NAMES.values()].join("|");
	const FACTORY_RE = new RegExp(`^(\\d+)\\s+(${RESOURCE_WORD})\\s+factories`, "i");

	function tokenize(value: string): Token[] {
		const tokens: Token[] = [];
		let rest = value;
		while (rest.length > 0) {
			const factory = FACTORY_RE.exec(rest);
			if (factory) {
				const word = (factory[2] as string).toLowerCase();
				const resource = [...RESOURCE_NAMES.entries()].find(([, label]) => label.toLowerCase() === word)?.[0];
				if (resource) {
					tokens.push({ kind: "factory", resource, count: Number(factory[1]), label: factory[0] as string });
					rest = rest.slice((factory[0] as string).length);
					continue;
				}
			}
			let matched = false;
			for (const { label, token } of NAMES) {
				if (rest.startsWith(label)) {
					// Word boundary: the next character must not be a letter (so "Ore"
					// doesn't match inside "Oreload"-like words, and "Robots" the upgrade
					// isn't matched by a "Robot" prefix).
					const next = rest[label.length];
					if (next === undefined || !/[a-zA-Z]/.test(next)) {
						tokens.push(token);
						rest = rest.slice(label.length);
						matched = true;
						break;
					}
				}
			}
			if (!matched) {
				// Accumulate plain text up to the next potential name start.
				const last = tokens[tokens.length - 1];
				if (last?.kind === "text") {
					last.value += rest[0];
				} else {
					tokens.push({ kind: "text", value: rest[0] as string });
				}
				rest = rest.slice(1);
			}
		}
		return tokens;
	}

	const tokens = $derived(tokenize(text));
</script>

{#each tokens as token, i (i)}
	{#if token.kind === "upgrade"}
		<span class="chip uchip era-{upgradeEra(token.upgrade)}">
			<span class="chip-era">{["", "I", "II", "III"][upgradeEra(token.upgrade)]}</span>{UPGRADE_SPECS[token.upgrade]
				.name}
		</span>
	{:else if token.kind === "resource"}
		<span class="chip rchip res-{token.resource}">
			<ResourceIcon resource={token.resource} size={11} />
			{RESOURCE_LABELS[token.resource]}
		</span>
	{:else if token.kind === "factory"}
		<span class="chip fchip res-{token.resource}" title={token.label}>
			{token.count}
			<span class="fdots">
				{#each Array.from({ length: token.count }) as _, i (i)}
					<span class="fdot"><ResourceIcon resource={token.resource} size={10} /></span>
				{/each}
			</span>
			{RESOURCE_LABELS[token.resource]} factories
		</span>
	{:else}
		{token.value}
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
	.rchip {
		color: var(--res);
		background: color-mix(in srgb, var(--res) 14%, transparent);
	}
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
		width: 14px;
		height: 14px;
		border-radius: 3px;
		background: var(--res);
		color: var(--res-text, #fff);
	}
</style>
