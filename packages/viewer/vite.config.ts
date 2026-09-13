import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
	plugins: [svelte()],
	build: {
		outDir: "dist",
		emptyOutDir: true,
		cssCodeSplit: false,
		sourcemap: true,
		// Vite requires a bundle name; registerViewer owns the outpost global.
		lib: {
			name: "outpostBundle",
			entry: "src/viewer.ts",
			formats: ["iife"],
			fileName: () => "outpost-viewer.iife.js",
		},
		rollupOptions: {
			output: {
				assetFileNames: (asset) =>
					asset.names?.some((n) => n.endsWith(".css")) ? "outpost-viewer.css" : "[name]-[hash][extname]",
			},
		},
	},
	server: {
		port: 5173,
		strictPort: false,
	},
	define: {
		__DEV__: JSON.stringify(command === "serve"),
	},
}));
