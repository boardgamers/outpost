import type { EffectToken } from "./store.svelte";

export function localizeEffect(tokens: EffectToken[], translate: (source: string) => string): EffectToken[] {
	const replacements: EffectToken[] = [];
	const placeholder = (token: EffectToken) => {
		const index = replacements.push(token) - 1;
		return `{p${index}}`;
	};
	const source = tokens
		.map((token) =>
			typeof token === "string" ? token.replace(/\d+–\d+/g, (range) => placeholder(range)) : placeholder(token)
		)
		.join("");
	return translate(source)
		.split(/(\{p\d+\})/)
		.filter(Boolean)
		.map((piece) => {
			const match = /^\{p(\d+)\}$/.exec(piece);
			return match ? (replacements[Number(match[1])] ?? piece) : piece;
		});
}
