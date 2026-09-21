<script lang="ts">
	import {
		chatDateSeparators,
		chatTranslationTitle,
		chatTranslationLabel,
		chatTranslationIconPath,
		chatEditIconPath,
		defaultChatEditLabels,
	} from "@boardgamers/protocol/chat";
	import type { ViewerStore } from "./store.svelte";
	import type { ChatMessage } from "@boardgamers/protocol/chat";
	import { bindChatComposer, bindChatViewport, type ChatSuggestions } from "@boardgamers/protocol/chat/dom";
	let { store }: { store: ViewerStore } = $props();
	const chat = $derived(store.chatState);
	const editLabels = $derived(chat.editLabels ?? defaultChatEditLabels);
	const dates = $derived(chatDateSeparators(chat.messages));
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

{#if chat.enabled && !store.preferences.analysis}
	<div class="chat">
		<div class="caption">Chat{chat.unreadIds.length ? ` · ${chat.unreadIds.length}` : ""}</div>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users must be able to scroll chat.) -->
		<div class="feed" bind:this={feed} role="region" aria-label="Chat messages" tabindex="0">
			<div bind:this={contents}>
				{#each messages as message, index (message._id ?? index)}
					{@const translation = message._id ? chat.translations[message._id] : undefined}
					{@const displayed = translation?.shown
						? { text: translation.text ?? message.text, segments: translation.segments }
						: message}
					{@const color = store.chatAuthorColor(message)}
					{@const time = timeOf(message)}
					{@const day = dates[index]}
					{#if day}<div class="chat-day"><time datetime={day.dateTime}>{day.label}</time></div>{/if}
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
							{#each displayed.segments ?? [{ kind: "text" as const, text: displayed.text }] as segment}
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

						{#if message._id && chat.canEdit && store.chat.canEdit(message)}
							<button
								type="button"
								class="chat-edit"
								title={editLabels.edit}
								aria-label={editLabels.edit}
								aria-pressed={chat.editingId === message._id}
								disabled={!!chat.pending}
								onclick={() => inputBinding?.edit(message._id!)}
							>
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.7"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"><path d={chatEditIconPath} /></svg
								>
							</button>
						{/if}
						{#if message._id && message.type === "text" && chat.translationTarget}
							{@const label = chatTranslationLabel(translation, chat.translationLabels)}
							<button
								type="button"
								class="chat-translate"
								disabled={!!translation?.pending}
								aria-label={label}
								aria-pressed={!!translation?.shown}
								aria-busy={!!translation?.pending}
								title={`${label} (${chatTranslationTitle(translation?.language ?? message.language, chat.translationTarget)})`}
								onclick={() => store.chat.toggleTranslation(message._id!)}
							>
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.7"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"><path d={chatTranslationIconPath} /></svg
								>
							</button>
						{/if}
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
			{#if chat.editingId}
				<div class="chat-editing">
					<span role="status">{editLabels.edit}</span><button
						class="chat-edit-cancel"
						type="button"
						title={editLabels.cancel}
						aria-label={editLabels.cancel}
						disabled={!!chat.pending}
						onclick={() => {
							store.chat.cancelEditing();
							composer?.focus();
						}}>×</button
					>
				</div>
			{/if}
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
					>{chat.editingId
						? `${editLabels.save}${chat.pending ? "…" : ""}`
						: chat.pending
							? "Sending…"
							: "Send"}</button
				>
			</div>
		{/if}
		{#if chat.error}<div class="send-error" role="alert">{chat.error}</div>{/if}
	</div>
{/if}

<style>
	.chat-editing {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		font-size: 12px;
		opacity: 0.85;
		padding: 3px 0;
		flex-shrink: 0;
	}
	.chat-edit-cancel {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		min-height: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}

	.chat-translate {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		vertical-align: middle;
		width: 24px;
		height: 24px;
		min-height: 0;
		padding: 4px;
		margin-left: 3px;
		border: 0;
		border-radius: 3px;
		background: transparent;
		color: inherit;
		opacity: 0.55;
		cursor: pointer;
	}
	.chat-edit {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		vertical-align: middle;
		width: 24px;
		height: 24px;
		min-height: 0;
		padding: 4px;
		margin-left: 3px;
		border: 0;
		border-radius: 3px;
		background: transparent;
		color: inherit;
		opacity: 0.55;
		cursor: pointer;
	}
	.chat-translate:hover,
	.chat-translate:focus-visible {
		opacity: 1;
	}
	.chat-edit:hover,
	.chat-edit:focus-visible {
		opacity: 1;
	}
	.chat-translate[aria-pressed="true"] {
		opacity: 1;
		background: var(--line);
	}
	.chat-edit[aria-pressed="true"] {
		opacity: 1;
		background: var(--line);
	}
	.chat-translate:disabled {
		cursor: wait;
	}
	.chat-edit:disabled {
		cursor: wait;
	}
	.chat-day {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 12px 0 8px;
		font-size: 11px;
		color: var(--text-dim);
	}
	.chat-day::before,
	.chat-day::after {
		content: "";
		flex: 1;
		border-top: 1px solid var(--line);
	}
	.chat-day time {
		color: inherit;
		font-size: inherit;
	}
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
