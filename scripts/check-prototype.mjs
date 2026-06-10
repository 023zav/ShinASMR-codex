import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const index = read("index.html");
const main = read("src/main.ts");
const render = read("src/render.ts");
const plates = read("src/plates.ts");
const css = read("src/style.css");
const vite = read("vite.config.ts");

// The authoritative art ladder: one lod-style-v2 plate per zoom band,
// plus the matching isometric vehicle consists.
const requiredAssets = [
  "public/assets-generated/lod-style-v2/lod-01-japan-national-board.webp",
  "public/assets-generated/lod-style-v2/lod-02-japan-rail-atlas.webp",
  "public/assets-generated/lod-style-v2/lod-03-tokaido-national-corridor.webp",
  "public/assets-generated/lod-style-v2/lod-04-central-honshu-railway.webp",
  "public/assets-generated/lod-style-v2/lod-05-kanagawa-corridor.webp",
  "public/assets-generated/lod-style-v2/lod-06-tokyo-yokohama-approach.webp",
  "public/assets-generated/lod-style-v2/lod-07-tokyo-yard-city.webp",
  "public/assets-generated/lod-style-v2/lod-08-tokyo-station-close.webp",
  "public/assets-generated/lod-style-v2/lod-09-shin-yokohama-city.webp",
  "public/assets-generated/lod-style-v2/lod-10-yokohama-station-close.webp",
  "public/assets-generated/lod-style-v2/lod-11-nagoya-station-city.webp",
  "public/assets-generated/lod-style-v2/lod-12-nagoya-station-close.webp",
  "public/assets-generated/lod-style-v2/lod-13-kyoto-station-city.webp",
  "public/assets-generated/lod-style-v2/lod-14-kyoto-station-close.webp",
  "public/assets-generated/lod-style-v2/lod-15-shin-osaka-city.webp",
  "public/assets-generated/lod-style-v2/lod-16-shin-osaka-close.webp",
  "public/assets-generated/vehicle-alpha/train-n700s-blue.webp",
  "public/assets-generated/vehicle-alpha/train-n700a-gold.webp",
  "public/assets-generated/vehicle-alpha/train-500series-slate.webp",
  "public/assets-generated/vehicle-alpha/train-doctor-yellow.webp"
];

for (const asset of requiredAssets) {
  assert(fs.existsSync(path.join(root, asset)), `Missing required asset: ${asset}`);
}

// index.html: clean shell, no legacy map container, authoritative preloads.
assert(index.includes('id="loadingScreen"'), "Loading screen is missing");
assert(index.includes('id="hudToggle"'), "Clean HUD toggle is missing");
assert(index.includes('value="station" selected'), "Default view is not the station view");
assert(!index.includes('<div id="map">'), "Legacy MapLibre container is still in the page");
assert(
  index.includes("lod-style-v2/lod-07-tokyo-yard-city.webp"),
  "Tokyo city plate is not preloaded"
);
assert(index.includes('min="0" max="7.99"'), "Zoom slider is not bound to the 8-band plate ladder");

// main.ts: dynamic renderer import, throttled HUD updates, QA automation hook.
assert(main.includes('import("./render")'), "Renderer is not dynamically imported");
assert(main.includes("lastDetailsUpdate"), "Details panel updates are not throttled");
assert(main.includes("lastNotificationsUpdate"), "Notifications are not throttled");
assert(main.includes("hud-minimal"), "HUD minimal mode is not wired");
assert(main.includes("__shinkansen"), "Visual QA automation hook is missing");
assert(main.includes("setStationLabelLanguage"), "Localized station chips are not wired");
assert(main.includes("STATION_FACTS"), "Real-world station facts are missing from the HUD");
assert(main.includes('queryParams.get("station")'), "Deterministic QA URL params are missing");

// render.ts: single authoritative plate per band, no MapLibre, no CSS art.
assert(!render.includes("maplibre"), "Renderer still depends on MapLibre");
assert(!render.includes("artLayer"), "Renderer still writes to the legacy CSS art layer");
assert(
  plates.includes("export const plateForBand"),
  "Authoritative plate-per-band resolver is missing"
);
assert(plates.includes("lod-style-v2"), "Plate ladder does not use the lod-style-v2 art set");
assert(plates.includes("coverage:"), "Plates do not declare real line-progress coverage");
assert(plates.includes("export const sampleRoute"), "Authored rail route sampler is missing");
assert(
  plates.includes("export const lineProgress"),
  "Timetable positions are not mapped to line progress"
);
assert(
  render.includes("TRAIN_SPRITE_AXIS") && plates.includes("TRAIN_SPRITE_AXIS"),
  "Train sprites are not axis-aligned to authored rails"
);
assert(plates.includes("laneSpread"), "Dwelling trains are not spread across platform lanes");
assert(render.includes("MAX_CACHED_PLATES"), "Plate texture cache is unbounded");
assert(render.includes("Assets.unload"), "Evicted plate textures are not unloaded");
assert(render.includes("CROSSFADE_MS"), "Band transitions do not crossfade");
assert(
  plates.includes("vehicle-alpha/train-n700s-blue.webp"),
  "Runtime trains do not use the isometric consist sprites"
);
assert(render.includes("accuracyPanel"), "Coordinate accuracy debug inset is missing");

// style.css: art layer is fallback-only; compact HUD survives.
assert(css.includes("body.no-webgl"), "no-WebGL fallback styling is missing");
assert(css.includes("display: none;\n  background:"), "CSS art layer is not inert by default");
assert(
  css.includes("body.compact-hud .ops-left"),
  "Runtime compact HUD does not hide desktop side panels"
);
assert(css.includes(".loading-screen"), "Loading screen CSS is missing");
assert(css.includes("body.hud-minimal"), "Minimal HUD CSS is missing");

assert(vite.includes("manualChunks"), "Vite vendor chunk splitting is missing");

console.log(
  "Prototype checks passed: authoritative plate ladder, rail-aligned trains, bounded texture cache, QA hooks, and fallback styling are present."
);
