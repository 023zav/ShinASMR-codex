import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("pixi.js")) return "vendor-pixi";
          if (id.includes("maplibre-gl")) return "vendor-maplibre";
          if (id.includes("openai")) return "vendor-openai";
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
