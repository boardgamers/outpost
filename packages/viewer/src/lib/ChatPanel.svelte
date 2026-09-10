<script lang="ts">
	import type { ViewerChatMessage } from "./bgs.svelte";
	import type { ViewerStore } from "./store.svelte";

	interface Props {
		store: ViewerStore;
	}

	let { store }: Props = $props();
	const messages = $derived(store.chatMessages);
	const writable = $derived(store.chatWritable);
	const retryDraft = $derived(store.chatRetryDraft);
	const sendError = $derived(store.chatSendError);

	let draft = $state("");
	let feed = $state<HTMLDivElement | undefined>(undefined);
	// Whether the feed has been scrolled into place once (initial load lands on
	// the newest message regardless of where the scroll happens to start).
	let scrolledOnce = false;

	// Chat reads bottom-up (chronological, newest last). Auto-scroll to the
	// newest message on load and whenever a new one arrives while the user is
	// already near the bottom — but never yank the view down when they've
	// scrolled up to read history.
	$effect(() => {
		const el = feed;
		if (!el) {
			return;
		}
		// Depend on the message list so this re-runs on any append/update.
		void messages.length;
		const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
		const fitsWithoutScroll = el.scrollHeight <= el.clientHeight;
		if (!scrolledOnce || nearBottom || fitsWithoutScroll) {
			scrolledOnce = true;
			// Wait a tick for the new message to render before measuring height.
			requestAnimationFrame(() => {
				el.scrollTop = el.scrollHeight;
			});
		}
	});

	// A refused send hands its text back so the user can retry without retyping.
	$effect(() => {
		const text = retryDraft;
		if (text !== undefined) {
			draft = text;
			store.takeChatRetryDraft();
		}
	});

	function send(): void {
		const text = draft.trim();
		if (!text || !writable) {
			return;
		}
		store.sendChat(text);
		draft = "";
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			send();
		}
	}

	function timeOf(message: ViewerChatMessage): string | undefined {
		if (!message.createdAt) {
			return undefined;
		}
		const d = new Date(message.createdAt);
		return Number.isNaN(d.getTime()) ? undefined : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	}
</script>

<div class="chat">
	<div class="caption">Chat</div>
	<div class="feed" bind:this={feed}>
		{#each messages as message, index (message._id ?? index)}
			{#if message.type === "system"}
				<div class="entry system">{message.text}</div>
			{:else}
				{@const color = store.chatAuthorColor(message)}
				{@const time = timeOf(message)}
				<div class="entry">
					{#if time}
						<span class="time">{time}</span>
					{/if}
					<span class="author" style:color>{message.author ?? "Unknown"}</span>
					<span class="text">{message.text}</span>
					{#if message.editedAt}
						<span class="edited" title="Edited {message.editedAt}">(edited)</span>
					{/if}
				</div>
			{/if}
		{/each}
		{#if messages.length === 0}
			<div class="entry dim">No messages yet</div>
		{/if}
	</div>
	{#if store.chatDisabled}
		<div class="disabled-note">Chat has been disabled by the room moderators.</div>
	{:else if store.chatCanSend?.canSend === false}
		<div class="disabled-note">Chat is read-only here ({store.chatCanSend.reason ?? "not-a-player"}).</div>
	{:else}
		{#if sendError}
			<div class="send-error">Message not sent: {sendError}</div>
		{/if}
		<div class="composer">
			<input
				type="text"
				bind:value={draft}
				onkeydown={onKeydown}
				placeholder="Message…"
				maxlength="500"
				aria-label="Chat message"
			/>
			<button onclick={send} disabled={!draft.trim()}>Send</button>
		</div>
	{/if}
</div>

<style>
	.chat {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.caption {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dim);
		padding: 0 4px;
	}
	.feed {
		background: var(--bg-panel);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 8px 12px;
		max-height: 220px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.entry {
		font-size: 12px;
		color: var(--text);
		overflow-wrap: anywhere;
	}
	.entry.system {
		text-align: center;
		font-style: italic;
		color: var(--text-dim);
	}
	.entry.dim {
		color: var(--text-dim);
	}
	.time {
		color: var(--text-dim);
		font-size: 10px;
		margin-right: 6px;
	}
	.author {
		font-weight: 700;
		color: var(--gold);
		margin-right: 6px;
	}
	.text {
		white-space: pre-wrap;
	}
	.edited {
		color: var(--text-dim);
		font-size: 10px;
		margin-left: 4px;
	}
	.composer {
		display: flex;
		gap: 6px;
	}
	.composer input {
		flex: 1;
		min-width: 0;
		font: inherit;
		font-size: 12px;
		color: var(--text);
		background: var(--bg-elevated);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 6px 10px;
	}
	.composer input:focus {
		outline: none;
		border-color: var(--gold);
	}
	.composer button {
		font-size: 12px;
		padding: 6px 10px;
	}
	.disabled-note {
		background: var(--bg-panel);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 8px 12px;
		font-size: 12px;
		font-style: italic;
		color: var(--text-dim);
		text-align: center;
	}
	.send-error {
		font-size: 11px;
		color: var(--danger);
		padding: 0 4px;
	}
</style>
