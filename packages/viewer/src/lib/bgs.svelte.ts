import type { GameState, Move } from "outpost-engine";
import { Emitter } from "./emitter";

// Uplink payloads can be Svelte $state proxies (e.g. the logLines array). The
// BGS shim re-posts whatever we emit straight to the parent via postMessage,
// whose structured clone throws "Proxy object could not be cloned" on proxies.
// Deep-unwrap at the emit boundary so nothing downstream ever sees a proxy.
function declone<T>(value: T): T {
	try {
		return $state.snapshot(value) as T;
	} catch {
		try {
			return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
		} catch {
			return value;
		}
	}
}

export interface ViewerChatMessage {
	_id?: string;
	author?: string;
	/** Author's stable user id — match identity on THIS, never on the name. */
	authorId?: string;
	/** Author's seat index in this game, when the author is one of its players. */
	playerIndex?: number;
	/** When the message was posted (ISO). */
	createdAt?: string;
	text: string;
	type: "text" | "system";
	editedAt?: string;
}

/** Write-permission state (the `chat:state` downlink); the api stays the authority on writes. */
export interface ViewerChatCanSend {
	canSend: boolean;
	reason?: string;
}

/** Send-ack downlink, one per `chat:send` that carried a requestId. */
export interface ViewerChatResult {
	requestId: string;
	ok: boolean;
	error?: string;
}

export interface ViewerEvents {
	state: GameState;
	"state:updated": void;
	gamelog: { start: number; end?: number; data: unknown };
	player: { index?: number };
	avatars: string[];
	preferences: Record<string, unknown>;
	theme: { dark: boolean };
	"replay:start": void;
	"replay:to": number;
	"replay:end": void;
	"chat:messages": ViewerChatMessage[];
	"chat:appended": ViewerChatMessage[];
	"chat:updated": ViewerChatMessage[];
	"chat:deleted": string[];
	"chat:disabled": boolean;
	"chat:state": ViewerChatCanSend;
	"chat:result": ViewerChatResult;
}

export interface UplinkEvents {
	ready: void;
	// The shim relays the emitted payload verbatim as the gameMove's `move` field,
	// so it must be the move object itself — not wrapped in { move } (that would
	// double-wrap it and the engine would read move.action === undefined).
	move: Move;
	// No optimistic echo: accepted posts are rebroadcast via chat:appended.
	"chat:send": { text: string; requestId?: string };
	// Read receipt: watermark the latest shown message so the platform clears its unread badge.
	"chat:read": { messageId: string };
	fetchState: void;
	fetchLog: { start: number; end?: number };
	addLog: string[];
	replaceLog: string[];
	"player:clicked": { index: number };
	"update:preference": { name: string; value: string | boolean | null };
	"replay:info": { start: number; current: number; end: number };
}

// The BGS iframe shim (resources/game/<game>/<v>/iframe) owns the postMessage
// protocol: it re-emits controller messages on the emitter returned by launch()
// (downlink) and re-posts our emitted uplink events to the parent. The dev
// harness drives the same emitter directly. So this bridge is just the typed
// emitter surface — no window/postMessage code of our own.
export class ViewerBridge {
	readonly events = new Emitter();

	on<K extends keyof ViewerEvents>(event: K, listener: (payload: ViewerEvents[K]) => void): () => void {
		return this.events.on(event, listener);
	}

	private emitUplink<K extends keyof UplinkEvents>(event: K, payload?: UplinkEvents[K]): void {
		this.events.emit(event, declone(payload));
	}

	sendMove(move: Move): void {
		this.emitUplink("move", move);
	}

	ready(): void {
		this.emitUplink("ready");
	}

	replaceLog(lines: string[]): void {
		this.emitUplink("replaceLog", lines);
	}

	fetchState(): void {
		this.emitUplink("fetchState");
	}

	replayInfo(info: { start: number; current: number; end: number }): void {
		this.emitUplink("replay:info", info);
	}

	playerClicked(index: number): void {
		this.emitUplink("player:clicked", { index });
	}

	updatePreference(name: string, value: string | boolean | null): void {
		this.emitUplink("update:preference", { name, value });
	}

	fetchLog(start: number, end?: number): void {
		this.emitUplink("fetchLog", { start, end });
	}

	sendChat(text: string, requestId?: string): void {
		this.emitUplink("chat:send", requestId ? { text, requestId } : { text });
	}

	readChat(messageId: string): void {
		this.emitUplink("chat:read", { messageId });
	}
}

export function launchBridge(): ViewerBridge {
	return new ViewerBridge();
}
