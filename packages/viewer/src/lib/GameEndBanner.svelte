<script lang="ts">
	import { VICTORY_VP } from "outpost-engine";
	import { playerColor, type ViewerStore } from "./store.svelte";

	interface Props {
		store: ViewerStore;
	}

	let { store }: Props = $props();
	const state = $derived(store.state);
	const ranks = $derived(store.finalRankings);
	const scores = $derived(store.finalScores);
	const winners = $derived(state?.ended ? ranks.map((r, i) => (r === 1 ? i : -1)).filter((i) => i >= 0) : []);
	const maxScore = $derived(Math.max(1, ...scores));
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
				<tr><th>#</th><th>Player</th><th>VP</th><th></th><th>Factories</th><th>Upgrades</th></tr>
			</thead>
			<tbody>
				{#each state.players.map((p, i) => ({ p, i })).sort((a, b) => ranks[a.i]! - ranks[b.i]!) as row (row.i)}
					<tr class:winner={ranks[row.i] === 1}>
						<td class="rank">
							{#if ranks[row.i] === 1}
								<svg class="medal" viewBox="0 0 24 24" width="16" height="16" aria-label="winner">
									<circle cx="12" cy="13" r="6" />
									<path d="M12 10.2l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z" class="star" />
									<path d="M8.5 7.5 6 2h4l2 4 2-4h4l-2.5 5.5" class="ribbon" />
								</svg>
							{:else}
								{ranks[row.i]}
							{/if}
						</td>
						<td>
							<span class="dot" style="background: {playerColor(row.i)}"></span>
							{row.p.name}
						</td>
						<td class="score">{scores[row.i]}</td>
						<td class="barcell">
							<span class="bar">
								<span
									class="fill"
									style="width: {Math.round(((scores[row.i] ?? 0) / maxScore) * 100)}%; background: {playerColor(
										row.i
									)}"
								></span>
							</span>
						</td>
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
		max-width: 560px;
	}
	th,
	td {
		text-align: left;
		padding: 5px 12px 5px 0;
		font-size: 13px;
		vertical-align: middle;
	}
	th {
		color: var(--text-dim);
		font-weight: 600;
	}
	tr.winner td {
		color: var(--gold);
		font-weight: 700;
	}
	.rank {
		width: 24px;
	}
	.medal {
		fill: var(--gold);
		display: block;
	}
	.medal .star {
		fill: var(--bg-elevated);
	}
	.medal .ribbon {
		fill: none;
		stroke: var(--gold);
		stroke-width: 1.6;
		stroke-linejoin: round;
	}
	.dot {
		display: inline-block;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		margin-right: 6px;
		vertical-align: middle;
	}
	.score {
		font-weight: 800;
	}
	.barcell {
		width: 40%;
		padding-right: 18px;
	}
	.bar {
		display: block;
		height: 8px;
		border-radius: 4px;
		background: color-mix(in srgb, var(--text) 12%, transparent);
		overflow: hidden;
	}
	.bar .fill {
		display: block;
		height: 100%;
		border-radius: 4px;
		transition: width 0.4s ease;
	}
	.target {
		margin: 10px 0 0;
		color: var(--text-dim);
		font-size: 12px;
	}
</style>
