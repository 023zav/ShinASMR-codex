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
const css = read("src/style.css");
const vite = read("vite.config.ts");

const requiredAssets = [
  "public/assets-generated/map-lod-candidates/tokyo-station-city-reference-style.webp",
  "public/assets-generated/map-lod-candidates/japan-overview-reference-style.webp",
  "public/assets-generated/map-lod-candidates/shin-yokohama-city-reference-style.webp",
  "public/assets-generated/map-lod-candidates/nagoya-city-reference-style.webp",
  "public/assets-generated/map-lod-candidates/kyoto-city-reference-style.webp",
  "public/assets-generated/map-lod-candidates/shin-osaka-city-reference-style.webp",
  "public/assets-generated/lod-style-v2/lod-01-japan-national-board.webp",
  "public/assets-generated/lod-style-v2/lod-02-japan-rail-atlas.webp",
  "public/assets-generated/lod-style-v2/lod-03-tokaido-national-corridor.webp",
  "public/assets-generated/lod-style-v2/lod-04-central-honshu-railway.webp",
  "public/assets-generated/lod-style-v2/lod-06-tokyo-yokohama-approach.webp",
  "public/assets-generated/lod-style-v2/lod-07-tokyo-yard-city.webp",
  "public/assets-generated/lod-style-v2/lod-08-tokyo-station-close.webp",
  "public/assets-generated/ops-train-sprite-n700s-alpha.png",
  "public/assets-generated/ops-train-sprite-n700a-alpha.png",
  "public/assets-generated/vehicle-alpha/train-n700s-blue.webp",
  "public/assets-generated/vehicle-alpha/train-n700a-gold.webp",
  ...["tokyo", "yokohama", "nagoya", "kyoto", "osaka"].flatMap((station) => [
    `public/assets-generated/zoom-plates-v3/${station}-z10-station-district.webp`,
    `public/assets-generated/polish-v5/${station}-z11-wide-approach-v5.webp`,
    `public/assets-generated/polish-v5/${station}-z12-station-context-v5.webp`,
    `public/assets-generated/zoom-plates-v3/${station}-z13-station-yard.webp`,
    `public/assets-generated/polish-v4/${station}-z14-rail-district-v4.webp`,
    `public/assets-generated/polish-v5/${station}-z15-platform-close-v5.webp`
  ])
];

for (const asset of requiredAssets) {
  assert(fs.existsSync(path.join(root, asset)), `Missing required asset: ${asset}`);
}

assert(index.includes('id="loadingScreen"'), "Loading screen is missing");
assert(index.includes('id="hudToggle"'), "Clean HUD toggle is missing");
assert(index.includes('value="station" selected'), "Default view is not Tokyo station");
assert(index.includes('value="12.35"'), "Initial zoom slider is not bounded Tokyo zoom");
assert(index.includes("generated-lod-v25-authoritative-art-20260510"), "Cache-bust marker not updated");
assert(index.includes("Generated city art"), "Legend still advertises non-Shinkansen line clutter");
assert(main.includes('import("./render")'), "Renderer is not dynamically imported");
assert(main.includes('lastDetailsUpdate'), "Details panel updates are not throttled");
assert(main.includes('lastNotificationsUpdate'), "Notifications are not throttled");
assert(main.includes('hud-minimal'), "HUD minimal mode is not wired");
assert(render.includes("TOKYO_STATION_CAMERA"), "Tokyo startup camera constant is missing");
assert(render.includes("LOCAL_COORDINATE_STYLE"), "Renderer still depends on remote map style during startup");
assert(render.includes('center: TOKYO_STATION_CAMERA.center'), "Map does not start at Tokyo camera");
assert(render.includes('requestedViewMode: "japan" | "corridor" | "station" = "station"'), "Renderer does not preserve station-view intent");
assert(render.includes('focusedStationId = "tokyo"'), "Renderer does not preserve focused station for generated art");
assert(!render.includes('Math.max(12, zoomIndex)'), "Station view still locks users into city LOD while zooming out");
assert(render.includes('clamp(zoomIndex, 0, 15)'), "Station view cannot traverse all 16 generated LODs");
assert(render.includes("applyWorldArt"), "Generated world art is still owned by brittle CSS-only selectors");
assert(render.includes("band.index >= 10") && render.includes("cityPlateKey(stationId, band)"), "Close zooms do not use per-level generated city plates");
assert(render.includes("const artViewportBounds"), "Generated-art viewport-safe projection is missing");
assert(render.includes("const sampleArtRoute"), "Generated-art route sampler is missing");
assert(render.includes("const routeProgressFromLatLon"), "Timetable train progress is not mapped into generated art space");
assert(render.includes("const artTrainPose"), "Runtime trains are not placed on generated-art rails");
assert(render.includes("drawGeneratedSceneRoute(corridorLayer, app, band, quality)"), "Public mode does not use generated-art route rendering");
assert(render.includes("const hiddenOutsideCloseStation"), "Close station view still shows distant trains piled onto Tokyo art");
assert(render.includes('const STARTUP_TEXTURE_KEYS'), "Startup texture allow-list is missing");
assert(render.includes('const routePoseAtScreen'), "Train-to-track snapping helper is missing");
assert(render.includes('drawStationApproaches'), "Station approach rendering hook is missing");
assert(render.includes('drawMapAccuracyDebug'), "Map accuracy debug hook is missing");
assert(!render.includes('fetch(url, { method: "HEAD" })'), "Texture loading still performs extra HEAD requests");
assert(!render.includes("drawGeoCityPlates(geoArtLayer"), "Pixi still draws generated city plates over CSS city art");
assert(render.includes("map.stop();"), "Zoom animations are not cancelled before starting new wheel zooms");
assert(render.includes('band.routeMode === "station"') && render.includes('quiet operational guide'), "Station LOD does not use the quiet route-guide rail overlay");
assert(render.includes("if (showAccuracyDebug)") && render.includes("drawStationApproaches(corridorLayer"), "Station approach overlays are not gated behind accuracy debug");
assert(render.includes("if (showAccuracyDebug)") && render.includes("drawSecondaryLines(corridorLayer"), "Non-Shinkansen secondary lines are not gated behind accuracy debug");
assert(render.includes('hasGenerated ? "generated" : "detail"'), "In-world close trains do not use pre-trimmed generated alpha sprites");
assert(render.includes('ops-train-sprite-n700s-alpha.png'), "Runtime train art is not using the trimmed generated N700S sprite");
assert(render.includes('return clamp(band.trainScale * 1.18'), "Close train scale is not bounded/fitted for station LOD");
assert(render.includes("document.body.dataset.view"), "Renderer does not expose view state to CSS for robust art visibility");
assert(css.includes("Speed, usability, and reference-style pass, v15"), "v15 CSS pass is missing");
assert(css.includes("City-view recovery, v16"), "v16 city-view recovery CSS is missing");
assert(css.includes("Mobile rescue and station-art foreground pass, v17"), "v17 mobile/city rescue CSS is missing");
assert(css.includes("Compact HUD hard gate, v18"), "v18 runtime compact HUD CSS is missing");
assert(css.includes("World-layer ownership pass, v19"), "v19 world-layer ownership CSS is missing");
assert(css.includes("Operational layer integration, v20"), "v20 operational layer integration CSS is missing");
assert(css.includes("Generated LOD atlas pass, v21"), "v21 generated LOD atlas CSS is missing");
assert(css.includes("LOD repair v22"), "v22 LOD repair CSS is missing");
assert(css.includes("v23 architectural repair"), "v23 runtime-owned world art repair CSS is missing");
assert(css.includes("v24 generated art-space authority"), "v24 generated art-space authority CSS is missing");
assert(css.includes("v25 structural recovery"), "v25 authoritative generated-world CSS is missing");
assert(css.includes('#map[data-view="city"] .maplibregl-canvas'), "City view map underlay override is missing");
assert(css.includes('lod-style-v2/lod-01-japan-national-board.webp'), "Generated national-scale art is not wired");
assert(css.includes('lod-style-v2/lod-04-central-honshu-railway.webp'), "Generated regional-scale art is not wired");
assert(css.includes('lod-style-v2/lod-06-tokyo-yokohama-approach.webp'), "Generated corridor-scale art is not wired");
assert(css.includes('map-lod-candidates/tokyo-station-city-reference-style.webp'), "Tokyo generated city reference plate is not wired as foreground art");
assert(css.includes('map-lod-candidates/japan-overview-reference-style.webp'), "Japan overview generated plate is not wired as foreground art");
assert(css.includes('#map[data-view="corridor"] .maplibregl-canvas'), "Corridor OSM underlay specificity override is missing");
assert(css.includes('polish-v4/train-n700s-full-v4.webp'), "Train preview does not use full fitted generated vehicle art");
assert(css.includes('body[data-view="overview"] #artLayer'), "Overview art layer is not explicitly visible");
assert(css.includes('body[data-view="corridor"] #artLayer'), "Corridor art layer is not explicitly visible");
assert(css.includes("@media (max-width: 1240px)"), "Mobile/tablet HUD rescue media query is missing");
assert(css.includes("body.compact-hud .ops-left"), "Runtime compact HUD does not hide desktop side panels");
assert(css.includes("generated-world:not(.accuracy-debug) #map"), "Public generated world still allows map bleed-through");
assert(css.includes('body[data-view="city"][data-station="tokyo"] #artLayer'), "Body-scoped Tokyo city art override is missing");
assert(css.includes("background-size: contain !important"), "Train previews can still crop vehicle art");
assert(css.includes(".loading-screen"), "Loading screen CSS is missing");
assert(css.includes("body.hud-minimal"), "Minimal HUD CSS is missing");
assert(vite.includes("manualChunks"), "Vite vendor chunk splitting is missing");

console.log("Prototype checks passed: integrated close rail layer, full in-world train LOD, one-world-layer LOD, bounded zoom, fitted train previews, loading, Tokyo close start, dynamic renderer import, HUD controls, and visual overrides are present.");
