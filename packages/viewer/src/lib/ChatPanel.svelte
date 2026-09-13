<script lang="ts">
	import type { ViewerStore } from "./store.svelte";
	import type { ChatMessage } from "@boardgamers/protocol/chat";
	import { bindChatComposer, bindChatViewport, type ChatSuggestions } from "@boardgamers/protocol/chat/dom";
	let { store }: { store: ViewerStore } = $props();
	const chat = $derived(store.chatState);
	const messages = $derived(chat.messages);
	let composer: HTMLInputElement | undefined = $state();
	let feed: HTMLDivElement | undefined = $state();
	let contents: HTMLDivElement | undefined = $state();
	let inputBinding: ReturnType<typeof bindChatComposer> | undefined;
	let suggestions: ChatSuggestions = $state.raw({ candidates: [], selected: 0 });
	const candidates = $derived(suggestions.candidates);
	const choice = $derived(suggestions.selected);
	function timeOf(message: ChatMessage): string | undefined {
		if (!message.createdAt) {
			return undefined;
		}
		const date = new Date(message.createdAt);
		return Number.isNaN(date.getTime())
			? undefined
			: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	}
	$effect(() => {
		if (!composer) {
			return;
		}
		const binding = bindChatComposer(composer, {
			chat: store.chat,
			onSuggestions: (next) => {
				suggestions = next;
			},
		});
		inputBinding = binding;
		return () => {
			binding.destroy();
			inputBinding = undefined;
		};
	});
	$effect(() => {
		if (!feed || !contents) {
			return;
		}
		const binding = bindChatViewport(feed, { chat: store.chat, contents });
		return () => binding.destroy();
	});
</script>

{#if chat.enabled}
	<div class="chat">
		<div class="caption">Chat{chat.unreadIds.length ? ` · ${chat.unreadIds.length}` : ""}</div>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users must be able to scroll chat.) -->
		<div class="feed" bind:this={feed} role="region" aria-label="Chat messages" tabindex="0">
			<div bind:this={contents}>
				{#each messages as message, index (message._id ?? index)}
					{@const color = store.chatAuthorColor(message)}
					{@const time = timeOf(message)}
					<div class="entry" class:system={message.type === "system"} data-message-id={message._id}>
						{#if time}<span class="time">{time}</span>{/if}
						{#if message.author}
							{#if message.playerIndex !== undefined}<button
									class="author"
									style:color
									onclick={() => store.openPlayer(message.playerIndex!)}>{message.author}</button
								>
							{:else}<span class="author" style:color>{message.author}</span>{/if}
						{/if}
						<span class="text">
							{#each message.segments ?? [{ kind: "text" as const, text: message.text }] as segment}
								{#if segment.kind === "link"}<a href={segment.url} target="_blank" rel="noopener noreferrer"
										>{segment.text}</a
									>
								{:else if segment.kind === "mention"}
									{@const player = chat.mentions.find((p) => p.id === segment.id)}
									{#if player?.playerIndex !== undefined}<button
											class="mention"
											onclick={() => store.openPlayer(player.playerIndex!)}>@{segment.name}</button
										>
									{:else}<a
											class="mention"
											href={`https://boardgamers.space/user/${encodeURIComponent(segment.name)}`}
											target="_blank"
											rel="noopener noreferrer">@{segment.name}</a
										>{/if}
								{:else}{segment.text}{/if}
							{/each}
						</span>
						{#if message.editedAt}<span class="edited" title="Edited {message.editedAt}">(edited)</span>{/if}
					</div>
				{/each}
				{#if !messages.length}<div class="entry dim">No messages yet</div>{/if}
			</div>
		</div>
		{#if chat.disabled}
			<div class="disabled-note">Chat has been disabled by the room moderators.</div>
		{:else if !chat.canSend}
			<div class="disabled-note">Chat is read-only here ({chat.reason || "not-a-player"}).</div>
		{:else}
			{#if candidates.length}<div class="mention-choices" aria-label="Mention a player">
					{#each candidates as candidate, i}<button
							type="button"
							class:selected={i === choice}
							onmousedown={(event) => event.preventDefault()}
							onclick={() => inputBinding?.choose(i)}>@{candidate.name}</button
						>{/each}
				</div>{/if}
			<div class="composer">
				<input type="text" bind:this={composer} placeholder="Message…" maxlength="500" aria-label="Chat message" />
				<button type="button" onclick={() => store.chat.submit()} disabled={!chat.draft.trim() || !!chat.pending}
					>{chat.pending ? "Sending…" : "Send"}</button
				>
			</div>
		{/if}
		{#if chat.error}<div class="send-error" role="alert">{chat.error}</div>{/if}
	</div>
{/if}

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
		margin-bottom: 4px;
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
	button.author,
	.mention {
		font: inherit;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}
	button.author {
		font-weight: 700;
	}
	button.author:hover {
		text-decoration: underline;
	}
	.text a {
		color: var(--gold);
		text-decoration: underline;
	}
	.text .mention {
		color: var(--gold);
		font-weight: 700;
	}
	.mention-choices {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.mention-choices button {
		font-size: 12px;
		padding: 4px 6px;
	}
	.mention-choices .selected {
		border-color: var(--gold);
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
