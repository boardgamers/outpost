<script lang="ts">
	import type { ViewerStore } from "./store.svelte";

	interface Props {
		store: ViewerStore;
	}

	let { store }: Props = $props();
	const replay = $derived(store.replay);
	const lines = $derived(store.logLines);
	const marks = $derived(lines.map((_, log) => ({ log })).filter((m) => m.log > 0));
</script>

{#if replay.active}
	<div class="replaybar">
		<div class="title">
			<span class="badge">REPLAY</span>
			<span class="pos">entry {replay.current} / {replay.end}</span>
		</div>
		<div class="track">
			<button class="nav" disabled={replay.current <= 1} onclick={() => store.replayToEntry(1)} title="Start">⏮</button>
			<div class="marks">
				{#each marks as mark (mark.log)}
					<button
						class="mark"
						class:done={mark.log < replay.current}
						class:current={mark.log === replay.current - 1}
						title={lines[mark.log]}
						onclick={() => store.replayToEntry(mark.log + 1)}
					></button>
				{/each}
			</div>
			<button
				class="nav"
				disabled={replay.current >= replay.end}
				onclick={() => store.replayToEntry(replay.end)}
				title="Live">⏭</button
			>
		</div>
	</div>
{/if}

<style>
	.replaybar {
		background: linear-gradient(160deg, #1e2430, #161b25);
		border: 1px solid #4f7ba8;
		border-radius: var(--radius);
		padding: 10px 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.title {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.badge {
		background: #4f7ba8;
		color: #fff;
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 1px;
		padding: 2px 7px;
		border-radius: 4px;
	}
	.pos {
		color: var(--text-dim);
		font-size: 12px;
	}
	.track {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.nav {
		padding: 2px 8px;
		font-size: 12px;
	}
	.marks {
		flex: 1;
		display: flex;
		gap: 3px;
		align-items: center;
		overflow-x: auto;
		padding: 4px 0;
	}
	.mark {
		width: 10px;
		height: 10px;
		min-width: 10px;
		border-radius: 50%;
		border: 1px solid #3d5a78;
		background: transparent;
		padding: 0;
	}
	.mark.done {
		background: #4f7ba8;
	}
	.mark.current {
		border-color: var(--gold);
		background: var(--gold);
		box-shadow: 0 0 6px var(--gold-soft);
	}
</style>
