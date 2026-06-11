import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import * as PIXI from "pixi.js";
import { Line, Station, TrainType } from "./data/types";
import { SimTrainState } from "./sim";
import { withBase } from "./asset-base";

export type RenderHandles = {
  app: PIXI.Application;
  camera: PIXI.Container;
  trainSprites: Map<string, PIXI.Container>;
  stationSprites: Map<string, PIXI.Container>;
  world: PIXI.Container;
  toScreen: (lat: number, lon: number) => PIXI.Point;
  setFollowTarget: (id: string | null) => void;
  setReducedMotion: (enabled: boolean) => void;
  setQuality: (quality: "low" | "medium" | "high") => void;
  setAccuracyDebug: (enabled: boolean) => void;
  zoomBy: (factor: number) => void;
  setZoom: (zoom: number) => void;
  resetView: () => void;
  setViewMode: (mode: "japan" | "corridor" | "station") => void;
  focusStation: (id: string) => void;
  setTrainTapHandler: (handler: (id: string) => void) => void;
  setStationTapHandler: (handler: (id: string) => void) => void;
  update: (trains: SimTrainState[]) => void;
  getCameraCenter: () => PIXI.Point;
  getZoom: () => number;
  getZoomRange: () => { min: number; max: number };
  getStats: () => { trains: number; trackSprites: number; landmarks: number; detailLevel: number; detailIndex: number; view: MacroView; routeMode: RouteRenderMode; trainMode: TrainRenderMode; platformDetail: number; loadedCityArt: number; pendingCityArt: number; accuracyDebug: boolean };
};

type Quality = "low" | "medium" | "high";

type StationSceneItem = {
  station: Station;
  district: PIXI.Container;
  node: PIXI.Container;
  label: PIXI.Container;
  landmark: PIXI.Container | null;
};

type AssetKey = string;

type GeneratedTextures = Partial<Record<AssetKey, PIXI.Texture>>;
type SecondaryLine = {
  id: string;
  name: string;
  color: number;
  minBand: number;
  points: Array<[number, number]>;
};

const SECONDARY_LINES: SecondaryLine[] = [
  {
    id: "yamanote",
    name: "Yamanote Line",
    color: 0x7bd64d,
    minBand: 10,
    points: [[35.6812,139.7671],[35.7138,139.7772],[35.7289,139.7104],[35.6909,139.7003],[35.6580,139.7016],[35.6285,139.7388],[35.6812,139.7671]]
  },
  {
    id: "chuo",
    name: "Chuo Main Line",
    color: 0xe39632,
    minBand: 10,
    points: [[35.6812,139.7671],[35.7020,139.7454],[35.6993,139.7006],[35.7060,139.6657],[35.7027,139.5609]]
  },
  {
    id: "keihin",
    name: "Keihin-Tohoku",
    color: 0x53c6d8,
    minBand: 10,
    points: [[35.7777,139.7205],[35.7138,139.7772],[35.6812,139.7671],[35.6302,139.7404],[35.4658,139.6225]]
  },
  {
    id: "nagoya-loop",
    name: "Nagoya Urban Lines",
    color: 0x9bd56d,
    minBand: 11,
    points: [[35.1709,136.8815],[35.1815,136.9064],[35.1542,136.9189],[35.1308,136.9067],[35.1452,136.8516],[35.1709,136.8815]]
  },
  {
    id: "kyoto-local",
    name: "Kyoto Local Lines",
    color: 0xcbb66b,
    minBand: 11,
    points: [[34.9858,135.7588],[35.0037,135.7690],[35.0116,135.7681],[35.0212,135.7556],[34.9858,135.7588]]
  },
  {
    id: "osaka-loop",
    name: "Osaka Loop Line",
    color: 0xe28734,
    minBand: 10,
    points: [[34.7335,135.5006],[34.7055,135.4983],[34.6671,135.5006],[34.6558,135.5134],[34.6824,135.5342],[34.6987,135.5301],[34.7335,135.5006]]
  }
];


const LOCAL_COORDINATE_STYLE = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "coordinate-background",
      type: "background",
      paint: { "background-color": "#071820" }
    }
  ]
} as maplibregl.StyleSpecification;

type MacroView = "overview" | "regional" | "corridor" | "city";
type RouteRenderMode = "atlas" | "guide" | "viaduct" | "station";
type TrainRenderMode = "pin" | "short" | "full";

type DetailBand = {
  index: number;
  macro: MacroView;
  routeMode: RouteRenderMode;
  trainMode: TrainRenderMode;
  platformDetail: 0 | 1 | 2 | 3;
  routeWidth: number;
  sleeperStep: number;
  trainScale: number;
  labelScale: number;
  cityIntensity: number;
  cityPlateAlpha: number;
  stationScale: number;
  laneScale: number;
};

const ZOOM_MIN = 4.15;
const ZOOM_MAX = 12.65;
const TOKYO_STATION_CAMERA = {
  center: [139.7671, 35.6812] as [number, number],
  zoomDesktop: 12.35,
  zoomMobile: 11.95,
  pitch: 58,
  bearing: -18
};

const LOD_MATRIX: DetailBand[] = [
  { index: 0, macro: "overview", routeMode: "atlas", trainMode: "pin", platformDetail: 0, routeWidth: 1.15, sleeperStep: 160, trainScale: 0.020, labelScale: 0.64, cityIntensity: 0.00, cityPlateAlpha: 0.00, stationScale: 0.40, laneScale: 0.55 },
  { index: 1, macro: "overview", routeMode: "atlas", trainMode: "pin", platformDetail: 0, routeWidth: 1.30, sleeperStep: 152, trainScale: 0.022, labelScale: 0.67, cityIntensity: 0.04, cityPlateAlpha: 0.00, stationScale: 0.42, laneScale: 0.58 },
  { index: 2, macro: "overview", routeMode: "atlas", trainMode: "pin", platformDetail: 0, routeWidth: 1.48, sleeperStep: 144, trainScale: 0.024, labelScale: 0.70, cityIntensity: 0.08, cityPlateAlpha: 0.00, stationScale: 0.44, laneScale: 0.62 },
  { index: 3, macro: "overview", routeMode: "atlas", trainMode: "pin", platformDetail: 0, routeWidth: 1.65, sleeperStep: 136, trainScale: 0.026, labelScale: 0.74, cityIntensity: 0.14, cityPlateAlpha: 0.00, stationScale: 0.47, laneScale: 0.70 },
  { index: 4, macro: "regional", routeMode: "guide", trainMode: "short", platformDetail: 0, routeWidth: 1.88, sleeperStep: 128, trainScale: 0.030, labelScale: 0.78, cityIntensity: 0.22, cityPlateAlpha: 0.00, stationScale: 0.50, laneScale: 0.78 },
  { index: 5, macro: "regional", routeMode: "guide", trainMode: "short", platformDetail: 0, routeWidth: 2.08, sleeperStep: 120, trainScale: 0.034, labelScale: 0.82, cityIntensity: 0.30, cityPlateAlpha: 0.00, stationScale: 0.54, laneScale: 0.88 },
  { index: 6, macro: "regional", routeMode: "guide", trainMode: "short", platformDetail: 1, routeWidth: 2.30, sleeperStep: 112, trainScale: 0.039, labelScale: 0.86, cityIntensity: 0.38, cityPlateAlpha: 0.00, stationScale: 0.58, laneScale: 1.00 },
  { index: 7, macro: "regional", routeMode: "guide", trainMode: "short", platformDetail: 1, routeWidth: 2.55, sleeperStep: 104, trainScale: 0.045, labelScale: 0.90, cityIntensity: 0.46, cityPlateAlpha: 0.00, stationScale: 0.64, laneScale: 1.14 },
  { index: 8, macro: "corridor", routeMode: "viaduct", trainMode: "short", platformDetail: 1, routeWidth: 2.85, sleeperStep: 96, trainScale: 0.052, labelScale: 0.94, cityIntensity: 0.54, cityPlateAlpha: 0.00, stationScale: 0.72, laneScale: 1.30 },
  { index: 9, macro: "corridor", routeMode: "viaduct", trainMode: "short", platformDetail: 1, routeWidth: 3.15, sleeperStep: 88, trainScale: 0.060, labelScale: 0.98, cityIntensity: 0.62, cityPlateAlpha: 0.00, stationScale: 0.80, laneScale: 1.48 },
  { index: 10, macro: "corridor", routeMode: "viaduct", trainMode: "short", platformDetail: 0, routeWidth: 3.45, sleeperStep: 80, trainScale: 0.069, labelScale: 1.02, cityIntensity: 0.70, cityPlateAlpha: 0.00, stationScale: 0.88, laneScale: 1.68 },
  { index: 11, macro: "corridor", routeMode: "viaduct", trainMode: "full", platformDetail: 0, routeWidth: 3.75, sleeperStep: 72, trainScale: 0.078, labelScale: 1.06, cityIntensity: 0.78, cityPlateAlpha: 0.00, stationScale: 0.96, laneScale: 1.90 },
  { index: 12, macro: "city", routeMode: "station", trainMode: "full", platformDetail: 0, routeWidth: 4.10, sleeperStep: 64, trainScale: 0.088, labelScale: 1.10, cityIntensity: 0.84, cityPlateAlpha: 0.00, stationScale: 1.05, laneScale: 2.18 },
  { index: 13, macro: "city", routeMode: "station", trainMode: "full", platformDetail: 0, routeWidth: 4.55, sleeperStep: 56, trainScale: 0.098, labelScale: 1.14, cityIntensity: 0.90, cityPlateAlpha: 0.00, stationScale: 1.16, laneScale: 2.50 },
  { index: 14, macro: "city", routeMode: "station", trainMode: "full", platformDetail: 0, routeWidth: 5.05, sleeperStep: 48, trainScale: 0.110, labelScale: 1.18, cityIntensity: 0.96, cityPlateAlpha: 0.00, stationScale: 1.28, laneScale: 2.86 },
  { index: 15, macro: "city", routeMode: "station", trainMode: "full", platformDetail: 0, routeWidth: 5.60, sleeperStep: 40, trainScale: 0.124, labelScale: 1.22, cityIntensity: 1.00, cityPlateAlpha: 0.00, stationScale: 1.42, laneScale: 3.25 }
];

const getDetailBandByIndex = (index: number): DetailBand => LOD_MATRIX[clamp(index, 0, 15)];

const getDetailBand = (zoom: number): DetailBand => {
  return getDetailBandByIndex(Math.floor(((zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)) * 16));
};


type CityProfile = {
  tone: number;
  accent: number;
  density: number;
  terrain: "bay" | "castle" | "temple" | "tower" | "terminal";
};

const CITY_PROFILES: Record<string, CityProfile> = {
  tokyo: { tone: 0x526f75, accent: 0xd65a3a, density: 1, terrain: "terminal" },
  yokohama: { tone: 0x5b8990, accent: 0x78d4df, density: 0.86, terrain: "bay" },
  nagoya: { tone: 0x697060, accent: 0xd0bc71, density: 0.72, terrain: "castle" },
  kyoto: { tone: 0x627f50, accent: 0xd78643, density: 0.58, terrain: "temple" },
  osaka: { tone: 0x6f7d87, accent: 0xbacbd7, density: 0.92, terrain: "tower" }
};

const cityProfile = (stationId: string) => CITY_PROFILES[stationId] ?? CITY_PROFILES.nagoya;

type StationArtBounds = {
  lat: number;
  lon: number;
  side: 1 | -1;
  terminalTracks: number;
  terminalScale: number;
};

const STATION_ART_BOUNDS: Record<string, StationArtBounds> = {
  tokyo: { lat: 0.033, lon: 0.052, side: -1, terminalTracks: 8, terminalScale: 1.18 },
  yokohama: { lat: 0.024, lon: 0.038, side: -1, terminalTracks: 4, terminalScale: 0.92 },
  nagoya: { lat: 0.029, lon: 0.045, side: 1, terminalTracks: 6, terminalScale: 1.02 },
  kyoto: { lat: 0.026, lon: 0.04, side: 1, terminalTracks: 4, terminalScale: 0.94 },
  osaka: { lat: 0.034, lon: 0.054, side: 1, terminalTracks: 8, terminalScale: 1.16 }
};

const stationArtBounds = (stationId: string) => STATION_ART_BOUNDS[stationId] ?? STATION_ART_BOUNDS.nagoya;

const PALETTE = {
  railBed: 0x2b3740,
  railStone: 0xb3b8b5,
  steel: 0xf2f7ef,
  glow: 0xa7d8ce,
  ink: 0x061018,
  label: 0xf2f7ec,
  blue: 0x2f76c6,
  gold: 0xd4a34e,
  coral: 0xd97857,
  mint: 0x8fbea1
};

// Generated art provides the retro-game surface. MapLibre/OpenFreeMap remains
// the coordinate source underneath, so close-up plates and rails are anchored to
// real station/line positions instead of floating as screen-space wallpaper.
const GENERATED_ASSETS: Partial<Record<AssetKey, string>> = {
  trainGeneratedN700S: "/assets-generated/ops-train-sprite-n700s-alpha.png",
  trainGeneratedN700A: "/assets-generated/ops-train-sprite-n700a-alpha.png",
  trainGeneratedDoctor: "/assets-generated/vehicle-alpha/train-doctor-yellow.webp",
  trainGenerated500: "/assets-generated/vehicle-alpha/train-500series-slate.webp",
  stationPlatformKit: "/assets-generated/vehicle-alpha/station-platform-kit.png",
  railTrackKit: "/assets-generated/vehicle-alpha/rail-track-kit.png",
  stationPlatformSprite: "/assets-generated/polish-v4/station-platform-v4.webp",
  stationConcourseSprite: "/assets-generated/sprites/station-concourse.png",
  stationCanopySprite: "/assets-generated/sprites/station-canopy.png",
  railStraightSprite: "/assets-generated/polish-v4/rail-elevated-straight-v4.webp",
  railCurveSprite: "/assets-generated/polish-v4/rail-elevated-curve-v4.webp",
  railGantrySprite: "/assets-generated/sprites/rail-catenary-gantry.png",
  stationNodeTokyo: "/assets-generated/station-nodes-alpha/station-node-tokyo.png",
  stationNodeYokohama: "/assets-generated/station-nodes-alpha/station-node-shin-yokohama.png",
  stationNodeNagoya: "/assets-generated/station-nodes-alpha/station-node-nagoya.png",
  stationNodeKyoto: "/assets-generated/station-nodes-alpha/station-node-kyoto.png",
  stationNodeOsaka: "/assets-generated/station-nodes-alpha/station-node-shin-osaka.png",
  stationYardTokyo: "/assets-generated/vehicle-plates/tokyo-station-yard-detail.png",
  hudOperationsKit: "/assets-generated/vehicle-plates/hud-operations-kit.png",
  cityTokyoZ10: "/assets-generated/zoom-plates-v3/tokyo-z10-station-district.webp",
  cityTokyoZ11: "/assets-generated/polish-v5/tokyo-z11-wide-approach-v5.webp",
  cityTokyoZ12: "/assets-generated/polish-v5/tokyo-z12-station-context-v5.webp",
  cityTokyoZ13: "/assets-generated/zoom-plates-v3/tokyo-z13-station-yard.webp",
  cityTokyoZ14: "/assets-generated/polish-v4/tokyo-z14-rail-district-v4.webp",
  cityTokyoZ15: "/assets-generated/polish-v5/tokyo-z15-platform-close-v5.webp",
  cityYokohamaZ10: "/assets-generated/zoom-plates-v3/yokohama-z10-station-district.webp",
  cityYokohamaZ11: "/assets-generated/polish-v5/yokohama-z11-wide-approach-v5.webp",
  cityYokohamaZ12: "/assets-generated/polish-v5/yokohama-z12-station-context-v5.webp",
  cityYokohamaZ13: "/assets-generated/zoom-plates-v3/yokohama-z13-station-yard.webp",
  cityYokohamaZ14: "/assets-generated/polish-v4/yokohama-z14-rail-district-v4.webp",
  cityYokohamaZ15: "/assets-generated/polish-v5/yokohama-z15-platform-close-v5.webp",
  cityNagoyaZ10: "/assets-generated/zoom-plates-v3/nagoya-z10-station-district.webp",
  cityNagoyaZ11: "/assets-generated/polish-v5/nagoya-z11-wide-approach-v5.webp",
  cityNagoyaZ12: "/assets-generated/polish-v5/nagoya-z12-station-context-v5.webp",
  cityNagoyaZ13: "/assets-generated/zoom-plates-v3/nagoya-z13-station-yard.webp",
  cityNagoyaZ14: "/assets-generated/polish-v4/nagoya-z14-rail-district-v4.webp",
  cityNagoyaZ15: "/assets-generated/polish-v5/nagoya-z15-platform-close-v5.webp",
  cityKyotoZ10: "/assets-generated/zoom-plates-v3/kyoto-z10-station-district.webp",
  cityKyotoZ11: "/assets-generated/polish-v5/kyoto-z11-wide-approach-v5.webp",
  cityKyotoZ12: "/assets-generated/polish-v5/kyoto-z12-station-context-v5.webp",
  cityKyotoZ13: "/assets-generated/zoom-plates-v3/kyoto-z13-station-yard.webp",
  cityKyotoZ14: "/assets-generated/polish-v4/kyoto-z14-rail-district-v4.webp",
  cityKyotoZ15: "/assets-generated/polish-v5/kyoto-z15-platform-close-v5.webp",
  cityOsakaZ10: "/assets-generated/zoom-plates-v3/osaka-z10-station-district.webp",
  cityOsakaZ11: "/assets-generated/polish-v5/osaka-z11-wide-approach-v5.webp",
  cityOsakaZ12: "/assets-generated/polish-v5/osaka-z12-station-context-v5.webp",
  cityOsakaZ13: "/assets-generated/zoom-plates-v3/osaka-z13-station-yard.webp",
  cityOsakaZ14: "/assets-generated/polish-v4/osaka-z14-rail-district-v4.webp",
  cityOsakaZ15: "/assets-generated/polish-v5/osaka-z15-platform-close-v5.webp"
};

type WorldArtPlate = {
  url: string;
  position?: string;
  size?: string;
  filter?: string;
};

type ArtRouteSpec = {
  points: Array<[number, number]>;
  stationT: Record<string, number>;
  labelT?: Record<string, number>;
};

const WORLD_ART_PLATES: WorldArtPlate[] = [
  { url: "/assets-generated/map-lod-candidates/japan-overview-reference-style.webp", position: "center center", size: "cover" },
  { url: "/assets-generated/map-lod-candidates/japan-overview-reference-style.webp", position: "center center", size: "cover" },
  { url: "/assets-generated/lod-style-v2/lod-02-japan-rail-atlas.webp", position: "center center", size: "cover" },
  { url: "/assets-generated/lod-style-v2/lod-02-japan-rail-atlas.webp", position: "center center", size: "cover" },
  { url: "/assets-generated/lod-style-v2/lod-03-tokaido-national-corridor.webp", position: "center center", size: "cover" },
  { url: "/assets-generated/lod-style-v2/lod-03-tokaido-national-corridor.webp", position: "center center", size: "cover" },
  { url: "/assets-generated/lod-style-v2/lod-04-central-honshu-railway.webp", position: "center center", size: "cover" },
  { url: "/assets-generated/lod-style-v2/lod-04-central-honshu-railway.webp", position: "center center", size: "cover" },
  { url: "/assets-generated/lod-style-v2/lod-05-kanagawa-corridor.webp", position: "center center", size: "cover" },
  { url: "/assets-generated/lod-style-v2/lod-06-tokyo-yokohama-approach.webp", position: "center center", size: "cover" },
  { url: "/assets-generated/lod-style-v2/lod-07-tokyo-yard-city.webp", position: "center center", size: "cover" },
  { url: "/assets-generated/lod-style-v2/lod-07-tokyo-yard-city.webp", position: "center center", size: "cover" },
  { url: "/assets-generated/map-lod-candidates/tokyo-station-city-reference-style.webp", position: "center center", size: "cover" },
  { url: "/assets-generated/map-lod-candidates/tokyo-station-city-reference-style.webp", position: "center center", size: "cover" },
  { url: "/assets-generated/map-lod-candidates/tokyo-station-city-reference-style.webp", position: "center center", size: "cover" },
  { url: "/assets-generated/map-lod-candidates/tokyo-station-city-reference-style.webp", position: "center center", size: "cover" }
];

const STATION_WORLD_ART: Record<string, WorldArtPlate> = {
  tokyo: { url: "/assets-generated/map-lod-candidates/tokyo-station-city-reference-style.webp", position: "center center", size: "cover" },
  yokohama: { url: "/assets-generated/map-lod-candidates/shin-yokohama-city-reference-style.webp", position: "center center", size: "cover" },
  nagoya: { url: "/assets-generated/map-lod-candidates/nagoya-city-reference-style.webp", position: "center center", size: "cover" },
  kyoto: { url: "/assets-generated/map-lod-candidates/kyoto-city-reference-style.webp", position: "center center", size: "cover" },
  osaka: { url: "/assets-generated/map-lod-candidates/shin-osaka-city-reference-style.webp", position: "center center", size: "cover" }
};

const worldArtFor = (stationId: string, band: DetailBand): WorldArtPlate => {
  if (band.index >= 10) {
    const key = cityPlateKey(stationId, band);
    const url = key ? GENERATED_ASSETS[key] : undefined;
    if (url) return { url, position: "center center", size: "cover" };
  }
  if (band.index >= 12) return STATION_WORLD_ART[stationId] ?? STATION_WORLD_ART.tokyo;
  return WORLD_ART_PLATES[band.index] ?? WORLD_ART_PLATES[0];
};

const ART_ROUTE_STATIONS: Record<string, number> = {
  osaka: 0.08,
  kyoto: 0.17,
  nagoya: 0.40,
  yokohama: 0.73,
  tokyo: 0.82
};

const ART_ROUTE_BY_LOD: ArtRouteSpec[] = [
  {
    points: [[0.20, 0.58], [0.32, 0.57], [0.47, 0.60], [0.62, 0.58], [0.77, 0.53]],
    stationT: ART_ROUTE_STATIONS
  },
  {
    points: [[0.17, 0.63], [0.30, 0.61], [0.45, 0.58], [0.62, 0.55], [0.79, 0.49]],
    stationT: ART_ROUTE_STATIONS
  },
  {
    points: [[0.10, 0.70], [0.25, 0.63], [0.40, 0.59], [0.56, 0.55], [0.74, 0.47], [0.91, 0.39]],
    stationT: ART_ROUTE_STATIONS
  },
  {
    points: [[0.10, 0.72], [0.24, 0.64], [0.39, 0.58], [0.54, 0.53], [0.70, 0.46], [0.88, 0.39]],
    stationT: {
      osaka: 0.06,
      kyoto: 0.14,
      nagoya: 0.34,
      yokohama: 0.50,
      tokyo: 0.70
    },
    labelT: {
      yokohama: 0.43,
      tokyo: 0.70
    }
  }
];

const artRouteSpecFor = (band: DetailBand): ArtRouteSpec => {
  if (band.index >= 12) return ART_ROUTE_BY_LOD[3];
  if (band.index >= 8) return ART_ROUTE_BY_LOD[2];
  if (band.index >= 4) return ART_ROUTE_BY_LOD[1];
  return ART_ROUTE_BY_LOD[0];
};

const applyWorldArt = (artEl: HTMLDivElement, plate: WorldArtPlate, band: DetailBand) => {
  document.body.classList.add("generated-world");
  const wash =
    band.index >= 12
      ? "linear-gradient(180deg, rgba(2, 8, 10, 0.00), rgba(2, 8, 10, 0.035))"
      : band.index >= 8
        ? "linear-gradient(180deg, rgba(2, 8, 10, 0.015), rgba(2, 8, 10, 0.065))"
        : "linear-gradient(180deg, rgba(2, 8, 10, 0.00), rgba(2, 8, 10, 0.025))";
  artEl.style.setProperty("--world-art-url", `url("${withBase(plate.url)}")`);
  artEl.style.setProperty("--world-art-position", plate.position ?? "center center");
  artEl.style.setProperty("--world-art-size", plate.size ?? "cover");
  artEl.style.setProperty("background-image", `${wash}, url("${withBase(plate.url)}")`, "important");
  artEl.style.setProperty("background-position", `center center, ${plate.position ?? "center center"}`, "important");
  artEl.style.setProperty("background-size", `100% 100%, ${plate.size ?? "cover"}`, "important");
  artEl.style.setProperty("background-repeat", "no-repeat", "important");
  artEl.style.setProperty("opacity", "1", "important");
  artEl.style.setProperty("mix-blend-mode", "normal", "important");
  artEl.style.setProperty(
    "filter",
    plate.filter ?? (band.index >= 12 ? "saturate(1.04) contrast(1.02) brightness(1.02)" : "saturate(1.12) contrast(1.05) brightness(1.03)"),
    "important"
  );
};

const STARTUP_TEXTURE_KEYS: AssetKey[] = [
  "trainGeneratedN700S",
  "trainGeneratedN700A",
  "trainGeneratedDoctor",
  "trainGenerated500"
];

const loadGeneratedTextures = async (): Promise<GeneratedTextures> => {
  const loaded: GeneratedTextures = {};
  await Promise.all(STARTUP_TEXTURE_KEYS.map(async (key) => loadGeneratedTextureKey(key, loaded)));
  return loaded;
};

const loadGeneratedTextureKey = async (key: AssetKey, target: GeneratedTextures): Promise<PIXI.Texture | undefined> => {
  const url = GENERATED_ASSETS[key];
  if (!url) return undefined;
  try {
    const texture = await PIXI.Assets.load(withBase(url));
    target[key] = texture;
    return texture;
  } catch {
    // Optional generated art plates may not exist until the imagegen job is run.
    return undefined;
  }
};

export const initRenderer = async (
  canvas: HTMLCanvasElement,
  lines: Line[],
  stations: Station[],
  trainTypes: TrainType[]
): Promise<RenderHandles> => {
  const mapEl = document.getElementById("map");
  if (!mapEl) throw new Error("Missing #map container");
  const artEl = document.getElementById("artLayer") as HTMLDivElement | null;

  const map = new maplibregl.Map({
    container: mapEl,
    style: LOCAL_COORDINATE_STYLE,
    center: TOKYO_STATION_CAMERA.center,
    zoom: window.innerWidth < 760 ? TOKYO_STATION_CAMERA.zoomMobile : TOKYO_STATION_CAMERA.zoomDesktop,
    pitch: TOKYO_STATION_CAMERA.pitch,
    bearing: TOKYO_STATION_CAMERA.bearing,
    attributionControl: false,
    dragPan: false,
    scrollZoom: false,
    doubleClickZoom: false,
    touchZoomRotate: false,
    keyboard: false
  });

  map.addControl(
    new maplibregl.AttributionControl({
      compact: true,
      customAttribution: "OpenStreetMap coordinates / generated art"
    })
  );

  await new Promise<void>((resolve) => {
    if (map.loaded()) resolve();
    else map.once("load", () => resolve());
  });
  styleMapForGame(map);

  const app = new PIXI.Application();
  await app.init({
    canvas,
    resizeTo: window,
    backgroundAlpha: 0,
    antialias: false,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true
  });

  const camera = new PIXI.Container();
  const world = new PIXI.Container();
  world.sortableChildren = true;
  camera.addChild(world);
  app.stage.addChild(camera);
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  const atmosphereLayer = layer(world, 0);
  const geoArtLayer = layer(world, 8, true);
  const atlasLayer = layer(world, 9, true);
  const corridorLayer = layer(world, 10);
  const districtLayer = layer(world, 12, true);
  const shadowLayer = layer(world, 20, true);
  const objectLayer = layer(world, 30, true);
  const labelLayer = layer(world, 40, true);
  const textures: GeneratedTextures = await loadGeneratedTextures();
  const pendingTextureLoads = new Set<AssetKey>();
  let requestStaticRedraw: () => void = () => undefined;
  const textureForKey = (key: AssetKey | undefined) => {
    if (!key) return undefined;
    const existing = textures[key];
    if (existing || pendingTextureLoads.has(key)) return existing;
    pendingTextureLoads.add(key);
    void loadGeneratedTextureKey(key, textures).finally(() => {
      pendingTextureLoads.delete(key);
      requestStaticRedraw();
    });
    return undefined;
  };

  drawAtmosphere(atmosphereLayer, app, textures);
  app.renderer.on("resize", () => {
    map.resize();
    atmosphereLayer.removeChildren().forEach((node) => node.destroy({ children: true }));
    drawAtmosphere(atmosphereLayer, app, textures);
    scheduleStaticRedraw(true);
  });

  let quality: Quality = "medium";
  let reducedMotion = false;
  let followTarget: string | null = null;
  let showAccuracyDebug = false;
  let latestTrains: SimTrainState[] = [];
  let trainTapHandler: ((id: string) => void) | null = null;
  let stationTapHandler: ((id: string) => void) | null = null;
  let requestedViewMode: "japan" | "corridor" | "station" = "station";
  let focusedStationId = "tokyo";
  let detailBand = getDetailBand(map.getZoom());
  const prewarmCityArt = (stationId: string, band: DetailBand) => {
    if (band.index < 10) return;
    [band.index - 1, band.index, band.index + 1]
      .filter((index) => index >= 10 && index <= 15)
      .forEach((index) => textureForKey(cityPlateKey(stationId, getDetailBandByIndex(index))));
  };
  const syncVisualLayers = (band: DetailBand) => {
    mapEl.dataset.view = band.macro;
    mapEl.dataset.detail = String(band.index);
    document.body.dataset.view = band.macro;
    document.body.dataset.detail = String(band.index);
    if (!artEl) return;
    artEl.dataset.view = band.macro;
    artEl.dataset.detail = String(band.index);
    const nearestStation = nearestStationToViewportCenter();
    const artStation =
      requestedViewMode === "station"
        ? stations.find((station) => station.id === focusedStationId) ?? nearestStation
        : nearestStation;
    const stationKey = band.index < 6 ? "corridor" : artStation?.id ?? "tokyo";
    artEl.dataset.station = stationKey;
    document.body.dataset.station = stationKey;
    const artOwnerStation = artStation?.id ?? focusedStationId;
    const artPlate = worldArtFor(artOwnerStation, band);
    artEl.dataset.art = artPlate.url;
    document.body.dataset.art = artPlate.url;
    applyWorldArt(artEl, artPlate, band);
    if (artStation) prewarmCityArt(artStation.id, band);

    // OpenMap is the coordinate source. This tiny parallax only moves the faint
    // atmospheric wash; close-up generated station plates are PIXI-projected by
    // lat/lon instead of used as screen-space geography.
    const center = map.getCenter();
    const x = clamp((center.lng - 137.7) * -52, -260, 260);
    const y = clamp((center.lat - 36.0) * 48, -210, 210);
    artEl.style.setProperty("--art-x", `${x.toFixed(1)}px`);
    artEl.style.setProperty("--art-y", `${y.toFixed(1)}px`);
  };
  const syncDetailBand = () => {
    const next = visualDetailBand();
    if (next.index !== detailBand.index) {
      detailBand = next;
    }
    syncVisualLayers(detailBand);
    return detailBand;
  };

  const applyBoardTransform = () => {
    camera.scale.set(1);
    camera.position.set(0, 0);
    syncDetailBand();
  };

  const zoomAt = (screen: PIXI.Point, nextZoom: number) => {
    const clamped = clamp(nextZoom, ZOOM_MIN, ZOOM_MAX);
    if (Math.abs(clamped - map.getZoom()) < 0.002) return;
    const around = map.unproject([screen.x, screen.y]);
    map.stop();
    map.zoomTo(clamped, { around, duration: reducedMotion ? 0 : 80 } as maplibregl.AnimationOptions & { around: maplibregl.LngLatLike });
  };

  const panBy = (dx: number, dy: number) => {
    map.panBy([-dx, -dy], { duration: 0 });
  };

  const resetView = () => {
    focusStation("tokyo");
  };

  const setViewMode = (mode: "japan" | "corridor" | "station") => {
    requestedViewMode = mode;
    if (mode === "japan") {
      map.easeTo({ center: [137.7, 36.0], zoom: window.innerWidth < 760 ? 4.55 : 4.85, pitch: 51, bearing: -18, duration: reducedMotion ? 0 : 420 });
      return;
    }
    if (mode === "corridor") {
      map.easeTo({ center: [137.52, 35.45], zoom: window.innerWidth < 760 ? 6.0 : 6.35, pitch: 52, bearing: -18, duration: reducedMotion ? 0 : 480 });
      return;
    }
    const focus = nearestStationToViewportCenter() ?? stations.find((station) => station.id === "tokyo") ?? stations[0];
    if (focus) focusStation(focus.id);
  };

  const focusStation = (id: string) => {
    const station = stations.find((candidate) => candidate.id === id) ?? stations[0];
    if (!station) return;
    requestedViewMode = "station";
    focusedStationId = station.id;
    map.easeTo({
      center: [station.lon, station.lat],
      zoom: window.innerWidth < 760 ? TOKYO_STATION_CAMERA.zoomMobile : TOKYO_STATION_CAMERA.zoomDesktop,
      pitch: TOKYO_STATION_CAMERA.pitch,
      bearing: TOKYO_STATION_CAMERA.bearing,
      duration: reducedMotion ? 0 : 520
    });
  };

  const toScreen = (lat: number, lon: number) => {
    const p = map.project([lon, lat]);
    return new PIXI.Point(p.x, p.y);
  };

  const nearestStationToViewportCenter = (): Station | null => {
    const cx = app?.screen.width ? app.screen.width / 2 : window.innerWidth / 2;
    const cy = app?.screen.height ? app.screen.height / 2 : window.innerHeight / 2;
    let best: Station | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    stations.forEach((station) => {
      const p = toScreen(station.lat, station.lon);
      const dist = Math.hypot(p.x - cx, p.y - cy);
      if (dist < bestDist) {
        bestDist = dist;
        best = station;
      }
    });
    return best;
  };
  syncVisualLayers(detailBand);

  const visualDetailBand = () => {
    const tokyo = stations.find((station) => station.id === "tokyo") ?? stations[0];
    const osaka = stations.find((station) => station.id === "osaka") ?? stations[stations.length - 1];
    if (!tokyo || !osaka) return getDetailBand(map.getZoom());
    const a = toScreen(tokyo.lat, tokyo.lon);
    const b = toScreen(osaka.lat, osaka.lon);
    const corridorSpan = Math.hypot(a.x - b.x, a.y - b.y);
    // LOD is based on actual on-screen scale, not raw MapLibre zoom. With a
    // pitched map the numeric zoom can be high while the user still sees all of
    // Japan; screen-span gating prevents close-up city/station art from leaking
    // into national or regional views.
    const visualIndex = Math.floor((Math.log2(Math.max(corridorSpan, 1)) - 8.3) * 4.2);
    const zoomIndex = getDetailBand(map.getZoom()).index;
    if (requestedViewMode === "station") {
      // Station mode controls where the camera is centered, not which artwork is
      // forced forever. The zoom slider must be able to travel all 16 authored
      // LODs; otherwise zooming out from Tokyo keeps scaling one close plate.
      return getDetailBandByIndex(clamp(zoomIndex, 0, 15));
    }
    return getDetailBandByIndex(clamp(Math.min(visualIndex, zoomIndex), 0, 15));
  };

  const stationSprites = new Map<string, PIXI.Container>();
  const stationItems: StationSceneItem[] = stations.map((station, idx) => {
    const district = buildCityDistrict(station.id, idx);
    districtLayer.addChild(district);

    const node = buildStationSprite(station.id, textures);
    node.eventMode = "static";
    node.cursor = "pointer";
    node.on("pointertap", () => stationTapHandler?.(station.id));
    objectLayer.addChild(node);
    stationSprites.set(station.id, node);

    const label = buildLabel(station.name_en, idx);
    labelLayer.addChild(label);

    const landmark = buildLandmark(station.id, textures);
    if (landmark) objectLayer.addChild(landmark);

    return { station, district, node, label, landmark };
  });

  const trainSprites = new Map<string, PIXI.Container>();
  const trainShadows = new Map<string, PIXI.Graphics>();
  const prevTrainPos = new Map<string, PIXI.Point>();
  const displayTrainPos = new Map<string, PIXI.Point>();
  const displayTrainFacing = new Map<string, 1 | -1>();
  const displayTrainRotation = new Map<string, number>();
  const livery = new Map(trainTypes.map((t) => [t.id, t.livery_key]));

  const positionStationItems = (band = syncDetailBand()) => {
    const artProjection = !showAccuracyDebug;
    const artSpec = artRouteSpecFor(band);
    stationItems.forEach(({ station, district, node, label, landmark }) => {
      const artT = artSpec.labelT?.[station.id] ?? artSpec.stationT[station.id];
      const artPose = artProjection && Number.isFinite(artT)
        ? sampleArtRoute(app, band, artT)
        : null;
      const pos = artPose?.point ?? toScreen(station.lat, station.lon);
      district.position.set(pos.x, pos.y + 12);
      district.scale.set(clamp(0.44 + band.cityIntensity * 0.82, 0.42, 1.28));
      district.zIndex = pos.y - 18;
      district.visible = false;

      node.position.set(pos.x, pos.y);
      node.scale.set(stationScaleForBand(band, station.id));
      node.zIndex = pos.y + 20;
      // Generated plates already contain station architecture. Extra station
      // sprites were the main "pasted on" mismatch in close zooms, so visitor
      // mode keeps only readable labels once the authored art has enough detail.
      node.visible = band.index >= 5 && band.index <= 9;
      setStationLod(node, band);

      const offset = labelOffset(station.id);
      label.position.set(pos.x + offset.x, pos.y + offset.y);
      label.scale.set(band.labelScale);
      const showGeneratedLabel =
        !artProjection ||
        band.index < 12 ||
        station.id === focusedStationId ||
        (band.index <= 12 && station.id === "yokohama");
      label.visible = band.index >= 2 && showGeneratedLabel && Boolean(pos);
      label.zIndex = pos.y + 70;

      if (landmark) {
        const landmarkPos = landmarkOffset(station.id);
        landmark.position.set(pos.x + landmarkPos.x, pos.y + landmarkPos.y);
        landmark.zIndex = landmark.position.y + 35;
        landmark.visible = false;
        landmark.scale.set(clamp(0.44 + band.cityIntensity * 0.52, 0.42, 0.96));
      }
    });
  };

  const redrawStaticScene = () => {
    geoArtLayer.removeChildren().forEach((node) => node.destroy({ children: true }));
    atlasLayer.removeChildren().forEach((node) => node.destroy({ children: true }));
    corridorLayer.removeChildren().forEach((node) => node.destroy({ children: true }));
    const band = syncDetailBand();
    // Generated city art is owned by the CSS art layer. Drawing projected city
    // plates in Pixi creates the semi-transparent mismatch rectangles seen in
    // close station view, so the rail layer now renders only operational vectors.
    if (showAccuracyDebug) {
      drawWorldAtlas(atlasLayer, lines, stations, toScreen, quality, band, app, textures);
      drawSecondaryLines(corridorLayer, toScreen, quality, band);
      drawCorridor(corridorLayer, lines, toScreen, quality, band, textures);
      drawStationApproaches(corridorLayer, lines, stations, toScreen, quality, band);
      drawMapAccuracyDebug(corridorLayer, lines, stations, toScreen, band);
    } else {
      drawGeneratedSceneRoute(corridorLayer, app, band, quality);
    }
    positionStationItems(band);
  };

  let staticRedrawPending = false;
  let lastStaticRedraw = 0;
  const scheduleStaticRedraw = (immediate = false) => {
    syncDetailBand();
    if (immediate) {
      staticRedrawPending = false;
      lastStaticRedraw = performance.now();
      redrawStaticScene();
      updateTrains(latestTrains);
      return;
    }
    if (staticRedrawPending) return;
    staticRedrawPending = true;
    const elapsed = performance.now() - lastStaticRedraw;
    const delay = elapsed > 90 ? 0 : 90 - elapsed;
    window.setTimeout(() => {
      staticRedrawPending = false;
      lastStaticRedraw = performance.now();
      redrawStaticScene();
      updateTrains(latestTrains);
    }, delay);
  };
  requestStaticRedraw = () => scheduleStaticRedraw(true);

  const updateTrains = (trains: SimTrainState[]) => {
    const existing = new Set(trainSprites.keys());
    const stationSlots = new Map<string, number>();
    const stationAlongSlots = new Map<string, number>();
    trains.forEach((train) => {
      const band = syncDetailBand();
      const rawPos = toScreen(train.lat, train.lon);
      const line = lines.find((candidate) => candidate.id === train.lineId) ?? lines[0];
      const artLineProgress = line ? routeProgressFromLatLon(line, train.lat, train.lon) : 0;
      const hiddenOutsideCloseStation =
        !showAccuracyDebug &&
        band.index >= 12 &&
        focusedStationId === "tokyo" &&
        artLineProgress > 0.17;
      if (hiddenOutsideCloseStation) {
        const hiddenSprite = trainSprites.get(train.id);
        const hiddenShadow = trainShadows.get(train.id);
        if (hiddenSprite) hiddenSprite.visible = false;
        if (hiddenShadow) hiddenShadow.visible = false;
        existing.delete(train.id);
        return;
      }
      const pose = !showAccuracyDebug && line
        ? artTrainPose(app, band, line, train, focusedStationId)
        : line
          ? routePoseAtScreen(line, rawPos, toScreen)
          : null;
      const pos = pose?.trackPoint ?? rawPos;
      const tangent = pose?.tangent ?? new PIXI.Point(1, 0);
      const lane = train.status === "moving" ? movingLane(train.id, band) : stationLane(train, stationSlots, band);
      const laneX = -tangent.y * lane;
      const laneY = tangent.x * lane;

      let shadow = trainShadows.get(train.id);
      if (!shadow) {
        shadow = new PIXI.Graphics();
        shadow.ellipse(0, 0, 42, 8).fill({ color: PALETTE.ink, alpha: 0.36 });
        shadowLayer.addChild(shadow);
        trainShadows.set(train.id, shadow);
      }
      shadow.visible = true;
      shadow.position.set(pos.x + laneX + 7, pos.y + laneY + 12);
      shadow.zIndex = pos.y + 8;

      let sprite = trainSprites.get(train.id);
      if (!sprite) {
        sprite = buildTrainSprite(train.trainTypeId, livery.get(train.trainTypeId) ?? "white-blue", textures);
        sprite.eventMode = "static";
        sprite.cursor = "pointer";
        sprite.on("pointertap", () => trainTapHandler?.(train.id));
        objectLayer.addChild(sprite);
        trainSprites.set(train.id, sprite);
      }
      sprite.visible = true;

      const alongDwell = train.status === "moving" ? 0 : stationSlotAlong(train, stationAlongSlots, band);
      const railSeatOffset = band.index < 8 ? -1.2 : band.index < 13 ? -1.6 : -0.7;
      const target = new PIXI.Point(
        pos.x + laneX + tangent.x * alongDwell,
        pos.y + laneY + tangent.y * alongDwell + railSeatOffset
      );
      const display = displayTrainPos.get(train.id)?.clone() ?? target.clone();
      const dist = Math.hypot(target.x - display.x, target.y - display.y);
      const smoothing = reducedMotion || dist > 240 ? 1 : 0.16;
      display.x += (target.x - display.x) * smoothing;
      display.y += (target.y - display.y) * smoothing;
      displayTrainPos.set(train.id, display);

      setTrainLod(sprite, band);
      const modelBoost = train.trainTypeId === "series500" ? 1.06 : train.trainTypeId === "doctor923" ? 0.98 : 1;
      const scale = trainScaleForBand(band) * modelBoost;
      const prev = prevTrainPos.get(train.id);
      let facing = displayTrainFacing.get(train.id) ?? 1;
      if (prev && train.status === "moving") {
        const dx = target.x - prev.x;
        if (Math.abs(dx) > 0.45) {
          facing = dx >= 0 ? 1 : -1;
          displayTrainFacing.set(train.id, facing);
        }
      }
      const routeAngle = Math.atan2(tangent.y, tangent.x);
      const desiredRotation = Number.isFinite(routeAngle) ? clamp(routeAngle * 0.32, -0.22, 0.22) : 0;
      const previousRotation = displayTrainRotation.get(train.id) ?? sprite.rotation;
      const rotationBlend = reducedMotion ? 1 : train.status === "moving" ? 0.18 : 0.08;
      const nextRotation = previousRotation + normalizeAngle(desiredRotation - previousRotation) * rotationBlend;
      displayTrainRotation.set(train.id, nextRotation);
      sprite.rotation = nextRotation;
      sprite.scale.set(scale * facing, scale);
      sprite.position.set(display.x, display.y);
      shadow.position.set(display.x + 7, display.y + 19);
      const shadowX = band.index < 4 ? 0.46 : band.index < 8 ? 0.82 : scale * 3.2;
      const shadowY = band.index < 4 ? 0.42 : band.index < 8 ? 0.68 : scale * 1.7;
      shadow.scale.set(shadowX, shadowY);
      shadow.alpha = band.index < 4 ? 0.36 : band.index >= 12 ? 0.24 : 0.44;
      sprite.zIndex = display.y + 45;
      prevTrainPos.set(train.id, target);
      existing.delete(train.id);
    });

    existing.forEach((id) => {
      trainSprites.get(id)?.destroy({ children: true });
      trainShadows.get(id)?.destroy();
      trainSprites.delete(id);
      trainShadows.delete(id);
      prevTrainPos.delete(id);
      displayTrainPos.delete(id);
      displayTrainFacing.delete(id);
      displayTrainRotation.delete(id);
    });
  };

  const routeTangentAt = (train: SimTrainState, pos: PIXI.Point) => {
    const line = lines.find((candidate) => candidate.id === train.lineId) ?? lines[0];
    if (!line || line.polyline.length < 2) return new PIXI.Point(1, 0);
    return routePoseAtScreen(line, pos, toScreen)?.tangent ?? new PIXI.Point(1, 0);
  };

  const update = (trains: SimTrainState[]) => {
    latestTrains = trains;
    updateTrains(trains);

    if (followTarget) {
      const target = trains.find((train) => train.id === followTarget);
      if (target) {
        const targetPoint = displayTrainPos.get(target.id) ?? toScreen(target.lat, target.lon);
        const desired = new PIXI.Point(
          app.screen.width / 2 - targetPoint.x,
          app.screen.height / 2 - targetPoint.y
        );
        const amount = reducedMotion ? 1 : 0.06;
        map.panBy([-desired.x * amount, -desired.y * amount], { duration: 0 });
      }
    }
  };

  map.on("move", () => {
    const before = detailBand.index;
    const band = syncDetailBand();
    positionStationItems(band);
    updateTrains(latestTrains);
    // Avoid rebuilding expensive static Pixi layers on every wheel tick. CSS art
    // and live transforms update immediately; static rail detail is rebuilt once
    // MapLibre finishes zooming.
    if (before !== band.index) syncVisualLayers(band);
  });
  map.on("moveend", () => {
    scheduleStaticRedraw(true);
  });
  map.on("zoom", () => {
    const before = detailBand.index;
    const band = syncDetailBand();
    positionStationItems(band);
    updateTrains(latestTrains);
    // Rebuild heavyweight static layers only on zoomend; this prevents wheel
    // zoom from queueing dozens of atlas/corridor redraws and crashing tabs.
    if (before !== band.index) syncVisualLayers(band);
  });
  map.on("zoomend", () => {
    scheduleStaticRedraw(true);
  });

  redrawStaticScene();
  applyBoardTransform();
  setupInteraction(app, {
    panBy,
    zoomAt,
    getZoom: () => map.getZoom()
  });

  return {
    app,
    camera,
    trainSprites,
    stationSprites,
    world,
    toScreen,
    setFollowTarget: (id) => {
      followTarget = id;
    },
    setReducedMotion: (enabled) => {
      reducedMotion = enabled;
    },
    setQuality: (nextQuality) => {
      quality = nextQuality;
      scheduleStaticRedraw(true);
    },
    setAccuracyDebug: (enabled) => {
      showAccuracyDebug = enabled;
      document.body.classList.toggle("accuracy-debug", enabled);
      scheduleStaticRedraw(true);
    },
    zoomBy: (factor) => {
      zoomAt(new PIXI.Point(app.screen.width / 2, app.screen.height / 2), map.getZoom() + Math.log2(factor) * 1.2);
    },
    setZoom: (zoom) => {
      zoomAt(new PIXI.Point(app.screen.width / 2, app.screen.height / 2), zoom);
    },
    resetView,
    setViewMode,
    focusStation,
    setTrainTapHandler: (handler) => {
      trainTapHandler = handler;
    },
    setStationTapHandler: (handler) => {
      stationTapHandler = handler;
    },
    update,
    getCameraCenter: () => new PIXI.Point(app.screen.width / 2, app.screen.height / 2),
    getZoom: () => map.getZoom(),
    getZoomRange: () => ({ min: ZOOM_MIN, max: ZOOM_MAX }),
    getStats: () => ({
      trains: trainSprites.size,
      trackSprites: lines.length,
      landmarks: stationItems.filter((item) => item.landmark).length,
      detailLevel: syncDetailBand().index + 1,
      detailIndex: syncDetailBand().index,
      view: syncDetailBand().macro,
      routeMode: syncDetailBand().routeMode,
      trainMode: syncDetailBand().trainMode,
      platformDetail: syncDetailBand().platformDetail,
      loadedCityArt: Object.keys(textures).filter((key) => key.startsWith("city")).length,
      pendingCityArt: Array.from(pendingTextureLoads).filter((key) => key.startsWith("city")).length,
      accuracyDebug: showAccuracyDebug
    })
  };
};

const styleMapForGame = (map: maplibregl.Map) => {
  const style = map.getStyle();
  style.layers
    .filter((layer) => layer.type === "symbol")
    .forEach((layer) => {
      map.setLayoutProperty(layer.id, "visibility", "none");
    });

  style.layers.forEach((layer) => {
    const id = layer.id.toLowerCase();
    if (layer.type === "background") {
      map.setPaintProperty(layer.id, "background-color", "#071821");
    }
    if (layer.type === "fill") {
      map.setPaintProperty(layer.id, "fill-color", "#35553f");
      map.setPaintProperty(layer.id, "fill-opacity", 0.62);
    }
    if (layer.type === "fill" && /water|ocean|sea|river|lake/i.test(id)) {
      map.setPaintProperty(layer.id, "fill-color", "#0b5068");
      map.setPaintProperty(layer.id, "fill-opacity", 0.74);
    }
    if (layer.type === "fill" && /park|wood|forest|grass|green/i.test(id)) {
      map.setPaintProperty(layer.id, "fill-color", "#4f7d49");
      map.setPaintProperty(layer.id, "fill-opacity", 0.58);
    }
    if (layer.type === "fill" && /building/i.test(id)) {
      map.setPaintProperty(layer.id, "fill-color", "#747d75");
      map.setPaintProperty(layer.id, "fill-opacity", 0.28);
    }
    if (layer.type === "line" && /road|street|highway|path|track/i.test(id)) {
      map.setPaintProperty(layer.id, "line-opacity", 0.14);
      map.setPaintProperty(layer.id, "line-color", "#a99d78");
      if (id.includes("major") || id.includes("primary") || id.includes("highway")) {
        map.setPaintProperty(layer.id, "line-color", "#d2b96d");
        map.setPaintProperty(layer.id, "line-opacity", 0.25);
      }
    }
    if (layer.type === "line" && /rail|transit|transport/i.test(id)) {
      map.setPaintProperty(layer.id, "line-opacity", 0.22);
      map.setPaintProperty(layer.id, "line-color", "#a6b7b4");
    }
    if (layer.type === "line" && /water|river|stream/i.test(id)) {
      map.setPaintProperty(layer.id, "line-opacity", 0.3);
      map.setPaintProperty(layer.id, "line-color", "#2b9ab2");
    }
  });

  // Keep OpenFreeMap as flat 2D source-of-truth. Fill extrusions looked nice
  // in isolation but cratered FPS during zoom and made the generated station
  // sprites feel pasted on top of a different rendering system.
};

const layer = (parent: PIXI.Container, zIndex: number, sortable = false) => {
  const item = new PIXI.Container();
  item.zIndex = zIndex;
  item.sortableChildren = sortable;
  parent.addChild(item);
  return item;
};

const drawAtmosphere = (
  layer: PIXI.Container,
  app: PIXI.Application,
  textures: GeneratedTextures
) => {
  const oceanTexture = textures.ocean;
  if (oceanTexture) {
    const ocean = new PIXI.TilingSprite({
      texture: oceanTexture,
      width: app.screen.width,
      height: app.screen.height
    });
    ocean.alpha = 0.11;
    ocean.tileScale.set(0.62);
    ocean.blendMode = "screen";
    layer.addChild(ocean);
  }

  const vignette = new PIXI.Graphics();
  vignette.rect(0, 0, app.screen.width, app.screen.height).fill({
    color: 0x061018,
    alpha: 0.08
  });
  layer.addChild(vignette);

  const horizon = new PIXI.Graphics();
  horizon.rect(0, 0, app.screen.width, 180).fill({
    color: 0x8fbea1,
    alpha: 0.05
  });
  horizon.rect(0, app.screen.height - 160, app.screen.width, 160).fill({
    color: 0x061018,
    alpha: 0.08
  });
  layer.addChild(horizon);
};


const drawSecondaryLines = (
  layer: PIXI.Container,
  toScreen: (lat: number, lon: number) => PIXI.Point,
  quality: Quality,
  band: DetailBand
) => {
  if (band.index < 10) return;
  SECONDARY_LINES.filter((line) => band.index >= line.minBand).forEach((line) => {
    const points = line.points.map(([lat, lon]) => toScreen(lat, lon));
    if (!points.some((p) => p.x > -160 && p.x < window.innerWidth + 160 && p.y > -160 && p.y < window.innerHeight + 160)) return;
    const width = band.index >= 13 ? 2.6 : 1.5;
    drawLine(layer, points, width + 3, PALETTE.ink, 0.26, 3);
    drawLine(layer, points, width, line.color, 0.48, 0);
    drawLine(layer, points, Math.max(0.8, width * 0.28), 0xf7f1cf, 0.42, -1);
    if (quality === "high" && band.index >= 14) drawSleepers(layer, points, 84, 0.32);
    const mid = points[Math.floor(points.length / 2)];
    if (mid && band.index >= 12) {
      const label = buildRouteLabel(line.name, mid.x + 16, mid.y - 20);
      label.scale.set(0.74);
      layer.addChild(label);
    }
  });
};

const drawGeoCityPlates = (
  layer: PIXI.Container,
  stations: Station[],
  toScreen: (lat: number, lon: number) => PIXI.Point,
  band: DetailBand,
  textures: GeneratedTextures,
  textureForKey: (key: AssetKey | undefined) => PIXI.Texture | undefined
) => {
  if (band.cityPlateAlpha <= 0) return;
  const viewportCenter = new PIXI.Point(window.innerWidth / 2, window.innerHeight / 2);
  const candidates = stations
    .map((station, index) => {
      const center = toScreen(station.lat, station.lon);
      return { station, index, center, dist: Math.hypot(center.x - viewportCenter.x, center.y - viewportCenter.y) };
    })
    .filter(({ center }) =>
      center.x > -window.innerWidth * 0.35 &&
      center.x < window.innerWidth * 1.35 &&
      center.y > -window.innerHeight * 0.45 &&
      center.y < window.innerHeight * 1.45
    )
    .sort((a, b) => a.dist - b.dist);
  const focused = candidates.slice(0, 1);

  focused.forEach(({ station, index, center }, order) => {
    const key = cityPlateKey(station.id, band);
    const texture = textureForKey(key) ?? (key ? textures[key] : undefined);
    if (!texture) return;

    const span = cityPlateSpan(station.id, band);
    const west = toScreen(station.lat, station.lon - span.lon / 2);
    const east = toScreen(station.lat, station.lon + span.lon / 2);
    const north = toScreen(station.lat + span.lat / 2, station.lon);
    const south = toScreen(station.lat - span.lat / 2, station.lon);
    const screenWidth = Math.hypot(east.x - west.x, east.y - west.y);
    const screenHeight = Math.hypot(south.x - north.x, south.y - north.y);

    const plate = new PIXI.Sprite(texture);
    plate.anchor.set(0.5);
    plate.position.set(center.x, center.y);
    plate.width = clamp(screenWidth * cityPlateWidthBoost(station.id, band), 520, 1900);
    plate.scale.y = plate.scale.x;
    const naturalHeight = Math.max(1, texture.height * plate.scale.x);
    const wantedHeight = clamp(screenHeight * cityPlateHeightBoost(station.id, band), 360, 1500);
    plate.scale.y *= wantedHeight / naturalHeight;
    plate.rotation = Math.atan2(east.y - west.y, east.x - west.x) * 0.08;
    plate.alpha = band.cityPlateAlpha;
    plate.zIndex = center.y - 260 + index;

    const backing = new PIXI.Graphics();
    const bw = plate.width * 0.94;
    const bh = texture.height * plate.scale.y * 0.9;
    backing.position.copyFrom(plate.position);
    backing.rotation = plate.rotation;
    backing.roundRect(-bw / 2, -bh / 2, bw, bh, 24).fill({ color: PALETTE.ink, alpha: 0.18 });
    backing.zIndex = plate.zIndex - 1;

    layer.addChild(backing, plate);
  });
};

const cityPlateTexture = (stationId: string, band: DetailBand, textures: GeneratedTextures) => {
  const key = cityPlateKey(stationId, band);
  return key ? textures[key] : undefined;
};

const cityPlateKey = (stationId: string, band: DetailBand): AssetKey | undefined => {
  const stationKey = stationId === "yokohama" ? "Yokohama" : capitalizeStationId(stationId);
  const level =
    band.index >= 15 ? "Z15" : band.index >= 14 ? "Z14" : band.index >= 13 ? "Z13" : band.index >= 12 ? "Z12" : band.index >= 11 ? "Z11" : "Z10";
  return `city${stationKey}${level}`;
};

const capitalizeStationId = (stationId: string) => stationId.charAt(0).toUpperCase() + stationId.slice(1);

const cityPlateSpan = (stationId: string, band: DetailBand) => {
  const bounds = stationArtBounds(stationId);
  const scale = band.index >= 15 ? 0.72 : band.index >= 14 ? 1.05 : band.index >= 13 ? 1.48 : 1.9;
  return {
    lat: bounds.lat * scale,
    lon: bounds.lon * scale
  };
};

const cityPlateWidthBoost = (stationId: string, band: DetailBand) => {
  const terminal = stationId === "tokyo" || stationId === "osaka";
  return (terminal ? 1.14 : 1) * (band.index >= 15 ? 0.96 : band.index >= 14 ? 1.02 : band.index >= 12 ? 1.05 : 0.98);
};

const cityPlateHeightBoost = (stationId: string, band: DetailBand) => {
  const terminal = stationId === "tokyo" || stationId === "osaka";
  return (terminal ? 1.1 : 1) * (band.index >= 15 ? 0.98 : band.index >= 12 ? 1.05 : 1);
};

const drawCorridor = (
  layer: PIXI.Container,
  lines: Line[],
  toScreen: (lat: number, lon: number) => PIXI.Point,
  quality: Quality,
  band: DetailBand,
  textures: GeneratedTextures
) => {
  lines.forEach((line) => {
    const points = line.polyline.map(([lat, lon]) => toScreen(lat, lon));
    const visible = points.some((p) => p.x > -200 && p.x < window.innerWidth + 200 && p.y > -200 && p.y < window.innerHeight + 200);
    if (!visible) return;

    drawShinkansenViaduct(layer, points, quality, band);
    drawGeneratedRailSegments(layer, points, band, textures);

    const mid = points[Math.floor(points.length / 2)];
    if (mid && band.index >= 6 && band.index <= 11) {
      const label = buildRouteLabel(line.name_en, mid.x + 28, mid.y - 34);
      label.scale.set(clamp(0.76 + band.cityIntensity * 0.38, 0.76, 1.08));
      layer.addChild(label);
    }
  });
};

const drawGeneratedRailSegments = (
  layer: PIXI.Container,
  points: PIXI.Point[],
  band: DetailBand,
  textures: GeneratedTextures
) => {
  // Legacy rail sprite sheets do not match the current coordinate-first visual
  // system; close rails are drawn procedurally so they stay attached to OSM.
  void layer;
  void points;
  void band;
  void textures;
};

const routePoseAtScreen = (
  line: Line,
  pos: PIXI.Point,
  toScreen: (lat: number, lon: number) => PIXI.Point
) => {
  let best:
    | {
        trackPoint: PIXI.Point;
        tangent: PIXI.Point;
        normal: PIXI.Point;
        distance: number;
      }
    | null = null;
  const points = line.polyline.map(([lat, lon]) => toScreen(lat, lon));
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1) continue;
    const t = clamp(((pos.x - a.x) * dx + (pos.y - a.y) * dy) / len2, 0, 1);
    const trackPoint = new PIXI.Point(a.x + dx * t, a.y + dy * t);
    const distance = Math.hypot(pos.x - trackPoint.x, pos.y - trackPoint.y);
    const invLen = 1 / Math.sqrt(len2);
    const tangent = new PIXI.Point(dx * invLen, dy * invLen);
    const normal = new PIXI.Point(-tangent.y, tangent.x);
    if (!best || distance < best.distance) {
      best = { trackPoint, tangent, normal, distance };
    }
  }
  return best;
};

const artViewportBounds = (app: PIXI.Application, band: DetailBand) => {
  const mobile = app.screen.width < 900;
  const leftPanel = mobile ? 18 : Math.min(360, app.screen.width * 0.19);
  const rightPanel = mobile ? 18 : Math.min(430, app.screen.width * 0.22);
  const topChrome = mobile ? 118 : 74;
  const bottomChrome = mobile ? 108 : 72;
  const margin = band.index >= 12 ? 24 : 10;
  return {
    left: leftPanel + margin,
    right: Math.max(leftPanel + 320, app.screen.width - rightPanel - margin),
    top: topChrome + margin,
    bottom: Math.max(topChrome + 260, app.screen.height - bottomChrome - margin)
  };
};

const artRoutePoints = (app: PIXI.Application, band: DetailBand) => {
  const spec = artRouteSpecFor(band);
  const bounds = artViewportBounds(app, band);
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  return spec.points.map(([x, y]) => new PIXI.Point(bounds.left + x * width, bounds.top + y * height));
};

const samplePolyline = (points: PIXI.Point[], t: number) => {
  if (points.length === 0) {
    const fallback = new PIXI.Point(0, 0);
    return { point: fallback, trackPoint: fallback, tangent: new PIXI.Point(1, 0), normal: new PIXI.Point(0, 1), distance: 0 };
  }
  if (points.length === 1) {
    const p = points[0].clone();
    return { point: p, trackPoint: p, tangent: new PIXI.Point(1, 0), normal: new PIXI.Point(0, 1), distance: 0 };
  }

  const clampedT = clamp(t, 0, 1);
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const length = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    lengths.push(length);
    total += length;
  }
  const target = total * clampedT;
  let acc = 0;
  for (let i = 0; i < lengths.length; i += 1) {
    const segment = lengths[i];
    if (target <= acc + segment || i === lengths.length - 1) {
      const a = points[i];
      const b = points[i + 1];
      const localT = segment <= 0 ? 0 : (target - acc) / segment;
      const x = a.x + (b.x - a.x) * localT;
      const y = a.y + (b.y - a.y) * localT;
      const inv = 1 / Math.max(1, segment);
      const tangent = new PIXI.Point((b.x - a.x) * inv, (b.y - a.y) * inv);
      const point = new PIXI.Point(x, y);
      return {
        point,
        trackPoint: point,
        tangent,
        normal: new PIXI.Point(-tangent.y, tangent.x),
        distance: 0
      };
    }
    acc += segment;
  }
  const last = points[points.length - 1].clone();
  return { point: last, trackPoint: last, tangent: new PIXI.Point(1, 0), normal: new PIXI.Point(0, 1), distance: 0 };
};

const sampleArtRoute = (app: PIXI.Application, band: DetailBand, t: number) => {
  return samplePolyline(artRoutePoints(app, band), t);
};

const routeProgressFromLatLon = (line: Line, lat: number, lon: number) => {
  if (line.polyline.length < 2) return 0;
  let total = 0;
  const lengths: number[] = [];
  for (let i = 0; i < line.polyline.length - 1; i += 1) {
    const [aLat, aLon] = line.polyline[i];
    const [bLat, bLon] = line.polyline[i + 1];
    const length = Math.hypot(bLat - aLat, bLon - aLon);
    lengths.push(length);
    total += length;
  }

  let bestProgress = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  let acc = 0;
  for (let i = 0; i < line.polyline.length - 1; i += 1) {
    const [aLat, aLon] = line.polyline[i];
    const [bLat, bLon] = line.polyline[i + 1];
    const dLat = bLat - aLat;
    const dLon = bLon - aLon;
    const len2 = dLat * dLat + dLon * dLon;
    if (len2 < 1e-12) continue;
    const t = clamp(((lat - aLat) * dLat + (lon - aLon) * dLon) / len2, 0, 1);
    const pLat = aLat + dLat * t;
    const pLon = aLon + dLon * t;
    const distance = Math.hypot(lat - pLat, lon - pLon);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestProgress = total > 0 ? (acc + lengths[i] * t) / total : 0;
    }
    acc += lengths[i];
  }
  return clamp(bestProgress, 0, 1);
};

const artTrainPose = (
  app: PIXI.Application,
  band: DetailBand,
  line: Line,
  train: SimTrainState,
  focusedStationId: string
) => {
  const lineProgress = routeProgressFromLatLon(line, train.lat, train.lon);
  const generatedRouteT =
    band.index >= 12 && focusedStationId === "tokyo"
      // Close Tokyo station art should only show the local Tokyo/Shin-Yokohama
      // approach. More distant timetable services are hidden by updateTrains.
      ? clamp(0.70 - lineProgress * 5.2, 0.12, 0.86)
      : 1 - lineProgress;
  return sampleArtRoute(app, band, generatedRouteT);
};

const drawGeneratedSceneRoute = (
  layer: PIXI.Container,
  app: PIXI.Application,
  band: DetailBand,
  quality: Quality
) => {
  const points = artRoutePoints(app, band);
  if (points.length < 2) return;

  if (band.index >= 12) {
    // The generated city image already contains the station and rails. Draw only
    // a light seat/guide so moving trains feel attached without repainting a
    // mismatched viaduct over the plate.
    const width = clamp(band.routeWidth * 0.16, 0.55, 0.95);
    drawLine(layer, points, width + 1.2, PALETTE.ink, 0.055, 2);
    drawLine(layer, points, width, 0xf2f1df, 0.085, 0);
    if (band.index <= 13) {
      drawLine(layer, offsetPolyline(points, -1.55), 0.42, PALETTE.blue, 0.07, -1);
      drawLine(layer, offsetPolyline(points, 1.55), 0.34, PALETTE.gold, 0.055, -1);
    }
    return;
  }

  const routeBand = {
    ...band,
    routeMode: band.index < 4 ? "atlas" : band.index < 8 ? "guide" : "viaduct",
    routeWidth: band.routeWidth * (band.index < 8 ? 0.85 : 0.68)
  } as DetailBand;
  drawShinkansenViaduct(layer, points, quality, routeBand);

  if (band.index >= 3 && band.index <= 10) {
    const labelPose = samplePolyline(points, band.index < 8 ? 0.48 : 0.56);
    const label = buildRouteLabel("Tokaido Shinkansen", labelPose.point.x, labelPose.point.y - 24);
    label.scale.set(clamp(0.68 + band.index * 0.025, 0.68, 0.96));
    layer.addChild(label);
  }
};

const drawStationApproaches = (
  layer: PIXI.Container,
  lines: Line[],
  stations: Station[],
  toScreen: (lat: number, lon: number) => PIXI.Point,
  quality: Quality,
  band: DetailBand
) => {
  void quality;
  if (band.platformDetail === 0 || band.routeMode === "station") return;
  const line = lines[0];
  if (!line) return;

  const g = new PIXI.Graphics();
  stations.forEach((station) => {
    const stationPoint = toScreen(station.lat, station.lon);
    const pose = routePoseAtScreen(line, stationPoint, toScreen);
    if (!pose) return;
    const p = pose.trackPoint;
    if (p.x < -260 || p.x > window.innerWidth + 260 || p.y < -260 || p.y > window.innerHeight + 260) return;
    const terminalScale = station.id === "tokyo" || station.id === "osaka" ? 1.28 : 1;
    const radiusX = (32 + band.index * 2.2) * terminalScale;
    const radiusY = 12 + band.index * 0.65;
    g.ellipse(p.x, p.y + 12, radiusX, radiusY).stroke({ width: 1.2, color: PALETTE.glow, alpha: 0.18 });
    g.circle(p.x, p.y + 2, 4.5 + band.index * 0.18).fill({ color: PALETTE.gold, alpha: 0.18 });
  });
  layer.addChild(g);
};

const drawMapAccuracyDebug = (
  layer: PIXI.Container,
  lines: Line[],
  stations: Station[],
  toScreen: (lat: number, lon: number) => PIXI.Point,
  band: DetailBand
) => {
  void band;
  const g = new PIXI.Graphics();
  lines.forEach((line) => {
    const points = line.polyline.map(([lat, lon]) => toScreen(lat, lon));
    if (points.length < 2) return;
    g.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((p) => g.lineTo(p.x, p.y));
    g.stroke({ width: 2, color: 0x59d8ff, alpha: 0.8 });
  });
  stations.forEach((station) => {
    const p = toScreen(station.lat, station.lon);
    g.circle(p.x, p.y, 7).stroke({ width: 2, color: 0xffd36f, alpha: 0.82 });
  });
  layer.addChild(g);
};

const railSpriteRotation = (dx: number, dy: number) => {
  const angle = Math.atan2(dy, dx);
  return clamp(angle * 0.24, -0.42, 0.42);
};

const normalizeAngle = (angle: number) => {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
};

const drawWorldAtlas = (
  layer: PIXI.Container,
  lines: Line[],
  stations: Station[],
  toScreen: (lat: number, lon: number) => PIXI.Point,
  quality: Quality,
  band: DetailBand,
  app: PIXI.Application,
  textures: GeneratedTextures
) => {
  void app;
  void textures;
  // Do not draw generated city plates here: they looked attractive but were not
  // geographically faithful. The OpenFreeMap layer is the source of truth.
  drawCoordinateGroundTruth(layer, lines, stations, toScreen, quality, band);
  return;
  const maxRouteLots = quality === "high" ? 85 : quality === "medium" ? 54 : 25;
  const routeGraphics = new PIXI.Graphics();

  lines.forEach((line) => {
    const points = line.polyline.map(([lat, lon]) => toScreen(lat, lon));
    const offsets = [
      { d: -28, color: 0x31a366, alpha: 0.76 },
      { d: 30, color: 0xe69b35, alpha: 0.72 },
      { d: -52, color: 0x7f5cc7, alpha: 0.54 }
    ];

    offsets.forEach(({ d, color, alpha }) => {
      const shifted = offsetPolyline(points, d);
      routeGraphics.setStrokeStyle({ width: 4, color, alpha, cap: "round", join: "round" });
      routeGraphics.moveTo(shifted[0].x, shifted[0].y + 2);
      for (let i = 1; i < shifted.length; i += 1) {
        routeGraphics.lineTo(shifted[i].x, shifted[i].y + 2);
      }
      routeGraphics.stroke();
    });

    let made = 0;
    for (let i = 0; i < points.length - 1 && made < maxRouteLots; i += 1) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      const nx = -dy / len;
      const ny = dx / len;
      const lots = Math.min(Math.floor(len / 58), maxRouteLots - made);
      for (let s = 0; s < lots; s += 1) {
        const t = (s + 0.5) / lots;
        const side = (s + i) % 2 === 0 ? 1 : -1;
        const jitter = seededNoise(i * 101 + s * 17) * 34;
        const x = p0.x + dx * t + nx * (62 * side + jitter);
        const y = p0.y + dy * t + ny * (62 * side + jitter * 0.55);
        addAtlasLot(layer, x, y, i * 131 + s * 19, quality);
        made += 1;
      }
    }
  });

  routeGraphics.zIndex = -10;
  layer.addChild(routeGraphics);

  stations.forEach((station, index) => {
    const pos = toScreen(station.lat, station.lon);
    const hub = new PIXI.Container();
    hub.position.set(pos.x, pos.y + 14);
    hub.zIndex = pos.y - 10;
    const count =
      quality === "low"
        ? 8
        : station.id === "tokyo" || station.id === "osaka"
          ? quality === "high" ? 42 : 28
          : quality === "high" ? 28 : 18;
    const radius = station.id === "tokyo" || station.id === "osaka" ? 132 : 96;

    const base = new PIXI.Graphics();
    base.poly([-radius, -24, -18, -72, radius, -28, 28, 70, -radius + 20, 52]).fill({
      color: station.id === "kyoto" ? 0x678948 : 0x466b56,
      alpha: 0.38
    });
    base.poly([-radius, -24, -18, -72, radius, -28, 28, 70, -radius + 20, 52]).stroke({
      width: 1,
      color: 0xf4f5d6,
      alpha: 0.16
    });
    hub.addChild(base);

    for (let i = 0; i < count; i += 1) {
      const angle = (i * 2.399 + index * 0.45) % (Math.PI * 2);
      const dist = 30 + seededNoise(index * 1000 + i * 29) * radius;
      const x = Math.cos(angle) * dist * 1.25;
      const y = Math.sin(angle) * dist * 0.62;
      if (Math.abs(x) < 42 && Math.abs(y) < 26) continue;
      if ((i + index) % 5 === 0) {
        addAtlasTree(hub, x, y, i + index);
      } else {
        const tall = station.id === "tokyo" || station.id === "yokohama" || station.id === "osaka";
        const width = 9 + Math.floor(seededNoise(i * 17 + index) * 12);
        const height = (tall ? 30 : 18) + Math.floor(seededNoise(i * 31 + index) * (tall ? 62 : 28));
        const colors = [0xa5adb2, 0x6d879a, 0xb98262, 0xd0b16e, 0x8192b4, 0x9bbfbd];
        addBuilding(hub, x, y, width, height, colors[(i + index) % colors.length], i + index);
      }
    }

    addRoadGrid(hub, radius, index);
    layer.addChild(hub);
  });
};

const addAtlasLot = (
  parent: PIXI.Container,
  x: number,
  y: number,
  seed: number,
  quality: Quality
) => {
  const lot = new PIXI.Container();
  lot.position.set(x, y);
  lot.zIndex = y;
  const ground = new PIXI.Graphics();
  ground.poly([-28, -8, 5, -22, 34, -7, 2, 13]).fill({
    color: seed % 4 === 0 ? 0x567e46 : 0x495c58,
    alpha: 0.56
  });
  lot.addChild(ground);

  if (seed % 7 === 0) {
    addMountain(lot, 0, 8, seed);
  } else if (seed % 5 === 0) {
    for (let i = 0; i < (quality === "high" ? 5 : 3); i += 1) {
      addAtlasTree(lot, -18 + i * 10, -2 + ((seed + i) % 3) * 7, seed + i);
    }
  } else {
    const colors = [0xb3b9b5, 0x8aa0b3, 0xa5705d, 0xccb165, 0x6e8f80];
    addBuilding(lot, -8, 7, 12 + (seed % 8), 20 + (seed % 30), colors[seed % colors.length], seed);
    if (quality !== "low" && seed % 3 === 0) {
      addBuilding(lot, 10, 9, 10, 14 + (seed % 18), colors[(seed + 2) % colors.length], seed + 1);
    }
  }

  parent.addChild(lot);
};

const addRoadGrid = (parent: PIXI.Container, radius: number, seed: number) => {
  const g = new PIXI.Graphics();
  g.setStrokeStyle({ width: 3, color: 0x303b3e, alpha: 0.8, cap: "round" });
  for (let i = -2; i <= 2; i += 1) {
    const y = i * 22 + (seed % 2) * 6;
    g.moveTo(-radius + 18, y);
    g.lineTo(radius - 22, y - 35);
  }
  for (let i = -2; i <= 2; i += 1) {
    const x = i * 38;
    g.moveTo(x, -66);
    g.lineTo(x + 30, 62);
  }
  g.stroke();
  parent.addChildAt(g, 1);
};

const addAtlasTree = (parent: PIXI.Container, x: number, y: number, seed: number) => {
  const g = new PIXI.Graphics();
  g.rect(x - 1, y - 8, 3, 9).fill(0x5e3d24);
  const green = seed % 4 === 0 ? 0xe07b5b : seed % 4 === 1 ? 0x75c84f : seed % 4 === 2 ? 0x3f8f53 : 0xf0b958;
  g.poly([x, y - 24, x - 10, y - 7, x + 10, y - 7]).fill(green);
  g.poly([x, y - 18, x - 8, y - 3, x + 8, y - 3]).fill(tint(green, 0.84));
  parent.addChild(g);
};

const addMountain = (parent: PIXI.Container, x: number, y: number, seed: number) => {
  const g = new PIXI.Graphics();
  const h = 24 + (seed % 20);
  g.poly([x - 22, y, x, y - h, x + 24, y]).fill(0x77735e);
  g.poly([x, y - h, x + 24, y, x + 3, y - 4]).fill(0x575343);
  g.poly([x - 5, y - h + 8, x, y - h, x + 6, y - h + 9]).fill(0xece3d1);
  parent.addChild(g);
};

const seededNoise = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const drawLine = (
  layer: PIXI.Container,
  points: PIXI.Point[],
  width: number,
  color: number,
  alpha: number,
  yOffset: number
) => {
  if (points.length < 2) return;
  const g = new PIXI.Graphics();
  g.setStrokeStyle({ width, color, alpha, cap: "round", join: "round" });
  g.moveTo(points[0].x, points[0].y + yOffset);
  for (let i = 1; i < points.length; i += 1) g.lineTo(points[i].x, points[i].y + yOffset);
  g.stroke();
  layer.addChild(g);
};

const drawSleepers = (layer: PIXI.Container, points: PIXI.Point[], step: number, alpha = 0.62) => {
  const g = new PIXI.Graphics();
  g.setStrokeStyle({ width: 2, color: 0x4e5d62, alpha, cap: "round" });
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const nx = -dy / len;
    const ny = dx / len;
    const steps = Math.floor(len / step);
    for (let s = 1; s < steps; s += 1) {
      const t = s / steps;
      const x = p0.x + dx * t;
      const y = p0.y + dy * t;
      g.moveTo(x - nx * 8, y - ny * 8);
      g.lineTo(x + nx * 8, y + ny * 8);
    }
  }
  g.stroke();
  layer.addChild(g);
};

const buildRouteLabel = (text: string, x: number, y: number) => {
  const c = new PIXI.Container();
  c.position.set(x, y);
  c.zIndex = y + 80;
  const label = new PIXI.Text({
    text,
    style: {
      fontFamily: "Verdana, Trebuchet MS, sans-serif",
      fontSize: 12,
      fontWeight: "700",
      fill: 0xecf6ff,
      dropShadow: { color: "#02070b", blur: 2, distance: 1, alpha: 0.95 }
    }
  });
  label.anchor.set(0.5);
  const bg = new PIXI.Graphics();
  bg.roundRect(-label.width / 2 - 9, -label.height / 2 - 4, label.width + 18, label.height + 8, 3).fill({
    color: 0x154f86,
    alpha: 0.94
  });
  bg.stroke({ width: 1, color: 0x9fd5ff, alpha: 0.5 });
  c.addChild(bg, label);
  return c;
};

const drawShinkansenViaduct = (
  layer: PIXI.Container,
  points: PIXI.Point[],
  quality: Quality,
  band: DetailBand
) => {
  const base = band.routeWidth;

  if (band.routeMode === "station") {
    // In generated close city art, the station/track bed already exists in the
    // plate. Keep the live route as a quiet operational guide instead of a
    // second, mismatched viaduct painted over the city.
    const guideWidth = clamp(base * 0.24, 0.95, 1.7);
    drawLine(layer, points, guideWidth + 1.8, PALETTE.ink, 0.09, 2);
    drawLine(layer, points, guideWidth + 0.7, 0xf7f4df, 0.16, 0);
    drawLine(layer, points, Math.max(0.55, guideWidth * 0.32), PALETTE.blue, 0.18, -1);
    return;
  }

  if (band.routeMode === "atlas") {
    const width = Math.max(1.2, base);
    drawLine(layer, points, width + 4.2, PALETTE.ink, 0.34, 3);
    drawLine(layer, points, width + 1.8, 0xf1f5df, 0.66, 0);
    drawLine(layer, points, width * 0.72, PALETTE.blue, 0.82, -1);
    drawLine(layer, points, Math.max(0.55, width * 0.28), PALETTE.gold, 0.62, -2);
    return;
  }

  if (band.routeMode === "guide") {
    const deck = base + 0.8;
    const railGap = Math.max(1.4, base * 0.34);
    drawLine(layer, points, deck + 4.2, PALETTE.ink, 0.2, 4);
    drawLine(layer, points, deck + 1.4, 0x4b5960, 0.22, 2);
    drawLine(layer, points, deck, 0xd8ded3, 0.42, 0);
    drawLine(layer, points, Math.max(0.8, deck - 2), 0xf3efd9, 0.28, -1);
    drawLine(layer, offsetPolyline(points, -railGap), 0.7, 0xf7f1dd, 0.34, -1);
    drawLine(layer, offsetPolyline(points, railGap), 0.7, 0xf7f1dd, 0.34, -1);
    return;
  }

  const deck = base + 2.2;
  const ballast = Math.max(2.4, base * 0.68);
  const railGap = Math.max(2.1, base * 0.4);
  const railWidth = Math.max(0.95, base * 0.12);
  const alpha = band.index <= 10 ? 0.38 : 0.46;

  drawLine(layer, points, deck + 6.5, PALETTE.ink, 0.2, 5);
  drawLine(layer, points, deck + 3, 0x3c464a, alpha * 0.5, 3);
  drawLine(layer, points, deck, 0xc8cdc5, alpha, 0);
  drawLine(layer, points, Math.max(1.2, deck - 3.6), 0xe9e6d2, alpha * 0.58, -1);
  drawLine(layer, points, ballast, 0x555c5a, 0.42, 0);

  const leftRail = offsetPolyline(points, -railGap);
  const rightRail = offsetPolyline(points, railGap);
  drawLine(layer, leftRail, railWidth + 1.0, 0x2d1d16, 0.42, 0);
  drawLine(layer, rightRail, railWidth + 1.0, 0x2d1d16, 0.42, 0);
  drawLine(layer, leftRail, railWidth, 0xf1efe1, 0.66, -1);
  drawLine(layer, rightRail, railWidth, 0xf1efe1, 0.66, -1);
  drawLine(layer, offsetPolyline(points, -railGap * 2.05), Math.max(0.7, railWidth * 0.56), PALETTE.blue, 0.24, -1);

  if (band.index >= 11 && quality !== "low") drawSleepers(layer, points, band.sleeperStep, 0.08);
  if (band.index >= 12 && quality !== "low") drawViaductPiers(layer, points, band.sleeperStep * 3.2, band);
  if (band.index >= 13 && quality === "high") drawCatenary(layer, points, band.sleeperStep * 2.5);
};

const drawViaductPiers = (
  layer: PIXI.Container,
  points: PIXI.Point[],
  step: number,
  band: DetailBand
) => {
  const g = new PIXI.Graphics();
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const count = Math.floor(len / step);
    for (let s = 1; s < count; s += 1) {
      const t = s / count;
      const x = p0.x + dx * t;
      const y = p0.y + dy * t;
      const h = clamp(18 + band.index * 1.8, 24, 46);
      const w = clamp(3 + band.index * 0.24, 4, 7);
      g.rect(x - w / 2, y + 6, w, h).fill({ color: 0x8f9895, alpha: 0.26 });
      g.rect(x - w / 2, y + 6, w, h).stroke({ width: 1, color: 0xe4e0cb, alpha: 0.1 });
      g.ellipse(x, y + h + 10, 9, 3).fill({ color: PALETTE.ink, alpha: 0.12 });
    }
  }
  layer.addChild(g);
};


const drawCatenary = (layer: PIXI.Container, points: PIXI.Point[], step: number) => {
  const g = new PIXI.Graphics();
  g.setStrokeStyle({ width: 1.2, color: 0xaebfc3, alpha: 0.66, cap: "round", join: "round" });
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const nx = -dy / len;
    const ny = dx / len;
    const count = Math.floor(len / step);
    for (let s = 1; s < count; s += 1) {
      const t = s / count;
      const x = p0.x + dx * t;
      const y = p0.y + dy * t;
      g.moveTo(x - nx * 12, y - ny * 12);
      g.lineTo(x - nx * 12, y - ny * 12 - 24);
      g.moveTo(x - nx * 19, y - ny * 19 - 20);
      g.lineTo(x + nx * 18, y + ny * 18 - 20);
    }
  }
  g.stroke();
  layer.addChild(g);
};

const drawCoordinateGroundTruth = (
  layer: PIXI.Container,
  lines: Line[],
  stations: Station[],
  toScreen: (lat: number, lon: number) => PIXI.Point,
  quality: Quality,
  band: DetailBand
) => {
  void lines;
  void quality;
  const g = new PIXI.Graphics();

  if (band.index <= 6) {
    stations.forEach((station) => {
      const p = toScreen(station.lat, station.lon);
      if (p.x < -120 || p.x > window.innerWidth + 120 || p.y < -120 || p.y > window.innerHeight + 120) return;
      const radius = station.id === "tokyo" || station.id === "osaka" ? 15 + band.index * 1.2 : 10 + band.index;
      g.circle(p.x, p.y, radius).fill({ color: station.id === "kyoto" ? 0xe6b46d : 0x80d5bb, alpha: 0.16 + band.index * 0.018 });
      g.circle(p.x, p.y, Math.max(3, radius * 0.24)).fill({ color: 0xf5f2cf, alpha: 0.78 });
      g.circle(p.x, p.y, radius).stroke({ width: 1, color: 0xe7f6dc, alpha: 0.24 });
    });
  }

  layer.addChild(g);
};


const stationNodeTexture = (stationId: string, textures: GeneratedTextures) => {
  const keyByStation: Record<string, AssetKey> = {
    tokyo: "stationNodeTokyo",
    yokohama: "stationNodeYokohama",
    nagoya: "stationNodeNagoya",
    kyoto: "stationNodeKyoto",
    osaka: "stationNodeOsaka"
  };
  const key = keyByStation[stationId];
  return key ? textures[key] : undefined;
};

const drawIsoOperationsField = (
  layer: PIXI.Container,
  app: PIXI.Application,
  stations: Station[],
  toScreen: (lat: number, lon: number) => PIXI.Point,
  quality: Quality,
  band: DetailBand
) => {
  const field = new PIXI.Container();
  field.zIndex = -80;
  const bg = new PIXI.Graphics();
  bg.rect(0, 0, app.screen.width, app.screen.height).fill({ color: 0x10252a, alpha: 0.88 });
  field.addChild(bg);

  const tileW = quality === "high" && band.index >= 15 ? 78 : band.index >= 15 ? 86 : 100;
  const tileH = tileW * 0.5;
  const cols = Math.ceil(app.screen.width / (tileW / 2)) + 8;
  const rows = Math.ceil(app.screen.height / (tileH / 2)) + 8;
  const originX = app.screen.width * 0.5;
  const originY = -tileH * 5;
  const cityAnchors = stations.map((station) => ({ station, p: toScreen(station.lat, station.lon) }));

  for (let row = -rows; row < rows; row += 1) {
    for (let col = -cols; col < cols; col += 1) {
      const x = originX + (col - row) * (tileW / 2);
      const y = originY + (col + row) * (tileH / 2);
      if (x < -tileW || x > app.screen.width + tileW || y < -tileH || y > app.screen.height + tileH) continue;
      const seed = row * 92821 + col * 68917;
      const near = nearestCity(cityAnchors, x, y);
      const dist = near ? Math.hypot(x - near.p.x, y - near.p.y) : 9999;
      const kind = isoTileKind(seed, dist, near?.station.id ?? "tokyo");
      drawIsoTile(field, x, y, tileW, tileH, kind, seed, band, near?.station.id ?? "tokyo");
    }
  }

  stations.forEach((station, index) => {
    const p = toScreen(station.lat, station.lon);
    if (p.x < -240 || p.x > app.screen.width + 240 || p.y < -240 || p.y > app.screen.height + 240) return;
    addStationCompound(field, p.x, p.y, station.id, index, band);
  });

  layer.addChild(field);
};

const nearestCity = (anchors: Array<{ station: Station; p: PIXI.Point }>, x: number, y: number): { station: Station; p: PIXI.Point } | null => {
  let best: { station: Station; p: PIXI.Point } | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const anchor of anchors) {
    const d = Math.hypot(x - anchor.p.x, y - anchor.p.y);
    if (d < bestDist) {
      best = anchor;
      bestDist = d;
    }
  }
  return best;
};

type IsoTileKind = "water" | "park" | "urban" | "dense" | "road" | "plaza";

const isoTileKind = (seed: number, distToCity: number, stationId: string): IsoTileKind => {
  const noise = seededNoise(seed);
  if (stationId === "yokohama" && noise < 0.16) return "water";
  if (distToCity < 150 && noise > 0.68) return "dense";
  if (distToCity < 260 && noise > 0.34) return "urban";
  if (noise < 0.14) return "park";
  if (noise > 0.82) return "road";
  return distToCity < 190 ? "plaza" : "urban";
};

const drawIsoTile = (
  parent: PIXI.Container,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: IsoTileKind,
  seed: number,
  band: DetailBand,
  stationId: string
) => {
  const c = new PIXI.Container();
  c.position.set(x, y);
  c.zIndex = y;
  const profile = cityProfile(stationId);
  const g = new PIXI.Graphics();
  const color =
    kind === "water" ? 0x0d5d76 :
    kind === "park" ? 0x4c7b42 :
    kind === "road" ? 0x30383a :
    kind === "plaza" ? 0x6b756b :
    kind === "dense" ? tint(profile.tone, 0.82) : tint(profile.tone, 0.94);
  g.poly([0, -h / 2, w / 2, 0, 0, h / 2, -w / 2, 0]).fill({ color, alpha: 0.86 });
  g.poly([0, h / 2, w / 2, 0, w / 2, 7, 0, h / 2 + 7]).fill({ color: tint(color, 0.58), alpha: 0.72 });
  g.poly([0, h / 2, -w / 2, 0, -w / 2, 7, 0, h / 2 + 7]).fill({ color: tint(color, 0.68), alpha: 0.72 });
  g.poly([0, -h / 2, w / 2, 0, 0, h / 2, -w / 2, 0]).stroke({ width: 1, color: 0xd8d5b2, alpha: 0.12 });
  c.addChild(g);

  if (kind === "road") {
    const road = new PIXI.Graphics();
    road.poly([-w / 2 + 10, -4, -8, -h / 2 + 7, w / 2 - 8, 3, 8, h / 2 - 6]).fill({ color: 0x20292c, alpha: 0.9 });
    road.poly([-w / 2 + 20, -2, -8, -h / 2 + 13, w / 2 - 20, 2, 8, h / 2 - 12]).stroke({ width: 1, color: 0xd6c47d, alpha: 0.55 });
    c.addChild(road);
  } else if (kind === "park") {
    for (let i = 0; i < 4; i += 1) addIsoTree(c, -22 + i * 14, -2 + ((seed + i) % 3) * 8, seed + i);
  } else if (kind === "water") {
    const waves = new PIXI.Graphics();
    waves.setStrokeStyle({ width: 1, color: 0x8bd0da, alpha: 0.26, cap: "round" });
    for (let i = 0; i < 3; i += 1) {
      waves.moveTo(-28 + i * 20, -2 + i * 5);
      waves.lineTo(-16 + i * 20, -6 + i * 5);
      waves.lineTo(-4 + i * 20, -2 + i * 5);
    }
    waves.stroke();
    c.addChild(waves);
  } else if (kind === "urban" || kind === "dense") {
    const count = kind === "dense" ? (band.index >= 15 ? 4 : 3) : 2;
    for (let i = 0; i < count; i += 1) {
      const bx = -28 + i * 18 + seededNoise(seed + i) * 8;
      const by = 8 + ((seed + i) % 2) * 8;
      const bw = 9 + Math.floor(seededNoise(seed + i * 5) * 8);
      const bh = (kind === "dense" ? 34 : 18) + Math.floor(seededNoise(seed + i * 11) * (kind === "dense" ? 52 : 24));
      const colors = [0x8c989d, 0xa66f55, 0xbda767, 0x647c8a, 0x8bb7bf];
      addBuilding(c, bx, by, bw, bh, colors[(seed + i) % colors.length], seed + i);
    }
  }

  parent.addChild(c);
};

const addIsoTree = (parent: PIXI.Container, x: number, y: number, seed: number) => {
  const g = new PIXI.Graphics();
  g.rect(x - 1, y - 7, 3, 8).fill(0x6c4729);
  g.poly([x, y - 24, x - 9, y - 8, x + 9, y - 8]).fill(seed % 4 === 0 ? 0xd16d4f : 0x69ae4b);
  g.poly([x, y - 18, x - 7, y - 3, x + 7, y - 3]).fill(seed % 4 === 0 ? 0xe3a047 : 0x78c05a);
  parent.addChild(g);
};

const addStationCompound = (
  parent: PIXI.Container,
  x: number,
  y: number,
  stationId: string,
  seed: number,
  band: DetailBand
) => {
  const c = new PIXI.Container();
  c.position.set(x, y);
  c.zIndex = y + 120;
  c.scale.set(clamp(0.7 + band.cityIntensity * 0.7, 0.7, 1.35));
  const profile = cityProfile(stationId);
  const ground = new PIXI.Graphics();
  ground.poly([-98, 10, -18, -34, 108, -6, 24, 44]).fill({ color: 0x62716f, alpha: 0.92 });
  ground.poly([-86, 8, -16, -25, 92, -5, 20, 35]).fill({ color: 0x91a6a0, alpha: 0.54 });
  ground.poly([-98, 10, -18, -34, 108, -6, 24, 44]).stroke({ width: 2, color: 0xe8e6c5, alpha: 0.28 });
  c.addChild(ground);

  const concourse = new PIXI.Graphics();
  concourse.poly([-54, -8, 12, -26, 72, -6, 2, 18]).fill(0xc7d4cf);
  concourse.poly([-42, -16, 18, -30, 60, -12, 0, 2]).fill(stationId === "kyoto" || stationId === "osaka" ? 0xdab865 : 0x9fd4d0);
  concourse.rect(-10, -22, 4, 24).fill(0x53686e);
  concourse.rect(38, -21, 4, 20).fill(0x53686e);
  c.addChild(concourse);

  if (stationId === "tokyo") {
    addBuilding(c, -88, -8, 18, 72, 0x8ba6be, seed);
    addBuilding(c, -64, -8, 16, 88, 0x5e6978, seed + 1);
    addTowerSpire(c, 82, -28, profile.accent);
  } else if (stationId === "yokohama") {
    addWheel(c, 76, -34);
  } else if (stationId === "nagoya") {
    addCastleGlyph(c, 78, -20, profile.accent);
  } else if (stationId === "kyoto") {
    addTempleGlyph(c, 78, -18, profile.accent);
  } else if (stationId === "osaka") {
    addOsakaTowerGlyph(c, 78, -12, profile.accent);
  }
  parent.addChild(c);
};

const drawCityFootprint = (g: PIXI.Graphics, p: PIXI.Point, stationId: string, band: DetailBand) => {
  const profile = cityProfile(stationId);
  const r = (stationId === "tokyo" || stationId === "osaka" ? 72 : 54) * (0.45 + band.cityIntensity);
  const squash = profile.terrain === "bay" ? 0.54 : profile.terrain === "temple" ? 0.72 : 0.62;
  g.ellipse(p.x, p.y + 16, r, r * squash).fill({ color: profile.tone, alpha: 0.08 + band.cityIntensity * 0.1 });
  g.ellipse(p.x, p.y + 16, r * 0.72, r * squash * 0.62).stroke({ width: 1.2, color: profile.accent, alpha: 0.2 + band.cityIntensity * 0.18 });
  if (band.index >= 8) {
    for (let i = 0; i < 5; i += 1) {
      const angle = -0.8 + i * 0.36;
      const dx = Math.cos(angle) * r * 0.9;
      const dy = Math.sin(angle) * r * squash * 0.55;
      g.moveTo(p.x - dx, p.y + 16 - dy);
      g.lineTo(p.x + dx, p.y + 16 + dy);
    }
    g.stroke({ width: 1, color: 0xd8d0aa, alpha: 0.16 });
  }
};

const addCityMiniSignature = (
  parent: PIXI.Container,
  x: number,
  y: number,
  stationId: string,
  seed: number,
  band: DetailBand
) => {
  const profile = cityProfile(stationId);
  const c = new PIXI.Container();
  c.position.set(x, y);
  c.zIndex = y + 20;
  c.scale.set(clamp(0.42 + band.cityIntensity * 0.58, 0.42, 0.9));

  const base = new PIXI.Graphics();
  base.poly([-34, 8, -7, -8, 34, 5, 5, 21]).fill({ color: profile.tone, alpha: 0.82 });
  base.poly([-34, 8, -7, -8, 34, 5, 5, 21]).stroke({ width: 1, color: 0xf2ebcc, alpha: 0.34 });
  c.addChild(base);

  if (profile.terrain === "terminal") {
    addBuilding(c, -22, 2, 11, 36, 0x6c879b, seed);
    addBuilding(c, -6, 0, 12, 50, 0x9aabb9, seed + 1);
    addBuilding(c, 12, 4, 10, 30, 0x4e5b68, seed + 2);
    addTowerSpire(c, 26, -4, profile.accent);
  } else if (profile.terrain === "bay") {
    addWheel(c, 8, -8);
    const pier = new PIXI.Graphics();
    pier.poly([-30, 14, 12, 2, 30, 10, -10, 24]).fill(0xcabf9f);
    c.addChild(pier);
  } else if (profile.terrain === "castle") {
    addCastleGlyph(c, 0, 4, profile.accent);
  } else if (profile.terrain === "temple") {
    addTempleGlyph(c, 0, 4, profile.accent);
  } else {
    addOsakaTowerGlyph(c, 0, 5, profile.accent);
  }

  parent.addChild(c);
};

const addOverviewMiniHub = (parent: PIXI.Container, x: number, y: number, seed: number, band: DetailBand) => {
  const c = new PIXI.Container();
  c.position.set(x, y);
  c.zIndex = y - 20;
  const blocks = band.macro === "overview" ? 2 : band.macro === "regional" ? 3 : 5;
  for (let i = 0; i < blocks; i += 1) {
    const ox = -18 + (i % 3) * 16 + seededNoise(seed + i) * 5;
    const oy = -6 + Math.floor(i / 3) * 13 + seededNoise(seed + i * 3) * 5;
    const h = 10 + Math.floor(seededNoise(seed + i * 11) * (band.index >= 10 ? 28 : 12));
    const palette = [0x87949b, 0xa8745d, 0xb9a366, 0x6f8d91, 0x536b80];
    addBuilding(c, ox, oy, 7 + (seed + i) % 5, h, palette[(seed + i) % palette.length], seed + i);
  }
  parent.addChild(c);
};

const addTracksideBlock = (parent: PIXI.Container, x: number, y: number, seed: number, band: DetailBand) => {
  const c = new PIXI.Container();
  c.position.set(x, y);
  c.zIndex = y;
  const base = new PIXI.Graphics();
  base.poly([-22, -8, 10, -20, 34, -7, 2, 14]).fill({ color: seed % 3 === 0 ? 0x4f7447 : 0x40484b, alpha: 0.66 });
  c.addChild(base);
  const count = band.index >= 14 ? 4 : 2;
  for (let i = 0; i < count; i += 1) {
    if ((seed + i) % 4 === 0) addTree(c, -14 + i * 12, 2 + (i % 2) * 8, seed + i);
    else addBuilding(c, -16 + i * 14, 6 + (i % 2) * 4, 9 + (seed + i) % 6, 16 + (seed + i * 7) % 28, [0x8b989d, 0xa66f55, 0xbda767, 0x647c8a][(seed + i) % 4], seed + i);
  }
  parent.addChild(c);
};

const offsetPolyline = (points: PIXI.Point[], distance: number) => {
  return points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    return new PIXI.Point(p.x + (-dy / len) * distance, p.y + (dx / len) * distance);
  });
};

const movingLane = (id: string, band: DetailBand) => {
  const spread = band.laneScale;
  const lane = hashString(id) % 5;
  return [-spread, spread, 0, -spread * 0.34, spread * 0.34][lane] ?? 0;
};

const stationLane = (train: SimTrainState, slots: Map<string, number>, band: DetailBand) => {
  const key = `${train.lineId}:${train.nextStationId ?? "terminal"}:${Math.round(train.lat * 100)}:${Math.round(train.lon * 100)}`;
  const slot = slots.get(key) ?? 0;
  slots.set(key, slot + 1);
  const column = slot % 3;
  const row = Math.floor(slot / 3);
  const spread = band.laneScale * (band.platformDetail >= 2 ? 2.4 : 1.8);
  return (column - 1) * spread + row * spread * 0.22;
};

const stationSlotAlong = (train: SimTrainState, slots: Map<string, number>, band: DetailBand) => {
  const key = `${train.lineId}:${train.nextStationId ?? "terminal"}:${Math.round(train.lat * 100)}:${Math.round(train.lon * 100)}`;
  const slot = slots.get(key) ?? 0;
  slots.set(key, slot + 1);
  if (slot === 0) return 0;
  const stride = band.laneScale * (band.platformDetail >= 2 ? 8.2 : 6.4);
  return (slot % 2 === 0 ? 1 : -1) * Math.ceil(slot / 2) * stride;
};

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const buildCityDistrict = (stationId: string, seed: number) => {
  const c = new PIXI.Container();
  const profile = cityProfile(stationId);
  const dense = profile.density > 0.8;
  const warm = stationId === "kyoto" || stationId === "osaka";

  const base = new PIXI.Graphics();
  base.roundRect(-116, -72, 232, 138, 10).fill({ color: profile.tone, alpha: 0.78 });
  base.roundRect(-112, -68, 224, 130, 8).stroke({ width: 2, color: 0xf7ffd7, alpha: 0.28 });
  c.addChild(base);

  const road = new PIXI.Graphics();
  road.poly([-112, 6, -34, -8, 114, 29, 102, 45, -52, 8]).fill(0x3d4548);
  road.poly([-17, -65, 2, -68, -2, 64, -23, 66]).fill(0x3d4548);
  road.poly([-106, 19, 100, 53, 96, 58, -110, 24]).fill({ color: 0xffffff, alpha: 0.34 });
  road.poly([-13, -61, -8, -62, -12, 58, -17, 59]).fill({ color: 0xffffff, alpha: 0.34 });
  c.addChild(road);

  const plaza = new PIXI.Graphics();
  plaza.roundRect(-46, -18, 92, 45, 6).fill(warm ? 0xd1a45f : 0x67a5a7);
  plaza.roundRect(-38, -12, 76, 32, 4).fill({ color: 0xfff0b5, alpha: 0.26 });
  c.addChild(plaza);

  const buildingPlan = dense
    ? [
        [-96, -50, 25, 64, 0x6ea0d3],
        [-66, -54, 22, 82, 0x535a6e],
        [-34, -56, 25, 96, 0x9bb6d5],
        [62, -50, 24, 74, 0x6780a5],
        [88, -34, 20, 48, 0xf09769],
        [-94, 34, 26, 34, 0xe98961],
        [58, 34, 30, 38, 0x8abfc0]
      ]
    : [
        [-92, -46, 24, 42, 0xc98670],
        [-60, -46, 20, 36, 0x95b6c8],
        [64, -42, 24, 42, 0xa7cc9d],
        [92, -28, 18, 32, 0xe7b568],
        [-88, 34, 24, 30, 0xe98561],
        [56, 34, 28, 32, 0x82bebd]
      ];

  buildingPlan.forEach(([x, y, w, h, color], index) => {
    addBuilding(c, x, y, w, h, color, index + seed);
  });

  addPark(c, stationId === "kyoto" ? -54 : 34, stationId === "kyoto" ? 28 : -50, seed);

  for (let i = 0; i < (dense ? 12 : 8); i += 1) {
    const x = -104 + ((i * 37 + seed * 19) % 210);
    const y = -58 + ((i * 29 + seed * 23) % 112);
    if (Math.abs(x) < 38 && Math.abs(y) < 24) continue;
    addTree(c, x, y, i);
  }

  if (stationId === "tokyo") {
    addSign(c, -92, -86, 0x42d6ff);
    addSign(c, -64, -82, 0xff6bb5);
    addTowerSpire(c, 92, -56, profile.accent);
  } else if (stationId === "yokohama") {
    addWheel(c, 78, -60);
    const harbor = new PIXI.Graphics();
    harbor.poly([-118, 42, -58, 18, -18, 36, -76, 66]).fill({ color: 0x2f8797, alpha: 0.75 });
    harbor.poly([-108, 45, -62, 28, -32, 38, -80, 58]).stroke({ width: 2, color: 0xd8f5f2, alpha: 0.24 });
    c.addChild(harbor);
  } else if (stationId === "nagoya") {
    addCastleGlyph(c, 82, -48, profile.accent);
  } else if (stationId === "kyoto") {
    addTempleGlyph(c, 84, -45, profile.accent);
    for (let i = 0; i < 8; i += 1) addTree(c, -92 + i * 17, -70 + (i % 3) * 10, seed + i);
  } else if (stationId === "osaka") {
    addOsakaTowerGlyph(c, -86, -42, profile.accent);
    addSign(c, 78, -76, 0xffcb4f);
  }

  return c;
};

const addBuilding = (
  parent: PIXI.Container,
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
  seed: number
) => {
  const g = new PIXI.Graphics();
  const depth = Math.max(10, width * 0.7);
  const top = tint(color, 1.18);
  const side = tint(color, 0.72);
  const front = tint(color, 0.92);

  g.rect(x, y - height, width, height).fill(front);
  g.poly([x + width, y - height, x + width + depth, y - height - depth * 0.35, x + width + depth, y - depth * 0.35, x + width, y]).fill(side);
  g.poly([x, y - height, x + depth, y - height - depth * 0.35, x + width + depth, y - height - depth * 0.35, x + width, y - height]).fill(top);
  g.rect(x, y - height, width, height).stroke({ width: 1, color: 0xffffff, alpha: 0.18 });

  const rows = Math.max(2, Math.floor(height / 14));
  const cols = Math.max(2, Math.floor(width / 7));
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if ((row + col + seed) % 4 === 0) continue;
      g.rect(x + 4 + col * 7, y - height + 6 + row * 12, 3, 5).fill({
        color: (row + seed) % 3 === 0 ? 0x8fe6ff : 0xf8d88e,
        alpha: 0.55
      });
    }
  }

  parent.addChild(g);
};

const addPark = (parent: PIXI.Container, x: number, y: number, seed: number) => {
  const g = new PIXI.Graphics();
  g.roundRect(x - 26, y - 18, 52, 36, 8).fill(0x4f8d50);
  g.ellipse(x + 4, y, 14, 8).fill(0x75c987);
  g.circle(x - 14, y + 7, 5).fill(0xe4876f);
  parent.addChild(g);

  for (let i = 0; i < 5; i += 1) {
    addTree(parent, x - 20 + i * 10, y - 8 + ((i + seed) % 3) * 8, i);
  }
};

const addTree = (parent: PIXI.Container, x: number, y: number, seed: number) => {
  const g = new PIXI.Graphics();
  g.rect(x - 1, y - 7, 3, 8).fill(0x6c4729);
  g.circle(x, y - 10, 6).fill(seed % 3 === 0 ? 0xe07158 : seed % 3 === 1 ? 0x76b852 : 0xf0b955);
  g.circle(x - 4, y - 7, 4).fill({ color: 0xffffff, alpha: 0.1 });
  parent.addChild(g);
};

const addSign = (parent: PIXI.Container, x: number, y: number, color: number) => {
  const g = new PIXI.Graphics();
  g.rect(x, y, 18, 28).fill(0x172329);
  g.rect(x + 2, y + 3, 14, 9).fill({ color, alpha: 0.82 });
  g.rect(x + 2, y + 16, 14, 8).fill({ color: 0xffd15c, alpha: 0.74 });
  parent.addChild(g);
};


const addTowerSpire = (parent: PIXI.Container, x: number, y: number, color: number) => {
  const g = new PIXI.Graphics();
  g.rect(x - 7, y - 38, 14, 40).fill(0xa1523e);
  g.poly([x - 20, y - 18, x, y - 72, x + 20, y - 18]).fill(color);
  g.rect(x - 3, y - 92, 6, 22).fill(0xf4d37a);
  g.rect(x - 13, y + 2, 26, 10).fill(0x5c6770);
  parent.addChild(g);
};

const addCastleGlyph = (parent: PIXI.Container, x: number, y: number, color: number) => {
  const g = new PIXI.Graphics();
  g.rect(x - 24, y - 4, 48, 14).fill(0x6e6759);
  g.poly([x - 30, y - 14, x, y - 32, x + 30, y - 14, x + 21, y - 8, x - 21, y - 8]).fill(0x9ca898);
  g.poly([x - 20, y - 34, x, y - 50, x + 20, y - 34, x + 14, y - 28, x - 14, y - 28]).fill(color);
  g.rect(x - 12, y - 26, 24, 18).fill(0xd5d0b8);
  parent.addChild(g);
};

const addTempleGlyph = (parent: PIXI.Container, x: number, y: number, color: number) => {
  const g = new PIXI.Graphics();
  g.rect(x - 24, y - 6, 48, 16).fill(0x9a694b);
  g.poly([x - 38, y - 20, x, y - 42, x + 38, y - 20, x + 25, y - 10, x - 25, y - 10]).fill(color);
  g.poly([x - 28, y - 44, x, y - 60, x + 28, y - 44, x + 17, y - 37, x - 17, y - 37]).fill(tint(color, 1.16));
  g.rect(x - 17, y - 34, 34, 26).fill(0xcba06c);
  parent.addChild(g);
};

const addOsakaTowerGlyph = (parent: PIXI.Container, x: number, y: number, color: number) => {
  const g = new PIXI.Graphics();
  g.rect(x - 10, y - 70, 20, 78).fill(0x95a8b5);
  g.rect(x - 4, y - 106, 8, 36).fill(0xc9d9df);
  g.rect(x - 30, y - 3, 60, 14).fill(0x5f7684);
  g.setStrokeStyle({ width: 2, color, alpha: 0.85, cap: "round" });
  g.moveTo(x - 18, y - 4); g.lineTo(x + 18, y - 64);
  g.moveTo(x + 18, y - 4); g.lineTo(x - 18, y - 64);
  g.stroke();
  parent.addChild(g);
};

const addWheel = (parent: PIXI.Container, x: number, y: number) => {
  const g = new PIXI.Graphics();
  g.circle(x, y, 16).stroke({ width: 3, color: 0xd8eff4, alpha: 0.86 });
  for (let i = 0; i < 8; i += 1) {
    const a = (Math.PI * 2 * i) / 8;
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * 15, y + Math.sin(a) * 15);
  }
  g.stroke({ width: 1, color: 0x9bb7bd, alpha: 0.7 });
  parent.addChild(g);
};

const tint = (color: number, amount: number) => {
  const r = clamp(Math.round(((color >> 16) & 255) * amount), 0, 255);
  const g = clamp(Math.round(((color >> 8) & 255) * amount), 0, 255);
  const b = clamp(Math.round((color & 255) * amount), 0, 255);
  return (r << 16) + (g << 8) + b;
};

const buildStationSprite = (stationId: string, textures: GeneratedTextures) => {
  const c = new PIXI.Container();

  const marker = new PIXI.Container();
  (marker as PIXI.Container & { lod?: string }).lod = "marker";
  const dot = new PIXI.Graphics();
  dot.circle(0, 0, 7).fill({ color: stationId === "kyoto" ? PALETTE.gold : PALETTE.glow, alpha: 0.88 });
  dot.circle(0, 0, 16).stroke({ width: 2, color: 0xf5f2cf, alpha: 0.28 });
  marker.addChild(dot);

  const fallback = new PIXI.Container();
  (fallback as PIXI.Container & { lod?: string }).lod = "fallback";
  const shadow = new PIXI.Graphics();
  shadow.ellipse(8, 20, 48, 14).fill({ color: PALETTE.ink, alpha: 0.38 });
  fallback.addChild(shadow);

  const platform = new PIXI.Graphics();
  platform.poly([-64, -10, 34, -28, 76, -4, -20, 18]).fill(0x596b72);
  platform.poly([-58, -7, 32, -22, 62, -5, -18, 12]).fill(0xc4d0ca);
  platform.poly([-64, -10, 34, -28, 76, -4, -20, 18]).stroke({
    width: 2,
    color: 0xf1f6ef,
    alpha: 0.34
  });

  const canopy = new PIXI.Graphics();
  const canopyColor = stationId === "kyoto" || stationId === "osaka" ? 0xd0aa5d : 0x8fd1ce;
  canopy.poly([-36, -26, 28, -36, 54, -22, -10, -12]).fill(canopyColor);
  canopy.poly([-31, -24, 25, -32, 45, -22, -9, -15]).fill({ color: 0xf5f2d6, alpha: 0.22 });
  canopy.rect(-12, -13, 4, 18).fill(0x4c6572);
  canopy.rect(28, -20, 4, 16).fill(0x4c6572);

  const light = new PIXI.Graphics();
  light.poly([-36, -2, 30, -13, 48, -4, -20, 8]).fill({ color: 0xffd889, alpha: 0.18 });

  fallback.addChild(platform, light, canopy);

  const generated = new PIXI.Container();
  (generated as PIXI.Container & { lod?: string }).lod = "generated";
  const plateShadow = new PIXI.Graphics();
  plateShadow.ellipse(0, 22, 86, 17).fill({ color: PALETTE.ink, alpha: 0.36 });
  generated.addChild(plateShadow);

  if (textures.stationPlatformSprite) {
    const platformTexture = textures.stationPlatformSprite;
    const sprite = new PIXI.Sprite(platformTexture);
    sprite.anchor.set(0.5, 0.72);
    sprite.width = stationId === "tokyo" || stationId === "osaka" ? 340 : 300;
    sprite.scale.y = sprite.scale.x;
    sprite.alpha = 0.97;
    generated.addChild(sprite);

  } else {
    const nodeTexture = stationNodeTexture(stationId, textures);
    if (nodeTexture) {
      const stationNode = new PIXI.Sprite(nodeTexture);
      stationNode.anchor.set(0.5, 0.76);
      stationNode.width = stationId === "tokyo" || stationId === "osaka" ? 236 : 206;
      stationNode.scale.y = stationNode.scale.x;
      stationNode.alpha = 0.98;
      generated.addChild(stationNode);
    }
  }

  const accent = new PIXI.Graphics();
  accent.ellipse(0, 14, 104, 32).stroke({ width: 2, color: stationId === "kyoto" ? PALETTE.gold : PALETTE.glow, alpha: 0.24 });
  generated.addChild(accent);

  c.addChild(marker, fallback, generated);
  c.hitArea = new PIXI.Rectangle(-104, -84, 220, 126);
  setStationLod(c, getDetailBand(8.6));
  return c;
};

const stationScaleForBand = (band: DetailBand, stationId: string) => {
  const terminalBoost = stationArtBounds(stationId).terminalScale;
  if (band.platformDetail >= 2) return 0.12 * terminalBoost;
  return clamp(0.11 + band.stationScale * 0.08, 0.14, 0.22) * terminalBoost;
};

const setStationLod = (sprite: PIXI.Container, band: DetailBand) => {
  void band;
  // Station buildings/platforms are now drawn by georeferenced route-aligned
  // geometry. Keep this sprite as a clean tap target/anchor so old generated
  // station images do not fight the actual map.
  const visibleLod = "marker";
  sprite.children.forEach((child) => {
    const lod = (child as PIXI.Container & { lod?: string }).lod;
    if (lod) child.visible = lod === visibleLod;
  });
};

const trainModel = (trainTypeId: string, liveryKey: string) => {
  if (trainTypeId === "doctor923") {
    return { stripe: 0xe7bb2f, body: 0xf4d23f, roof: 0xffe78b, windows: 0x26323a, cars: 6, nose: 48 };
  }
  if (trainTypeId === "series500") {
    return { stripe: 0x5e7f9d, body: 0xe7ece8, roof: 0xbac8c9, windows: 0x1d3447, cars: 5, nose: 58 };
  }
  if (liveryKey === "white-gold") {
    return { stripe: PALETTE.gold, body: 0xf7f4ec, roof: 0xffffff, windows: 0x173044, cars: 7, nose: 54 };
  }
  return { stripe: PALETTE.blue, body: 0xf8f6ee, roof: 0xffffff, windows: 0x12324c, cars: 7, nose: 54 };
};

const generatedTrainTexture = (
  trainTypeId: string,
  liveryKey: string,
  textures: GeneratedTextures
) => {
  const key =
    trainTypeId === "doctor923"
      ? "trainGeneratedDoctor"
      : trainTypeId === "series500"
        ? "trainGenerated500"
        : liveryKey === "white-gold"
          ? "trainGeneratedN700A"
          : "trainGeneratedN700S";
  return textures[key];
};

const buildTrainSprite = (trainTypeId: string, liveryKey: string, textures: GeneratedTextures) => {
  const c = new PIXI.Container();
  const model = trainModel(trainTypeId, liveryKey);
  const carLength = trainTypeId === "series500" ? 30 : 34;
  const height = trainTypeId === "series500" ? 18 : 20;
  const trainLength = model.nose + model.cars * carLength + 28;
  const left = -trainLength / 2;
  const right = trainLength / 2;

  const overview = new PIXI.Graphics();
  (overview as PIXI.Graphics & { lod?: string }).lod = "overview";
  overview.roundRect(-18, -6, 36, 12, 6).fill({ color: model.body, alpha: 0.98 });
  overview.roundRect(-17, -2, 34, 4, 2).fill({ color: model.stripe, alpha: 0.92 });
  overview.circle(-13, 0, 3).fill(model.windows);
  overview.roundRect(-20, 7, 42, 5, 3).fill({ color: 0x061018, alpha: 0.3 });

  const regional = new PIXI.Graphics();
  (regional as PIXI.Graphics & { lod?: string }).lod = "regional";
  regional.roundRect(-58, -10, 116, 20, 9).fill(model.body);
  regional.poly([-58, 0, -42, -12, 44, -10, 58, 0, 44, 10, -42, 12]).stroke({ width: 1.2, color: 0xcfe5ea, alpha: 0.7 });
  regional.roundRect(-44, -2, 86, 4, 2).fill(model.stripe);
  for (let i = 0; i < 8; i += 1) regional.roundRect(-25 + i * 8, -7, 4, 4, 1).fill(model.windows);
  regional.roundRect(-62, 12, 126, 7, 3).fill({ color: 0x061018, alpha: 0.26 });

  const detail = new PIXI.Container();
  (detail as PIXI.Container & { lod?: string }).lod = "detail";

  const glow = new PIXI.Graphics();
  glow.ellipse(8, 8, trainLength / 2, 16).fill({ color: model.stripe, alpha: 0.12 });

  const shadow = new PIXI.Graphics();
  shadow.roundRect(left + 10, height / 2 + 9, trainLength - 10, 8, 2).fill({ color: 0x061018, alpha: 0.28 });

  const body = new PIXI.Graphics();
  const bodyShape = [
    left, 0,
    left + 14, -10,
    left + model.nose, -height / 2 - 4,
    right - 32, -height / 2 - 2,
    right - 8, -8,
    right, 0,
    right - 8, 8,
    right - 32, height / 2 + 2,
    left + model.nose, height / 2 + 4,
    left + 14, 10
  ];
  body.poly(bodyShape).fill(model.body);
  body.poly([left + model.nose, height / 2 + 4, right - 32, height / 2 + 2, right - 8, 8, right, 0, right - 8, 13, right - 32, height / 2 + 8, left + model.nose, height / 2 + 10, left + 10, 12]).fill({
    color: tint(model.body, 0.78),
    alpha: 0.9
  });
  body.poly(bodyShape).stroke({
    width: 1.4,
    color: 0xb8d4df,
    alpha: 0.72
  });

  const roof = new PIXI.Graphics();
  roof.poly([left + model.nose, -height / 2 - 5, right - 42, -height / 2 - 3, right - 22, -height / 2 + 1, left + model.nose - 20, -height / 2 + 1]).fill({ color: model.roof, alpha: 0.52 });
  for (let i = 0; i < model.cars; i += 1) {
    const x = left + model.nose + 8 + i * carLength;
    roof.roundRect(x, -height / 2 - 9, 18, 3, 1).fill({ color: 0xc5d1d1, alpha: 0.82 });
  }

  const stripe = new PIXI.Graphics();
  stripe.poly([left + 24, 1, right - 16, 1, right - 4, 3, left + 14, 5]).fill(model.stripe);
  stripe.poly([left + 27, 7, right - 34, 7, right - 18, 8, left + 18, 9]).fill({ color: model.stripe, alpha: 0.56 });

  const windows = new PIXI.Graphics();
  windows.roundRect(left + 12, -5, 23, 7, 2).fill(model.windows);
  for (let i = 0; i < model.cars * 2; i += 1) {
    const x = left + model.nose + 4 + i * (carLength / 2);
    windows.roundRect(x, -height / 2 + 1, 7, 6, 2).fill(model.windows);
    windows.roundRect(x + 2, -height / 2 + 2, 2, 2, 1).fill({ color: 0xa7d8ff, alpha: 0.42 });
  }
  for (let i = 1; i < model.cars; i += 2) {
    const x = left + model.nose + i * carLength;
    windows.roundRect(x, -1, 5, 12, 1).fill({ color: 0x879a9b, alpha: 0.48 });
  }

  const nose = new PIXI.Graphics();
  nose.poly([left + 10, -1, left + 36, -8, left + 50, -5, left + 26, 1]).fill(model.windows);
  nose.roundRect(left + 3, 4, 11, 3, 1).fill({ color: 0xfff2a6, alpha: trainTypeId === "doctor923" ? 0.9 : 0.55 });

  const shine = new PIXI.Graphics();
  shine.roundRect(left + model.nose + 4, -height / 2 - 3, trainLength * 0.46, 3, 2).fill({ color: 0xffffff, alpha: 0.3 });
  shine.roundRect(left + 11, -1, 34, 3, 2).fill({ color: 0xffffff, alpha: 0.22 });

  const tail = new PIXI.Graphics();
  tail.poly([right - 32, -height / 2 - 1, right - 8, -8, right, 0, right - 8, 8, right - 32, height / 2 + 1, right - 18, 0]).fill({ color: tint(model.body, 0.88), alpha: 0.55 });

  const pantograph = new PIXI.Graphics();
  const panX = left + model.nose + carLength * Math.min(3, model.cars - 1);
  pantograph.setStrokeStyle({ width: 1.5, color: 0x525f64, alpha: 0.95, cap: "round", join: "round" });
  pantograph.moveTo(panX, -height / 2 - 7);
  pantograph.lineTo(panX + 12, -height / 2 - 18);
  pantograph.lineTo(panX + 24, -height / 2 - 7);
  pantograph.moveTo(panX + 7, -height / 2 - 15);
  pantograph.lineTo(panX + 18, -height / 2 - 15);
  pantograph.stroke();
  pantograph.rect(panX + 7, -height / 2 - 8, 14, 3).fill(0x59696c);

  const seams = new PIXI.Graphics();
  seams.setStrokeStyle({ width: 1, color: 0x8ea6ad, alpha: 0.42 });
  for (let i = 1; i <= model.cars; i += 1) {
    const x = left + model.nose + i * carLength;
    seams.moveTo(x, -height / 2);
    seams.lineTo(x + 2, height / 2);
  }
  seams.stroke();

  detail.addChild(glow, shadow, body, tail, roof, stripe, windows, nose, shine, pantograph, seams);
  c.addChild(overview, regional, detail);

  const generatedTexture = generatedTrainTexture(trainTypeId, liveryKey, textures);
  if (generatedTexture) {
    const generated = new PIXI.Sprite(generatedTexture);
    (generated as PIXI.Sprite & { lod?: string }).lod = "generated";
    generated.anchor.set(0.5, 0.54);
    generated.width = trainTypeId === "series500" ? 600 : trainTypeId === "doctor923" ? 620 : 560;
    generated.scale.y = generated.scale.x;
    generated.alpha = 0.95;
    generated.filters = [new PIXI.BlurFilter({ strength: 0.15, quality: 1 })];
    // These alpha sprites are pre-trimmed isometric vehicles; the parent snaps
    // them to the measured route pose so they slide with the rail instead of
    // behaving like a pasted full-plate image.
    generated.rotation = 0;
    c.addChild(generated);
  }

  c.hitArea = new PIXI.Rectangle(left - 8, -36, trainLength + 18, 72);
  setTrainLod(c, getDetailBand(8.6));
  return c;
};

const trainScaleForBand = (band: DetailBand) => {
  if (band.trainMode === "pin") return 0.28;
  if (band.trainMode === "short") return clamp(band.trainScale * 2.55, 0.13, 0.22);
  return clamp(band.trainScale * 1.18, 0.105, 0.165);
};

const setTrainLod = (sprite: PIXI.Container, band: DetailBand) => {
  const hasGenerated = sprite.children.some((child) => (child as PIXI.Container & { lod?: string }).lod === "generated");
  const visibleLod =
    band.trainMode === "pin" ? "overview" :
    band.trainMode === "short" && hasGenerated && band.index >= 8 ? "generated" :
    band.trainMode === "short" ? "regional" :
    hasGenerated ? "generated" : "detail";
  sprite.children.forEach((child) => {
    const lod = (child as PIXI.Container & { lod?: string }).lod;
    if (lod) child.visible = lod === visibleLod;
  });
};

const buildLabel = (text: string, index: number) => {
  const c = new PIXI.Container();
  const label = new PIXI.Text({
    text,
    style: {
      fontFamily: "Verdana, Trebuchet MS, sans-serif",
      fontSize: 13,
      fontWeight: "700",
      fill: PALETTE.label,
      dropShadow: { color: "#02070b", blur: 3, distance: 1, alpha: 0.95 }
    }
  });
  label.anchor.set(0.5, 0.5);

  const bg = new PIXI.Graphics();
  bg.roundRect(-label.width / 2 - 8, -label.height / 2 - 3, label.width + 16, label.height + 6, 6).fill({
    color: index % 2 ? 0x1a2f37 : 0x263d39,
    alpha: 0.9
  });
  bg.stroke({ width: 1, color: 0xf4f8ec, alpha: 0.2 });
  c.addChild(bg, label);
  return c;
};

const buildLandmark = (stationId: string, textures: GeneratedTextures) => {
  const c = new PIXI.Container();
  const shadow = new PIXI.Graphics();
  shadow.ellipse(0, 12, 30, 10).fill({ color: PALETTE.ink, alpha: 0.35 });
  c.addChild(shadow);

  const texture = landmarkTexture(stationId, textures);
  if (texture) {
    const sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(0.5, 0.82);
    sprite.width = stationId === "osaka" ? 92 : stationId === "tokyo" ? 88 : 78;
    sprite.scale.y = sprite.scale.x;
    sprite.alpha = 0.95;
    c.addChild(sprite);
    c.scale.set(1);
    return c;
  }

  if (stationId === "tokyo") {
    const g = new PIXI.Graphics();
    g.rect(-18, -20, 36, 28).fill(0x667986);
    g.rect(-10, -54, 20, 34).fill(PALETTE.coral);
    g.poly([-18, -40, 0, -82, 18, -40]).fill(0xc56b38);
    g.rect(-3, -104, 6, 22).fill(0xd4a452);
    c.addChild(g);
  } else if (stationId === "yokohama") {
    const g = new PIXI.Graphics();
    g.circle(0, -36, 26).stroke({ width: 4, color: 0xcbdde7, alpha: 0.95 });
    for (let i = 0; i < 8; i += 1) {
      const a = (Math.PI * 2 * i) / 8;
      g.moveTo(0, -36);
      g.lineTo(Math.cos(a) * 25, -36 + Math.sin(a) * 25);
    }
    g.stroke({ width: 1, color: 0x8da8bb, alpha: 0.8 });
    g.rect(-26, -8, 52, 16).fill(0x6c8797);
    c.addChild(g);
  } else if (stationId === "nagoya") {
    const g = new PIXI.Graphics();
    g.rect(-22, -8, 44, 16).fill(0x726c5e);
    g.poly([-26, -18, 0, -34, 26, -18, 18, -12, -18, -12]).fill(0x8f9c91);
    g.poly([-18, -36, 0, -50, 18, -36, 12, -31, -12, -31]).fill(0xa8b3a1);
    c.addChild(g);
  } else if (stationId === "kyoto") {
    const g = new PIXI.Graphics();
    g.rect(-24, -8, 48, 16).fill(0x9f7050);
    g.poly([-34, -22, 0, -40, 34, -22, 24, -14, -24, -14]).fill(0xc37b3d);
    g.poly([-26, -42, 0, -56, 26, -42, 18, -36, -18, -36]).fill(0xd3904e);
    c.addChild(g);
  } else if (stationId === "osaka") {
    const g = new PIXI.Graphics();
    g.rect(-14, -64, 28, 72).fill(0x99adbb);
    g.rect(-5, -100, 10, 36).fill(0xc2d4de);
    g.rect(-24, -4, 48, 14).fill(0x6f8796);
    c.addChild(g);
  } else {
    return null;
  }

  c.scale.set(0.48);
  return c;
};

const landmarkTexture = (stationId: string, textures: GeneratedTextures) => {
  const byStation: Record<string, AssetKey> = {
    tokyo: "tokyo",
    yokohama: "yokohama",
    nagoya: "nagoya",
    kyoto: "kyoto",
    osaka: "osaka"
  };
  const key = byStation[stationId];
  return key ? textures[key] : undefined;
};

const labelOffset = (stationId: string) => {
  const offsets: Record<string, PIXI.Point> = {
    tokyo: new PIXI.Point(22, 54),
    yokohama: new PIXI.Point(-36, 56),
    nagoya: new PIXI.Point(0, 58),
    kyoto: new PIXI.Point(48, 48),
    osaka: new PIXI.Point(-44, 48)
  };
  return offsets[stationId] ?? new PIXI.Point(0, 52);
};

const landmarkOffset = (stationId: string) => {
  const offsets: Record<string, PIXI.Point> = {
    tokyo: new PIXI.Point(56, -52),
    yokohama: new PIXI.Point(-58, -46),
    nagoya: new PIXI.Point(48, -50),
    kyoto: new PIXI.Point(58, -44),
    osaka: new PIXI.Point(-62, -50)
  };
  return offsets[stationId] ?? new PIXI.Point(52, -48);
};

type BoardInteraction = {
  panBy: (dx: number, dy: number) => void;
  zoomAt: (screen: PIXI.Point, nextZoom: number) => void;
  getZoom: () => number;
};

const setupInteraction = (app: PIXI.Application, board: BoardInteraction) => {
  let dragging = false;
  let dragStarted = false;
  let lastPos = new PIXI.Point();
  const pointers = new Map<number, PIXI.Point>();
  let lastPinch = 0;

  app.stage.on("pointerdown", (e) => {
    dragging = true;
    dragStarted = false;
    lastPos = e.global.clone();
    pointers.set(e.pointerId, e.global.clone());
  });

  app.stage.on("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, e.global.clone());

    if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (!lastPinch) lastPinch = dist;
      const center = new PIXI.Point((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      board.zoomAt(center, board.getZoom() + (dist - lastPinch) * 0.015);
      lastPinch = dist;
      return;
    }

    if (!dragging) return;
    const current = e.global.clone();
    const dx = current.x - lastPos.x;
    const dy = current.y - lastPos.y;
    if (Math.hypot(dx, dy) > 2) dragStarted = true;
    board.panBy(dx, dy);
    lastPos = current;
  });

  const endPointer = (e: PIXI.FederatedPointerEvent) => {
    dragging = false;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinch = 0;
    window.setTimeout(() => {
      dragStarted = false;
    }, 0);
  };

  app.stage.on("pointerup", endPointer);
  app.stage.on("pointerupoutside", endPointer);
  app.stage.on("pointertap", (e) => {
    if (dragStarted) e.stopPropagation();
  });

  app.canvas.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      e.preventDefault();
      board.zoomAt(new PIXI.Point(e.clientX, e.clientY), board.getZoom() + (e.deltaY > 0 ? -0.42 : 0.42));
    },
    { passive: false }
  );
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
