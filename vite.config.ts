import { defineConfig } from "vite";

export default defineConfig({
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
