import { defineConfig } from "vite";

export default defineConfig({
  // Served from a GitHub Pages project subpath (023zav.github.io/ShinASMR-codex/).
  base: "/ShinASMR-codex/",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("pixi.js")) return "vendor-pixi";
          
          return "vendor";
        }
      }
    }
  },
  server: {
    headers: {
      "Cache-Control": "no-store"
    }
  }
});
