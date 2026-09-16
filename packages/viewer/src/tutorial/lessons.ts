import type { TutorialOptions, TutorialStep } from "@boardgamers/protocol/tutorial";
import {
	applyMove,
	beginRound,
	countingHandSize,
	enterDiscardPhase,
	handValue,
	setup,
	victoryPoints,
	type GameState,
	type Move,
	type ProductionCard,
	type Resource,
	type Upgrade,
} from "outpost-engine";

export type LessonAction = { kind: "move"; move: Move } | { kind: "watch" } | { kind: "answer"; answer: string };
export interface LessonState {
	game: GameState;
	answer?: string;
}
export interface Lesson extends Omit<TutorialOptions<LessonState, LessonAction>, "move"> {
	title: string;
	description: string;
	move(state: LessonState, action: LessonAction, frame?: (game: GameState) => void): LessonState;
	choices?: Record<string, { label: string; answer: string }[]>;
	watch?: Record<string, string>;
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function take(game: GameState, resource: Resource, value: number): ProductionCard {
	const index = game.decks[resource].indexOf(value);
	if (index < 0) {
		throw Error(`No ${resource} ${value} available in this lesson.`);
	}
	game.decks[resource].splice(index, 1);
	return { t: resource, v: value };
}
function hand(game: GameState, seat: number, cards: [Resource, number][]) {
	const player = game.players[seat]!;
	for (const card of player.hand) {
		game.decks[card.t].push(card.v);
	}
	player.hand = cards.map(([resource, value]) => take(game, resource, value));
}
function giveUpgrade(game: GameState, seat: number, upgrade: Upgrade, count = 1) {
	game.players[seat]!.upgrades[upgrade] += count;
	game.supply[upgrade] -= count;
}
function market(game: GameState, cards: Upgrade[]) {
	for (const upgrade of game.market) {
		game.supply[upgrade]++;
	}
	game.market = cards;
	for (const upgrade of cards) {
		game.supply[upgrade]--;
	}
}
function base(fastBid = false): GameState {
	const game = setup(3, { fastBid }, "outpost-lessons-1");
	game.players.forEach((player, seat) => {
		player.name = ["You", "Ada", "Leo"][seat]!;
	});
	game.round = 3;
	game.era = 1;
	game.purchaseOrder = [0, 1, 2];
	game.activeSeat = 0;
	game.log = [];
	market(game, ["heavyEquipment", "warehouse", "nodule"]);
	return game;
}
function growthState(): LessonState {
	const game = base();
	hand(game, 0, [
		["water", 10],
		["ore", 5],
		["ore", 4],
		["ore", 2],
	]);
	hand(game, 1, [
		["water", 10],
		["water", 10],
	]);
	hand(game, 2, [
		["water", 8],
		["ore", 2],
		["ore", 5],
	]);
	return { game };
}
function auctionState(): LessonState {
	const game = base();
	hand(game, 0, [
		["water", 10],
		["water", 10],
		["water", 7],
		["ore", 5],
	]);
	hand(game, 1, [
		["water", 9],
		["water", 9],
		["water", 8],
		["water", 8],
	]);
	hand(game, 2, [
		["water", 9],
		["water", 8],
		["water", 7],
		["water", 7],
	]);
	return { game };
}
function sealedState(): LessonState {
	const game = base(true);
	game.round = 8;
	game.era = 2;
	giveUpgrade(game, 0, "dataLibrary", 2);
	giveUpgrade(game, 1, "scientists");
	giveUpgrade(game, 2, "orbitalLab");
	market(game, ["scientists", "orbitalLab", "ecoplants"]);
	hand(game, 0, [
		["water", 10],
		["water", 10],
		["water", 7],
		["ore", 5],
		["ore", 4],
		["ore", 4],
	]);
	hand(game, 1, [
		["research", 17],
		["research", 16],
		["research", 15],
	]);
	hand(game, 2, [
		["microbiotics", 20],
		["microbiotics", 19],
		["microbiotics", 18],
	]);
	game.purchaseOrder = [1, 2, 0];
	game.activeSeat = 1;
	applyMove(game, { action: "auction", marketIndex: 0, bid: 40 }, 1);
	return { game };
}
function staffingState(): LessonState {
	const game = base();
	game.round = 8;
	game.era = 2;
	giveUpgrade(game, 0, "robots");
	giveUpgrade(game, 0, "heavyEquipment");
	game.players[0]!.factories.push(...Array.from({ length: 3 }, () => ({ type: "titanium" as const, manned: false })));
	hand(game, 0, [["water", 10]]);
	return { game };
}
function storageState(): LessonState {
	const game = base();
	game.round = 8;
	game.era = 2;
	giveUpgrade(game, 0, "scientists");
	hand(game, 0, [
		...[1, 2, 3, 3, 4, 4, 4, 5, 5, 5].map((value): [Resource, number] => ["ore", value]),
		["water", 8],
		["water", 10],
		["research", 12],
		["research", 13],
	]);
	enterDiscardPhase(game);
	return { game };
}
function megaState(): LessonState {
	const game = base();
	game.players[0]!.population = 4;
	game.players[0]!.factories = Array.from({ length: 4 }, () => ({ type: "water", manned: true }));
	beginRound(game);
	return { game };
}
function chemicalsState(): LessonState {
	const game = base();
	game.round = 10;
	game.era = 2;
	giveUpgrade(game, 0, "laboratory");
	game.players[0]!.population = 4;
	game.players[0]!.factories.push({ type: "research", manned: true });
	hand(game, 0, [
		["research", 12],
		["water", 10],
		["water", 10],
		["water", 10],
		["water", 9],
		["water", 9],
	]);
	return { game };
}
function victoryState(): LessonState {
	const game = base();
	game.round = 18;
	game.era = 3;
	for (const [seat, upgrades] of [
		[0, ["moonBase", "moonBase", "planetaryCruiser", "spaceStation"]],
		[1, ["planetaryCruiser", "spaceStation", "ecoplants"]],
		[2, ["outpost", "laboratory", "orbitalLab"]],
	] as [number, Upgrade[]][]) {
		for (const upgrade of upgrades) {
			giveUpgrade(game, seat, upgrade);
		}
	}
	game.players[0]!.population = 5;
	game.players[0]!.factories = Array.from({ length: 5 }, () => ({ type: "water", manned: true }));
	game.players[2]!.factories.push({ type: "titanium", manned: false }, { type: "research", manned: false });
	game.players[2]!.factories.forEach((factory, index) => {
		factory.manned = index >= 2;
	});
	hand(game, 0, [
		["orbitalMedicine", 30],
		["moonOre", 60],
	]);
	hand(game, 1, [["ore", 5]]);
	hand(game, 2, [["ore", 4]]);
	market(game, ["ecoplants"]);
	return { game };
}
function finish(game: GameState, seat: number, grow = false): Move {
	const player = game.players[seat]!;
	if (grow && handValue(player) >= 20) {
		return {
			action: "endTurn",
			buys: [{ buy: "factory", factory: "water", cards: [0, 1] }],
			manned: [1, 2, 3],
		};
	}
	return { action: "endTurn", buys: [], manned: player.factories.flatMap((factory, i) => (factory.manned ? [i] : [])) };
}
function run(id: string): Lesson["move"] {
	return (state, action, frame) => {
		const next = clone(state);
		const game = next.game;
		const apply = (move: Move, seat: number) => {
			applyMove(game, move, seat);
			frame?.(clone(game));
		};
		if (action.kind === "answer") {
			next.answer = action.answer;
		} else if (action.kind === "watch") {
			apply(finish(game, 1, id === "colony"), 1);
			apply(finish(game, 2), 2);
		} else {
			apply(action.move, 0);
			if (id === "auctions" && action.move.action === "auction") {
				apply({ action: "bid", amount: 30 }, 1);
				apply({ action: "bidPass" }, 2);
			} else if (id === "auctions" && action.move.action === "bid") {
				apply({ action: "bidPass" }, 1);
			} else if (id === "sealed-bids" && action.move.action === "bid") {
				apply({ action: "bid", amount: 50 }, 2);
			} else if (id === "victory" && action.move.action === "endTurn") {
				apply(finish(game, 1), 1);
				apply(finish(game, 2), 2);
			}
		}
		return next;
	};
}
function actionStep(
	id: string,
	title: string,
	text: string,
	allowed: (action: LessonAction, state: LessonState) => boolean,
	complete: (state: LessonState) => boolean,
	target = "actions"
): TutorialStep<LessonState, LessonAction> {
	return {
		id,
		title,
		text,
		target,
		complete,
		validateMove: (state, action) =>
			allowed(action, state) ? undefined : "Follow this step’s instructions. Use Replay step to start it again.",
	};
}
function question(
	id: string,
	title: string,
	text: string,
	answer: string,
	explanation: string
): TutorialStep<LessonState, LessonAction> {
	return {
		id,
		title,
		text,
		success: `Correct! ${explanation}`,
		complete: (state) => state.answer === answer,
		validateMove: (_state, action) =>
			action.kind !== "answer"
				? "Choose one of the answers below."
				: action.answer === answer
					? undefined
					: `Not quite. ${explanation}`,
	};
}
const isMove = (action: Move["action"]) => (value: LessonAction) =>
	value.kind === "move" && value.move.action === action;
const isWatch = (value: LessonAction) => value.kind === "watch";
const shell = (id: string) => ({ game: "outpost", id, version: 1, move: run(id) });
const answers = (...values: string[]) => values.map((value) => ({ label: value, answer: value }));

export const lessons: Lesson[] = [
	{
		...shell("colony"),
		version: 2,
		title: "Grow your colony",
		description: "Buy a Water factory and move an Ore operator to it for stronger income.",
		initialState: growthState,
		steps: [
			{
				id: "intro",
				title: "Factories earn your income",
				text: "Your colony starts with two Ore factories, one Water factory and three colonists. Each staffed factory produces one card per round and earns VP. Expand your colony to reach 75 VP.",
				target: "colony",
			},
			question(
				"credits",
				"Cards are your money",
				"You have 21 credits in four cards. Purchases consume whole cards and give no change. If you spend all 21 on a Water factory costing 20, how many credits come back?",
				"0",
				"You receive no change. All 21 credits are spent, even though the factory costs 20."
			),
			actionStep(
				"build",
				"Move an operator to Water",
				"Buy one Water factory for 20 and confirm the payment. Choose Assign operators…. Click either Ore factory to free its operator, then click the new Water factory to staff it. Keep the other Water factory working and End turn. Water averages 7 credits per card; Ore averages 3.",
				(action) =>
					action.kind === "move" &&
					action.move.action === "endTurn" &&
					action.move.buys.length === 1 &&
					action.move.buys[0]?.buy === "factory" &&
					action.move.buys[0].factory === "water" &&
					(action.move.buys[0].count ?? 1) === 1 &&
					action.move.manned.length === 3 &&
					action.move.manned.includes(2) &&
					action.move.manned.includes(3),
				(state) => state.game.players[0]!.done
			),
			actionStep(
				"production",
				"Watch the next production",
				"Ada also buys Water and transfers an Ore operator. Leo saves his remaining cards. Once both finish, you will collect two Water cards and one Ore card. The idle Ore factory produces nothing. Unspent cards carry over between rounds.",
				isWatch,
				(state) => state.game.round === 4,
				"lesson-choices"
			),
		],
		choices: { credits: answers("0", "1", "21") },
		watch: { production: "Watch their turns and production" },
		completion: {
			title: "Stronger income with the same colonists",
			text: "Your three colonists now run two Water factories and one Ore factory. Average income rises from 13 to 17 credits per round. You still have 3 VP: only staffed factories score. The spare Ore factory can work again when you recruit another operator.",
		},
	},
	{
		...shell("auctions"),
		title: "Bid for an upgrade",
		description: "Open an auction, raise a bid and pay for Heavy Equipment.",
		initialState: auctionState,
		steps: [
			{
				id: "intro",
				title: "Upgrades are auctioned",
				text: "On your turn, auction upgrades before buying factories or colonists. Heavy Equipment costs at least 25. It unlocks Titanium factories and gives discounts on other upgrades. This chapter uses open bidding.",
				target: "market",
			},
			actionStep(
				"open",
				"Open at 25",
				"Select Heavy Equipment in the market, then confirm Auction at 25. Other players can raise your bid even when it is not their action turn.",
				(action) =>
					action.kind === "move" &&
					action.move.action === "auction" &&
					action.move.marketIndex === 0 &&
					action.move.bid === 25,
				(state) => state.game.auction?.highBid === 30,
				"market"
			),
			actionStep(
				"raise",
				"Beat Ada’s 30",
				"Ada offers 30 and Leo passes. Bid 31 to stay in the auction. Passing would remove you from this auction; Leo cannot rejoin after passing.",
				(action) => action.kind === "move" && action.move.action === "bid" && action.move.amount === 31,
				(state) => state.game.phase === "auctionPayment",
				"auction"
			),
			actionStep(
				"pay",
				"Pay with your cards",
				"Ada passes, so you win for 31. The smallest payment your cards can make is 32. Confirm the selected cards: you lose the extra credit. Only the winner pays, and your action turn resumes afterward.",
				isMove("pay"),
				(state) => state.game.players[0]!.upgrades.heavyEquipment === 1
			),
		],
		completion: {
			title: "Heavy Equipment is yours",
			text: "Your upgrade adds 1 VP and unlocks Titanium factories. Those factories cost 30, produce stronger cards and score 2 VP when staffed. In a normal turn you could auction another upgrade, then make purchases and finish your turn.",
		},
	},
	{
		...shell("sealed-bids"),
		title: "Sealed bids and discounts",
		description: "Set a maximum bid and see what you actually pay with a discount.",
		initialState: sealedState,
		steps: [
			{
				id: "intro",
				title: "One secret bid each",
				text: "With the sealed-auction option, everyone submits one maximum bid or passes. Ada has opened a Scientists auction. You own two Data Libraries, giving you a 20-credit discount on Scientists. Bid amounts are compared before discounts.",
				target: "auction",
			},
			actionStep(
				"bid",
				"Set your maximum to 60",
				"You hold 40 credits and have a 20-credit discount, so you can bid up to 60. Enter 60 and submit it. Other bidders must bid at least 41, one above the Scientists’ base price. Their amounts stay hidden until everyone responds.",
				(action) => action.kind === "move" && action.move.action === "bid" && action.move.amount === 60,
				(state) => state.game.phase === "auctionPayment",
				"auction"
			),
			question(
				"price",
				"How much do you owe?",
				"You bid 60, Leo bid 50 and Ada bid 40. The price is the second-highest bid plus 1, here 51. Subtract your two Data Libraries’ 20-credit discount. How much do you pay?",
				"31",
				"The auction price is 51. Your 20-credit discount reduces your payment to 31."
			),
			actionStep(
				"pay",
				"Pay 31, keep the rest",
				"Confirm the suggested 31-credit payment. Your maximum bid was 60, but you only owe 31 after the auction and discount. Scientists will produce one Research card each round without an operator.",
				isMove("pay"),
				(state) => state.game.players[0]!.upgrades.scientists === 1
			),
		],
		choices: { price: answers("31", "40", "51") },
		completion: {
			title: "Maximum bid and actual payment",
			text: "You keep 9 credits. The auction price never exceeds your bid or falls below the base price, then your discount applies. Equal highest bids are broken in purchase order starting with the auction opener. If everyone else passes, the opener pays the base price before discounts.",
		},
	},
	{
		...shell("staffing"),
		title: "People, robots and factories",
		description: "Buy a robot and assign operators to your most useful factories.",
		initialState: staffingState,
		steps: [
			{
				id: "intro",
				title: "Unstaffed factories do nothing",
				text: "You have six factories but only three colonists. The three Titanium factories are idle: they produce nothing and score no VP. You already own the Robots upgrade, so you may buy robot tokens for 10 each.",
				target: "colony",
			},
			question(
				"limit",
				"How many robots can operate?",
				"Each Robots upgrade lets you operate as many robots as you have colonists. With three colonists and one Robots upgrade, how many robots could work? Robots do not use your colonist capacity.",
				"3",
				"One Robots upgrade and three colonists let you operate up to three robots. They use no colonist capacity."
			),
			actionStep(
				"assign",
				"Put a robot to work",
				"Buy one robot for 10 and confirm its payment. Choose Assign operators…. Leave the Water factory staffed, unstaff both Ore factories, and staff all three Titanium factories. Then End turn with four factories working.",
				(action) =>
					action.kind === "move" &&
					action.move.action === "endTurn" &&
					action.move.buys.length === 1 &&
					action.move.buys[0]?.buy === "robots" &&
					action.move.buys[0].count === 1 &&
					action.move.manned.length === 4 &&
					[2, 3, 4, 5].every((i) => action.move.action === "endTurn" && action.move.manned.includes(i)),
				(state) => state.game.players[0]!.done
			),
			actionStep(
				"production",
				"See the result",
				"Your operators now run one Water and three Titanium factories. Watch the other players finish and collect your next production.",
				isWatch,
				(state) => state.game.round === 9,
				"lesson-choices"
			),
		],
		choices: { limit: answers("1", "3", "5") },
		watch: { production: "Collect next round’s production" },
		completion: {
			title: "Better use of your operators",
			text: "You collect one Water card and three Titanium cards. Those factories score 7 VP, plus 4 from your upgrades. Colonists start with a capacity of five; Nodules and Outposts increase it. Excess robots can be owned but stay idle until your operating limit grows.",
		},
	},
	{
		...shell("storage"),
		title: "Make room for production",
		description: "Understand hand capacity and choose which cards to discard.",
		initialState: storageState,
		steps: [
			{
				id: "intro",
				title: "Storage is limited",
				text: "After production, discard excess cards before anyone takes an action turn. Your basic hand capacity is ten. You cannot buy something first to avoid discarding. A Warehouse upgrade adds three spaces per copy.",
				target: "hand",
			},
			question(
				"count",
				"Which cards use space?",
				"You hold fourteen cards: ten Ore, two Water and two Research. Research and Microbiotics use no hand capacity. How many of your cards count toward the limit?",
				"12",
				"The ten Ore and two Water cards use 12 spaces. Both Research cards use none."
			),
			actionStep(
				"discard",
				"Keep the valuable cards",
				"Discard the Ore cards worth 1 and 2. They are already suggested. Confirm Discard to keep all the more valuable cards, including both Research cards.",
				(action, state) =>
					action.kind === "move" &&
					action.move.action === "discard" &&
					action.move.cards.length === 2 &&
					action.move.cards.every(
						(i) => state.game.players[0]!.hand[i]?.t === "ore" && state.game.players[0]!.hand[i]!.v <= 2
					),
				(state) => countingHandSize(state.game.players[0]!) === 10
			),
		],
		choices: { count: answers("10", "12", "14") },
		completion: {
			title: "Twelve cards, ten spaces",
			text: "Your ten counting cards fill the available storage. Both Research cards stay outside that limit. Production upgrades such as Scientists and Orbital Lab earn useful cards that do not crowd out your other income.",
		},
	},
	{
		...shell("new-chemicals"),
		title: "Research opens new industry",
		description: "Include a Research card when paying for a New Chemicals factory.",
		initialState: chemicalsState,
		steps: [
			{
				id: "intro",
				title: "Research has two uses",
				text: "Your Laboratory came with a Research factory and allows you to buy more. Staffed Research factories produce Research cards. Scientists also produce Research, without an operator. These cards spend like money, use no hand space, and unlock New Chemicals.",
				target: "colony",
			},
			question(
				"requirement",
				"What must the payment include?",
				"A New Chemicals factory costs 60. Is having a Research card enough, or must you spend it as part of those 60 credits?",
				"Spend one Research card per factory",
				"Spend a Research card as part of each factory’s 60-credit payment. Keeping it in hand is not enough."
			),
			actionStep(
				"build",
				"Use Research to build New Chemicals",
				"Buy one New Chemicals factory. Its 60-credit payment must include your Research card; its value counts toward the 60. Confirm, then Assign operators…. Move an operator from one Ore factory to the new factory and End turn. Keep Water and Research staffed.",
				(action) =>
					action.kind === "move" &&
					action.move.action === "endTurn" &&
					action.move.buys.length === 1 &&
					action.move.buys[0]?.buy === "factory" &&
					action.move.buys[0].factory === "newChemicals" &&
					(action.move.buys[0].count ?? 1) === 1 &&
					[2, 3, 4].every((i) => action.move.action === "endTurn" && action.move.manned.includes(i)),
				(state) => state.game.players[0]!.done
			),
			actionStep(
				"production",
				"Collect the stronger production",
				"Your new factory is staffed and worth 3 VP. Watch the next round to receive a New Chemicals card, along with fresh Research for a future factory.",
				isWatch,
				(state) => state.game.round === 11,
				"lesson-choices"
			),
		],
		choices: { requirement: answers("Keep a Research card in my hand", "Spend one Research card per factory") },
		watch: { production: "Collect New Chemicals production" },
		completion: {
			title: "Research funds your next expansion",
			text: "New Chemicals cards are worth 14–26 credits. Each new factory costs 60 and consumes at least one Research card. You do not need to own a Laboratory if you obtain Research another way, such as Scientists.",
		},
	},
	{
		...shell("mega-production"),
		title: "Choose steady production",
		description: "Trade four random production cards for one fixed-value Mega card.",
		initialState: megaState,
		steps: [
			{
				id: "intro",
				title: "Four factories, one choice",
				text: "Four staffed Water factories let you choose a Mega Water card worth exactly 30 instead of four random Water cards. Decide before seeing this round’s new values. Titanium and New Chemicals factories can also produce Mega cards in groups of four.",
				target: "colony",
			},
			actionStep(
				"mega",
				"Take one Mega Water",
				"Use + to choose one Mega Water, then confirm Take 1 mega. A fixed 30 removes the uncertainty of four draws. Keeping all four singles would give separate cards that are easier to split across purchases.",
				(action) => action.kind === "move" && action.move.action === "mega" && action.move.take.water === 1,
				(state) => state.game.players[0]!.hand.some((card) => card.m && card.t === "water" && card.v === 30)
			),
			question(
				"space",
				"How much storage does it use?",
				"Mega Water is one physical card, but it replaces four ordinary cards. How many spaces does it count toward your hand limit?",
				"4",
				"One Mega card uses four spaces, just like the four production cards it replaces."
			),
		],
		choices: { space: answers("1", "4", "30") },
		completion: {
			title: "Reliable income has a trade-off",
			text: "Your Mega card is worth 30 and uses four spaces. It is spent whole, with no change. Everyone can see its printed value; ordinary production card values stay private.",
		},
	},
	{
		...shell("victory"),
		title: "Finish with the most VP",
		description: "Reach 75 VP and play through the end of the final round.",
		initialState: victoryState,
		steps: [
			{
				id: "intro",
				title: "A prepared final round",
				text: "You have 70 VP: 65 from upgrades and 5 from staffed Water factories. Ecoplants adds 5 VP. Reach 75 and this will be the last round. The player with the most VP when the round finishes wins.",
				target: "colony",
			},
			question(
				"score",
				"Does saving money score points?",
				"You also hold a 60-credit Moon Ore card. Does keeping it in your hand add 60 VP?",
				"No, only staffed factories and upgrades score",
				"Unspent cards add no VP. Points come from staffed factories and upgrades."
			),
			actionStep(
				"open",
				"Win Ecoplants",
				"Open the Ecoplants auction at 30. Ada and Leo cannot beat that bid with their remaining cards, so they pass automatically.",
				(action) =>
					action.kind === "move" &&
					action.move.action === "auction" &&
					action.move.marketIndex === 0 &&
					action.move.bid === 30,
				(state) => state.game.phase === "auctionPayment",
				"market"
			),
			actionStep(
				"pay",
				"Reach 75 VP",
				"Pay with the suggested 30-credit Orbital Medicine card. Ecoplants adds 5 VP and makes colonists cheaper. Watch your score rise from 70 to 75.",
				isMove("pay"),
				(state) => victoryPoints(state.game.players[0]!) === 75
			),
			question(
				"round",
				"Is the game over immediately?",
				"You now have 75 VP, but Ada and Leo still have turns this round. Could another player still finish with more VP and win?",
				"Yes, finish the round first",
				"Everyone finishes the round. Another player can still overtake you; the highest final VP wins."
			),
			actionStep(
				"finish",
				"Finish the last round",
				"Choose Assign operators…, keep all five factories staffed, then End turn. Ada and Leo will finish too. You have the highest score in this example.",
				(action) => action.kind === "move" && action.move.action === "endTurn" && action.move.buys.length === 0,
				(state) => state.game.ended
			),
		],
		choices: {
			score: answers("Yes, money becomes VP", "No, only staffed factories and upgrades score"),
			round: answers("Yes, finish the round first", "No, the first to 75 wins immediately"),
		},
		completion: {
			title: "Your colony wins with 75 VP",
			text: "Build income early, use operators efficiently and turn that income into points. Reaching 75 triggers the final round’s end; it does not stop the other players from taking their remaining turns.",
		},
	},
];

export const tutorialChapters = lessons.map(({ id, version, title, description }) => ({
	id,
	version,
	title,
	description,
}));
