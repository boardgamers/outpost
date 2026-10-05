<script lang="ts">
	let {
		label,
		kind,
		onclick,
		disabled = false,
	}: { label: string; kind: "edit" | "cancel"; onclick: () => void; disabled?: boolean } = $props();
</script>

<button class="choice-button" aria-label={label} title={label} {onclick} {disabled}>
	<svg
		width="20"
		height="20"
		viewBox="0 0 20 20"
		fill="none"
		stroke="currentColor"
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d={kind === "edit" ? "M3 12L13 2L17 6L7 16L2 17Z M11 4L15 8" : "M4 4L16 16 M16 4L4 16"} />
	</svg>
</button>

<style>
	.choice-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		min-height: 44px;
		padding: 6px;
		color: var(--text-mid);
	}
</style>
