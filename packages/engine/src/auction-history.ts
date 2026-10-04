import type { LogEntry } from "./types.js";

export interface SealedAuctionResult {
	winner: number;
	bids: { player: number; amount: number }[];
	paid?: number;
}

export function sealedAuctionHistory(log: LogEntry[]): {
	revealed: Set<number>;
	results: Map<number, SealedAuctionResult>;
} {
	const revealed = new Set<number>();
	const results = new Map<number, SealedAuctionResult>();
	let pending = new Map<number, number>();
	let bids = new Map<number, number>();
	let awaitingPayment: SealedAuctionResult | undefined;
	for (const [index, entry] of log.entries()) {
		if (entry.type !== "move") {
			continue;
		}
		if (entry.move.action === "auction") {
			awaitingPayment = undefined;
			pending = new Map();
			bids = new Map([[entry.player, entry.move.bid]]);
		} else if (entry.move.action === "bid") {
			bids.set(entry.player, entry.move.amount);
		} else if (entry.move.action === "bidPass") {
			bids.set(entry.player, 0);
		} else if (entry.move.action === "pay") {
			if (awaitingPayment?.winner === entry.player && entry.info?.paid !== undefined) {
				awaitingPayment.paid = entry.info.paid;
			}
			awaitingPayment = undefined;
			continue;
		} else {
			continue;
		}
		pending.set(entry.player, index);
		for (const seat of entry.info?.autoPassed ?? []) {
			bids.set(seat, 0);
		}
		if (entry.info?.winningBid !== undefined) {
			for (const bidIndex of pending.values()) {
				revealed.add(bidIndex);
			}
			const winner = entry.info.winner ?? entry.player;
			awaitingPayment = {
				winner,
				bids: [...bids]
					.filter(([, amount]) => amount >= 0)
					.map(([player, amount]) => ({ player, amount }))
					.sort(
						(a, b) =>
							b.amount - a.amount || Number(b.player === winner) - Number(a.player === winner) || a.player - b.player
					),
			};
			results.set(index, awaitingPayment);
			pending = new Map();
			bids.clear();
		}
	}
	return { revealed, results };
}
