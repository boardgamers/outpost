<script lang="ts">
	import { VICTORY_VP } from "outpost-engine";
	import type { ViewerStore } from "./store.svelte";

	interface Props {
		store: ViewerStore;
	}

	let { store }: Props = $props();
	const state = $derived(store.state);
	const ranks = $derived(store.finalRankings);
	const scores = $derived(store.finalScores);
	const winners = $derived(state?.ended ? ranks.map((r, i) => (r === 1 ? i : -1)).filter((i) => i >= 0) : []);
</script>

{#if state?.ended}
	<div class="banner">
		<h2>Game over</h2>
		<p class="result">
			{#if winners.length > 1}
				Shared victory: {winners.map((i) => state.players[i]!.name).join(" & ")}
			{:else if winners.length === 1}
				{state.players[winners[0]!]!.name} wins
			{/if}
		</p>
		<table>
			<thead>
				<tr><th>#</th><th>Player</th><th>VP</th><th>Factories</th><th>Upgrades</th></tr>
			</thead>
			<tbody>
				{#each state.players.map((p, i) => ({ p, i })).sort((a, b) => ranks[a.i]! - ranks[b.i]!) as row (row.i)}
					<tr class:winner={ranks[row.i] === 1}>
						<td>{ranks[row.i]}</td>
						<td>{row.p.name}</td>
						<td>{scores[row.i]}</td>
						<td>{row.p.factories.length}</td>
						<td>{Object.values(row.p.upgrades).reduce((a, b) => a + b, 0)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="target">Victory target: {VICTORY_VP} VP</p>
	</div>
{/if}

<style>
	.banner {
		background: var(--banner-bg);
		border: 1px solid var(--gold);
		border-radius: var(--radius);
		padding: 16px 20px;
	}
	h2 {
		margin: 0 0 4px;
		color: var(--gold);
		font-size: 20px;
	}
	.result {
		margin: 0 0 12px;
		color: var(--text);
		font-size: 16px;
		font-weight: 600;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		max-width: 460px;
	}
	th,
	td {
		text-align: left;
		padding: 4px 12px 4px 0;
		font-size: 13px;
	}
	th {
		color: var(--text-dim);
		font-weight: 600;
	}
	tr.winner td {
		color: var(--gold);
		font-weight: 700;
	}
	.target {
		margin: 10px 0 0;
		color: var(--text-dim);
		font-size: 12px;
	}
</style>
