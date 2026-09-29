import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const files = {
	"/bundle.js": new URL("../packages/viewer/dist/outpost-viewer.iife.js", import.meta.url),
	"/bundle.css": new URL("../packages/viewer/dist/outpost-viewer.css", import.meta.url),
};
const html =
	'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Outpost tutorial</title><link rel="stylesheet" href="/bundle.css"><div id="app"></div><script src="/bundle.js"></script><script>outpost.launchTutorial("#app",{chapter:new URLSearchParams(location.search).get("chapter")||"colony"});</script>';
export function previewServer() {
	return createServer(async (req, res) => {
		const path = new URL(req.url, "http://localhost").pathname;
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Cache-Control", "no-store");
		try {
			if (files[path]) {
				res.setHeader("Content-Type", path.endsWith(".css") ? "text/css" : "text/javascript");
				res.end(await readFile(files[path]));
			} else if (/^\/[a-zA-Z0-9_-]+\.json$/.test(path)) {
				res.setHeader("Content-Type", "application/json");
				res.end(await readFile(new URL("../packages/viewer/dist" + path, import.meta.url)));
			} else if (path === "/") {
				res.setHeader("Content-Type", "text/html");
				res.end(html);
			} else {
				res.writeHead(404).end();
			}
		} catch {
			res.writeHead(500).end("Build the viewer first with pnpm build.");
		}
	});
}
if (import.meta.main) {
	const port = Number(process.env.PORT || 5198);
	previewServer().listen(port, "127.0.0.1", () => console.log(`Outpost tutorial: http://127.0.0.1:${port}/`));
}
