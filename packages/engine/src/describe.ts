import { FACTORIES, KICKER_SPECS, UPGRADE_SPECS } from "./data.js";
import type { GameState, LogEntry, MoveInfo } from "./types.js";

/** Display name of the card a move concerns (colony upgrade or Kicker card). */
function cardName(info: MoveInfo | undefined, fallback: string): string {
	if (info?.kicker) {
		return KICKER_SPECS[info.kicker].name;
	}
	if (info?.upgrade) {
		return UPGRADE_SPECS[info.upgrade].name;
	}
	return fallback;
}

function playerName(state: GameState, seat: number): string {
	return state.players[seat]?.name ?? `Player ${seat + 1}`;
}

export function describeLogEntry(state: GameState, entry: LogEntry): string {
	switch (entry.type) {
		case "init":
			return `Game started with ${entry.players} players`;
		case "round": {
			const market = entry.market.map((u) => UPGRADE_SPECS[u].name).join(", ") || "empty";
			return `Round ${entry.round}: colony ship arrives: ${market}`;
		}
		case "end": {
			const scores = entry.scores.map((vp, seat) => `${playerName(state, seat)} ${vp} VP`).join(", ");
			return `Game over: ${scores}`;
		}
		case "move": {
			const name = playerName(state, entry.player);
			const move = entry.move;
			const info = entry.info;
			switch (move.action) {
				case "mega": {
					const count = info?.mega ?? 0;
					return count > 0
						? `${name} takes ${count} mega production card${count === 1 ? "" : "s"}`
						: `${name} takes their production as single cards`;
				}
				case "discard":
					return `${name} discards ${info?.discarded ?? move.cards.length} card(s)`;
				case "auction":
					// fastBid: the opening bid is the auctioneer's sealed bid, masked to
					// -1 for the other players — show no amount when it is hidden.
					return move.bid < 0
						? `${name} puts ${cardName(info, "an upgrade")} up for auction (sealed bid)`
						: `${name} puts ${cardName(info, "an upgrade")} up for auction at ${move.bid}`;
				case "bid": {
					// fastBid: the resolving move carries the outcome in its info.
					if (info?.winningBid !== undefined) {
						const won = playerName(state, info.winner ?? entry.player);
						return `${name} bids (sealed) — ${won} wins at ${info.winningBid === info.secondBid ? info.winningBid : Math.min((info.secondBid ?? 0) + 1, info.winningBid)}`;
					}
					if (move.amount < 0) {
						return `${name} bids (sealed)`;
					}
					return `${name} bids ${move.amount}`;
				}
				case "bidPass":
					return `${name} passes on the auction`;
				case "pay":
					return `${name} buys ${cardName(info, "the upgrade")} (paid ${info?.paid ?? 0})`;
				case "exchange": {
					const target = playerName(state, move.target);
					return info?.exchangeTake === -1
						? `${name} offers a card to ${target}, who has nothing higher to trade back`
						: `${name} trades a card with ${target} for a higher one`;
				}
				case "exchangePass":
					return `${name} passes on the exchange`;
				case "endTurn": {
					const buys = (move.buys ?? []).map((buy) => {
						switch (buy.buy) {
							case "factory":
								return `builds a ${FACTORIES[buy.factory] ? buy.factory : "?"} factory`;
							case "population":
								return `recruits ${buy.count} colonist(s)`;
							case "robots":
								return `buys ${buy.count} robot(s)`;
						}
					});
					const mans = `mans ${move.manned.length} factor${move.manned.length === 1 ? "y" : "ies"}`;
					return buys.length > 0
						? `${name} ${buys.join(", ")} (paid ${info?.paid ?? 0}) and ${mans}`
						: `${name} ${mans}`;
				}
				default:
					return `${name} moves`;
			}
		}
		default:
			return "";
	}
}

export function describeLog(state: GameState): string[] {
	return state.log.map((entry) => describeLogEntry(state, entry));
}
