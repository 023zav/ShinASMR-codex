import * as PIXI from "pixi.js";
import { Line, Station, TrainType } from "./data/types";
import { SimTrainState } from "./sim";

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
  getStats: () => {
    trains: number;
    trackSprites: number;
    landmarks: number;
    detailLevel: number;
    detailIndex: number;
    view: MacroView;
    routeMode: string;
    trainMode: TrainMode;
    platformDetail: number;
    loadedCityArt: number;
    pendingCityArt: number;
    accuracyDebug: boolean;
  };
};

type Quality = "low" | "medium" | "high";
type MacroView = "overview" | "regional" | "corridor" | "city";
type TrainMode = "pin" | "mini" | "full";

/*
 * One authoritative visual source per zoom band.
 *
 * The world is a ladder of authored plates (generated once, in a single
 * SimCity-inspired isometric style): Japan -> rail atlas -> Tokaido corridor ->
 * central Honshu -> Kanagawa -> Tokyo approach -> focused city -> focused
 * station. Each plate carries a hand-authored rail polyline in normalized
 * image coordinates plus the slice of real Tokaido line progress it depicts.
 * Trains, station chips, and audio proximity are all projected through the
 * exact same plate transform, so nothing can drift apart from the artwork.
 */
type PlateSpec = {
  id: string;
  url: string;
  macro: MacroView;
  trainMode: TrainMode;
  /** Train sprite length as a fraction of plate width. */
  trainScale: number;
  /** Range of real line progress (0 = Tokyo, 1 = Shin-Osaka) shown on this plate. */
  coverage: [number, number];
  /** Rail polyline in normalized image coords; route[0] corresponds to coverage[0]. */
  route: Array<[number, number]>;
  /** Station anchors as arc-length t along the route. */
  stations: Partial<Record<string, number>>;
  /** Cover-crop focus point in normalized image coords. */
  focus: [number, number];
  /** Parallel platform tracks for dwelling trains. */
  lanes?: number;
  /** Normal offset between lanes, fraction of plate width. */
  laneSpread?: number;
};

const ART = "/assets-generated/lod-style-v2";

const JAPAN_BOARD: PlateSpec = {
  id: "japan-board",
  url: `${ART}/lod-01-japan-national-board.webp`,
  macro: "overview",
  trainMode: "pin",
  trainScale: 0.012,
  coverage: [0, 1],
  route: [
    [0.735, 0.4],
    [0.69, 0.44],
    [0.645, 0.475],
    [0.595, 0.505],
    [0.545, 0.53],
    [0.495, 0.555]
  ],
  stations: { tokyo: 0, yokohama: 0.05, nagoya: 0.62, kyoto: 0.9, osaka: 1 },
  focus: [0.64, 0.47]
};

const JAPAN_ATLAS: PlateSpec = {
  id: "japan-atlas",
  url: `${ART}/lod-02-japan-rail-atlas.webp`,
  macro: "overview",
  trainMode: "pin",
  trainScale: 0.014,
  coverage: [0, 1],
  route: [
    [0.72, 0.43],
    [0.665, 0.475],
    [0.61, 0.51],
    [0.555, 0.545],
    [0.5, 0.575]
  ],
  stations: { tokyo: 0, yokohama: 0.05, nagoya: 0.62, kyoto: 0.9, osaka: 1 },
  focus: [0.63, 0.49]
};

const TOKAIDO_CORRIDOR: PlateSpec = {
  id: "tokaido-corridor",
  url: `${ART}/lod-03-tokaido-national-corridor.webp`,
  macro: "corridor",
  trainMode: "mini",
  trainScale: 0.028,
  coverage: [0, 1],
  route: [
    [0.9, 0.33],
    [0.8, 0.39],
    [0.71, 0.44],
    [0.62, 0.49],
    [0.5, 0.5],
    [0.37, 0.47],
    [0.24, 0.5],
    [0.1, 0.52]
  ],
  stations: { tokyo: 0.02, yokohama: 0.1, nagoya: 0.62, kyoto: 0.88, osaka: 0.99 },
  focus: [0.52, 0.45]
};

const CENTRAL_HONSHU: PlateSpec = {
  id: "central-honshu",
  url: `${ART}/lod-04-central-honshu-railway.webp`,
  macro: "corridor",
  trainMode: "mini",
  trainScale: 0.04,
  coverage: [0.08, 0.62],
  route: [
    [0.97, 0.5],
    [0.8, 0.55],
    [0.65, 0.6],
    [0.5, 0.66],
    [0.32, 0.71],
    [0.1, 0.77]
  ],
  stations: {},
  focus: [0.52, 0.58]
};

const KANAGAWA: PlateSpec = {
  id: "kanagawa-corridor",
  url: `${ART}/lod-05-kanagawa-corridor.webp`,
  macro: "regional",
  trainMode: "full",
  trainScale: 0.085,
  coverage: [0.02, 0.16],
  route: [
    [0.93, 0.06],
    [0.76, 0.19],
    [0.58, 0.32],
    [0.4, 0.45],
    [0.22, 0.56],
    [0.04, 0.66]
  ],
  stations: { yokohama: 0.18 },
  focus: [0.5, 0.36],
  lanes: 2,
  laneSpread: 0.006
};

const TOKYO_APPROACH: PlateSpec = {
  id: "tokyo-approach",
  url: `${ART}/lod-06-tokyo-yokohama-approach.webp`,
  macro: "regional",
  trainMode: "full",
  trainScale: 0.1,
  coverage: [0, 0.046],
  route: [
    [0.06, 0.1],
    [0.24, 0.26],
    [0.42, 0.41],
    [0.58, 0.53],
    [0.78, 0.66],
    [0.97, 0.79]
  ],
  stations: { tokyo: 0.02, yokohama: 0.98 },
  focus: [0.5, 0.45],
  lanes: 2,
  laneSpread: 0.007
};

const CITY_PLATES: Record<string, { city: PlateSpec; close: PlateSpec }> = {
  tokyo: {
    city: {
      id: "tokyo-city",
      url: `${ART}/lod-07-tokyo-yard-city.webp`,
      macro: "city",
      trainMode: "full",
      trainScale: 0.3,
      coverage: [0, 0.02],
      route: [
        [0.52, 0.33],
        [0.38, 0.45],
        [0.24, 0.56],
        [0.1, 0.66],
        [-0.04, 0.76]
      ],
      stations: { tokyo: 0.04 },
      focus: [0.46, 0.42],
      lanes: 4,
      laneSpread: 0.016
    },
    close: {
      id: "tokyo-close",
      url: `${ART}/lod-08-tokyo-station-close.webp`,
      macro: "city",
      trainMode: "full",
      trainScale: 0.4,
      coverage: [0, 0.009],
      route: [
        [0.58, 0.34],
        [0.42, 0.47],
        [0.26, 0.6],
        [0.08, 0.74],
        [-0.06, 0.85]
      ],
      stations: { tokyo: 0.05 },
      focus: [0.45, 0.45],
      lanes: 5,
      laneSpread: 0.024
    }
  },
  yokohama: {
    city: {
      id: "yokohama-city",
      url: `${ART}/lod-09-shin-yokohama-city.webp`,
      macro: "city",
      trainMode: "full",
      trainScale: 0.28,
      coverage: [0.028, 0.064],
      route: [
        [0.88, 0.1],
        [0.66, 0.23],
        [0.44, 0.36],
        [0.22, 0.48],
        [0.02, 0.6]
      ],
      stations: { yokohama: 0.5 },
      focus: [0.45, 0.28],
      lanes: 2,
      laneSpread: 0.014
    },
    close: {
      id: "yokohama-close",
      url: `${ART}/lod-10-yokohama-station-close.webp`,
      macro: "city",
      trainMode: "full",
      trainScale: 0.36,
      coverage: [0.038, 0.054],
      route: [
        [0.02, 0.12],
        [0.24, 0.26],
        [0.46, 0.4],
        [0.68, 0.53],
        [0.92, 0.65]
      ],
      stations: { yokohama: 0.5 },
      focus: [0.45, 0.38],
      lanes: 3,
      laneSpread: 0.02
    }
  },
  nagoya: {
    city: {
      id: "nagoya-city",
      url: `${ART}/lod-11-nagoya-station-city.webp`,
      macro: "city",
      trainMode: "full",
      trainScale: 0.28,
      coverage: [0.616, 0.716],
      route: [
        [0.97, 0.2],
        [0.73, 0.32],
        [0.5, 0.45],
        [0.26, 0.57],
        [0.03, 0.69]
      ],
      stations: { nagoya: 0.5 },
      focus: [0.48, 0.4],
      lanes: 3,
      laneSpread: 0.014
    },
    close: {
      id: "nagoya-close",
      url: `${ART}/lod-12-nagoya-station-close.webp`,
      macro: "city",
      trainMode: "full",
      trainScale: 0.36,
      coverage: [0.646, 0.686],
      route: [
        [0.85, 0.5],
        [0.62, 0.37],
        [0.4, 0.24],
        [0.18, 0.11],
        [0.02, 0.02]
      ],
      stations: { nagoya: 0.5 },
      focus: [0.42, 0.35],
      lanes: 3,
      laneSpread: 0.022
    }
  },
  kyoto: {
    city: {
      id: "kyoto-city",
      url: `${ART}/lod-13-kyoto-station-city.webp`,
      macro: "city",
      trainMode: "full",
      trainScale: 0.28,
      coverage: [0.878, 0.978],
      route: [
        [0.96, 0.7],
        [0.72, 0.58],
        [0.49, 0.46],
        [0.26, 0.34],
        [0.03, 0.22]
      ],
      stations: { kyoto: 0.5 },
      focus: [0.5, 0.42],
      lanes: 3,
      laneSpread: 0.014
    },
    close: {
      id: "kyoto-close",
      url: `${ART}/lod-14-kyoto-station-close.webp`,
      macro: "city",
      trainMode: "full",
      trainScale: 0.36,
      coverage: [0.906, 0.95],
      route: [
        [0.95, 0.31],
        [0.72, 0.42],
        [0.5, 0.54],
        [0.27, 0.64],
        [0.04, 0.74]
      ],
      stations: { kyoto: 0.5 },
      focus: [0.48, 0.4],
      lanes: 3,
      laneSpread: 0.022
    }
  },
  osaka: {
    city: {
      id: "osaka-city",
      url: `${ART}/lod-15-shin-osaka-city.webp`,
      macro: "city",
      trainMode: "full",
      trainScale: 0.28,
      coverage: [0.95, 1],
      route: [
        [0.92, 0.1],
        [0.73, 0.22],
        [0.55, 0.33],
        [0.36, 0.44]
      ],
      stations: { osaka: 1 },
      focus: [0.5, 0.32],
      lanes: 4,
      laneSpread: 0.014
    },
    close: {
      id: "osaka-close",
      url: `${ART}/lod-16-shin-osaka-close.webp`,
      macro: "city",
      trainMode: "full",
      trainScale: 0.36,
      coverage: [0.978, 1],
      route: [
        [0.94, 0.06],
        [0.72, 0.23],
        [0.52, 0.38],
        [0.34, 0.52]
      ],
      stations: { osaka: 1 },
      focus: [0.5, 0.34],
      lanes: 4,
      laneSpread: 0.024
    }
  }
};

const BAND_COUNT = 8;
const ZOOM_MIN = 0;
const ZOOM_MAX = BAND_COUNT - 0.01;
const DEFAULT_ZOOM = 6.45;
/** Extra plate magnification across one band before the next plate fades in. */
const BAND_INNER_SCALE = 0.38;
const CROSSFADE_MS = 320;

const plateForBand = (band: number, focusedStationId: string): PlateSpec => {
  const cityArt = CITY_PLATES[focusedStationId] ?? CITY_PLATES.tokyo;
  switch (clamp(Math.floor(band), 0, BAND_COUNT - 1)) {
    case 0: return JAPAN_BOARD;
    case 1: return JAPAN_ATLAS;
    case 2: return TOKAIDO_CORRIDOR;
    case 3: return CENTRAL_HONSHU;
    case 4: return KANAGAWA;
    case 5: return TOKYO_APPROACH;
    case 6: return cityArt.city;
    default: return cityArt.close;
  }
};

const TRAIN_TEXTURES: Record<string, string> = {
  n700s: "/assets-generated/vehicle-alpha/train-n700s-blue.webp",
  n700a: "/assets-generated/vehicle-alpha/train-n700a-gold.webp",
  series500: "/assets-generated/vehicle-alpha/train-500series-slate.webp",
  doctor923: "/assets-generated/vehicle-alpha/train-doctor-yellow.webp"
};

/** Undirected body axis of the isometric consist sprites (nose lower-left). */
const TRAIN_SPRITE_AXIS = -0.45;

const PALETTE = {
  ink: 0x061018,
  label: 0xf2f7ec,
  blue: 0x2f76c6,
  gold: 0xd4a34e,
  glow: 0xa7d8ce
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const normalizeAngle = (angle: number) => {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
};

/** Smallest signed rotation between two undirected axes. */
const axisDelta = (from: number, to: number) => {
  let d = normalizeAngle(to - from);
  if (d > Math.PI / 2) d -= Math.PI;
  if (d < -Math.PI / 2) d += Math.PI;
  return d;
};

type RoutePose = { x: number; y: number; tangent: { x: number; y: number } };

const sampleRoute = (route: Array<[number, number]>, t: number): RoutePose => {
  if (route.length === 0) return { x: 0.5, y: 0.5, tangent: { x: 1, y: 0 } };
  if (route.length === 1) return { x: route[0][0], y: route[0][1], tangent: { x: 1, y: 0 } };
  const clamped = clamp(t, 0, 1);
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < route.length - 1; i += 1) {
    const len = Math.hypot(route[i + 1][0] - route[i][0], route[i + 1][1] - route[i][1]);
    lengths.push(len);
    total += len;
  }
  let target = total * clamped;
  for (let i = 0; i < lengths.length; i += 1) {
    if (target <= lengths[i] || i === lengths.length - 1) {
      const local = lengths[i] <= 0 ? 0 : clamp(target / lengths[i], 0, 1);
      const [ax, ay] = route[i];
      const [bx, by] = route[i + 1];
      const inv = 1 / Math.max(1e-6, lengths[i]);
      return {
        x: ax + (bx - ax) * local,
        y: ay + (by - ay) * local,
        tangent: { x: (bx - ax) * inv, y: (by - ay) * inv }
      };
    }
    target -= lengths[i];
  }
  const [lx, ly] = route[route.length - 1];
  return { x: lx, y: ly, tangent: { x: 1, y: 0 } };
};

const lineProgress = (line: Line, lat: number, lon: number) => {
  const pl = line.polyline;
  if (pl.length < 2) return 0;
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < pl.length - 1; i += 1) {
    const len = Math.hypot(pl[i + 1][0] - pl[i][0], pl[i + 1][1] - pl[i][1]);
    lengths.push(len);
    total += len;
  }
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  let acc = 0;
  for (let i = 0; i < pl.length - 1; i += 1) {
    const [aLat, aLon] = pl[i];
    const [bLat, bLon] = pl[i + 1];
    const dLat = bLat - aLat;
    const dLon = bLon - aLon;
    const len2 = dLat * dLat + dLon * dLon;
    if (len2 > 1e-12) {
      const t = clamp(((lat - aLat) * dLat + (lon - aLon) * dLon) / len2, 0, 1);
      const dist = Math.hypot(lat - (aLat + dLat * t), lon - (aLon + dLon * t));
      if (dist < bestDist) {
        bestDist = dist;
        best = (acc + lengths[i] * t) / Math.max(1e-9, total);
      }
    }
    acc += lengths[i];
  }
  return clamp(best, 0, 1);
};

const hashId = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export const initRenderer = async (
  canvas: HTMLCanvasElement,
  lines: Line[],
  stations: Station[],
  trainTypes: TrainType[]
): Promise<RenderHandles> => {
  void trainTypes;
  const app = new PIXI.Application();
  // Size the stage from the #app element, not window.innerWidth: mobile
  // browsers (and emulators) can report a layout viewport that differs from
  // the visual one, which leaves the canvas larger than the screen and pushes
  // the world off-view.
  const appShell = document.getElementById("app") ?? document.body;
  await app.init({
    canvas,
    resizeTo: appShell as HTMLElement,
    backgroundColor: 0x0a161d,
    backgroundAlpha: 1,
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

  const plateLayer = new PIXI.Container();
  plateLayer.zIndex = 0;
  const trainLayer = new PIXI.Container();
  trainLayer.zIndex = 20;
  trainLayer.sortableChildren = true;
  const stationLayer = new PIXI.Container();
  stationLayer.zIndex = 30;
  const overlayLayer = new PIXI.Container();
  overlayLayer.zIndex = 40;
  const debugLayer = new PIXI.Container();
  debugLayer.zIndex = 50;
  world.addChild(plateLayer, trainLayer, stationLayer, overlayLayer, debugLayer);

  // ---------------------------------------------------------------- state --
  const line = lines[0];
  let zoom = window.innerWidth < 760 ? DEFAULT_ZOOM - 0.25 : DEFAULT_ZOOM;
  let focusedStationId = "tokyo";
  let quality: Quality = "medium";
  let reducedMotion = false;
  let followTarget: string | null = null;
  let accuracyDebug = false;
  const routeDebug = typeof window !== "undefined" && window.location.search.includes("routedebug");
  let trainTapHandler: ((id: string) => void) | null = null;
  let stationTapHandler: ((id: string) => void) | null = null;
  let latestTrains: SimTrainState[] = [];
  let panX = 0;
  let panY = 0;

  // ----------------------------------------------------- texture pipeline --
  const MAX_CACHED_PLATES = 6;
  const plateTextures = new Map<string, PIXI.Texture>();
  const pendingTextures = new Set<string>();
  const textureLru: string[] = [];

  const touchLru = (url: string) => {
    const idx = textureLru.indexOf(url);
    if (idx >= 0) textureLru.splice(idx, 1);
    textureLru.push(url);
    while (textureLru.length > MAX_CACHED_PLATES) {
      const evict = textureLru.shift();
      if (!evict) break;
      const inUse = plateLayer.children.some(
        (child) => child instanceof PIXI.Sprite && (child as PlateSprite).plateUrl === evict
      );
      if (inUse) {
        textureLru.push(evict);
        break;
      }
      plateTextures.delete(evict);
      void PIXI.Assets.unload(evict).catch(() => undefined);
    }
  };

  const loadPlateTexture = async (url: string): Promise<PIXI.Texture | undefined> => {
    const cached = plateTextures.get(url);
    if (cached) {
      touchLru(url);
      return cached;
    }
    if (pendingTextures.has(url)) return undefined;
    pendingTextures.add(url);
    try {
      const texture = (await PIXI.Assets.load(url)) as PIXI.Texture;
      plateTextures.set(url, texture);
      touchLru(url);
      return texture;
    } catch {
      return undefined;
    } finally {
      pendingTextures.delete(url);
    }
  };

  const trainTextures = new Map<string, PIXI.Texture>();
  await Promise.all(
    Object.entries(TRAIN_TEXTURES).map(async ([key, url]) => {
      try {
        trainTextures.set(key, (await PIXI.Assets.load(url)) as PIXI.Texture);
      } catch {
        // Train sprite missing: pins are used as fallback.
      }
    })
  );

  // ------------------------------------------------------- plate transform --
  type PlateSprite = PIXI.Sprite & { plateUrl?: string };

  type PlateView = {
    spec: PlateSpec;
    texture: PIXI.Texture;
    scale: number;
    offsetX: number;
    offsetY: number;
  };

  let activeView: PlateView | null = null;
  let activeSprite: PlateSprite | null = null;
  let fadingSprites: Array<{ sprite: PlateSprite; bornAt: number }> = [];

  const bandIndex = () => clamp(Math.floor(zoom), 0, BAND_COUNT - 1);
  const bandFraction = () => clamp(zoom - bandIndex(), 0, 1);
  const activePlateSpec = () => plateForBand(bandIndex(), focusedStationId);

  const computeView = (spec: PlateSpec, texture: PIXI.Texture): PlateView => {
    const sw = app.screen.width;
    const sh = app.screen.height;
    const iw = texture.width;
    const ih = texture.height;
    const cover = Math.max(sw / iw, sh / ih);
    const scale = cover * (1 + bandFraction() * BAND_INNER_SCALE);
    let offsetX = sw / 2 - spec.focus[0] * iw * scale + panX;
    let offsetY = sh / 2 - spec.focus[1] * ih * scale + panY;
    offsetX = clamp(offsetX, sw - iw * scale, 0);
    offsetY = clamp(offsetY, sh - ih * scale, 0);
    return { spec, texture, scale, offsetX, offsetY };
  };

  const imageToScreen = (view: PlateView, nx: number, ny: number) =>
    new PIXI.Point(
      view.offsetX + nx * view.texture.width * view.scale,
      view.offsetY + ny * view.texture.height * view.scale
    );

  const routePoseToScreen = (view: PlateView, t: number) => {
    const pose = sampleRoute(view.spec.route, t);
    const point = imageToScreen(view, pose.x, pose.y);
    // Tangent in screen space: uniform scale per axis (x and y scale equally
    // because the cover transform is uniform), so only aspect of the source
    // normalized coords matters.
    const tx = pose.tangent.x * view.texture.width;
    const ty = pose.tangent.y * view.texture.height;
    const len = Math.hypot(tx, ty) || 1;
    return { point, tangent: new PIXI.Point(tx / len, ty / len) };
  };

  // -------------------------------------------------------- station chips --
  const stationSprites = new Map<string, PIXI.Container>();

  const buildStationChip = (station: Station) => {
    const chip = new PIXI.Container();
    const text = new PIXI.Text({
      text: station.name_en,
      style: {
        fontFamily: "Verdana, Trebuchet MS, sans-serif",
        fontSize: 12,
        fontWeight: "700",
        fill: PALETTE.label,
        dropShadow: { color: "#02070b", blur: 2, distance: 1, alpha: 0.9 }
      }
    });
    text.anchor.set(0.5, 1);
    text.position.set(0, -12);
    const bg = new PIXI.Graphics();
    bg.roundRect(-text.width / 2 - 8, -text.height - 18, text.width + 16, text.height + 10, 4)
      .fill({ color: PALETTE.ink, alpha: 0.66 })
      .stroke({ width: 1, color: PALETTE.glow, alpha: 0.35 });
    const dot = new PIXI.Graphics();
    dot.circle(0, 0, 4).fill({ color: PALETTE.gold, alpha: 0.95 });
    dot.circle(0, 0, 7).stroke({ width: 1.4, color: PALETTE.label, alpha: 0.75 });
    chip.addChild(bg, text, dot);
    chip.eventMode = "static";
    chip.cursor = "pointer";
    chip.on("pointertap", () => stationTapHandler?.(station.id));
    return chip;
  };

  stations.forEach((station) => {
    const chip = buildStationChip(station);
    stationLayer.addChild(chip);
    stationSprites.set(station.id, chip);
  });

  const layoutStations = () => {
    const view = activeView;
    stations.forEach((station) => {
      const chip = stationSprites.get(station.id);
      if (!chip) return;
      const anchorT = view?.spec.stations[station.id];
      if (!view || anchorT === undefined) {
        chip.visible = false;
        return;
      }
      const pose = routePoseToScreen(view, anchorT);
      chip.position.copyFrom(pose.point);
      const emphasis = station.id === focusedStationId ? 1 : 0.86;
      chip.scale.set(emphasis * (view.spec.macro === "city" ? 1.08 : 0.94));
      chip.alpha = view.spec.macro === "city" && station.id !== focusedStationId ? 0 : 1;
      chip.visible = chip.alpha > 0;
    });
  };

  // ---------------------------------------------------------- route debug --
  const layoutDebug = () => {
    debugLayer.removeChildren().forEach((node) => node.destroy({ children: true }));
    if (!routeDebug || !activeView) return;
    const g = new PIXI.Graphics();
    const steps = 64;
    for (let i = 0; i <= steps; i += 1) {
      const pose = routePoseToScreen(activeView, i / steps);
      if (i === 0) g.moveTo(pose.point.x, pose.point.y);
      else g.lineTo(pose.point.x, pose.point.y);
    }
    g.stroke({ width: 2, color: 0xff4fd8, alpha: 0.9 });
    Object.entries(activeView.spec.stations).forEach(([id, t]) => {
      if (t === undefined) return;
      const pose = routePoseToScreen(activeView!, t);
      g.circle(pose.point.x, pose.point.y, 6).stroke({ width: 2, color: 0x59d8ff, alpha: 0.95 });
      void id;
    });
    debugLayer.addChild(g);
  };

  // ------------------------------------------------------ accuracy overlay --
  const accuracyPanel = new PIXI.Container();
  accuracyPanel.visible = false;
  overlayLayer.addChild(accuracyPanel);

  const layoutAccuracyPanel = () => {
    accuracyPanel.removeChildren().forEach((node) => node.destroy({ children: true }));
    if (!accuracyDebug) return;
    const W = 264;
    const H = 170;
    const PAD = 18;
    accuracyPanel.position.set(16, app.screen.height - H - 64);

    const bg = new PIXI.Graphics();
    bg.roundRect(0, 0, W, H, 8).fill({ color: PALETTE.ink, alpha: 0.82 }).stroke({
      width: 1,
      color: PALETTE.glow,
      alpha: 0.4
    });
    accuracyPanel.addChild(bg);

    const title = new PIXI.Text({
      text: "True coordinates (debug)",
      style: { fontFamily: "Verdana, sans-serif", fontSize: 10, fontWeight: "700", fill: PALETTE.glow }
    });
    title.position.set(10, 8);
    accuracyPanel.addChild(title);

    const lats = line.polyline.map((p) => p[0]);
    const lons = line.polyline.map((p) => p[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const px = (lon: number) => PAD + ((lon - minLon) / Math.max(1e-9, maxLon - minLon)) * (W - PAD * 2);
    const py = (lat: number) => H - PAD - ((lat - minLat) / Math.max(1e-9, maxLat - minLat)) * (H - PAD * 2 - 14);

    const g = new PIXI.Graphics();
    line.polyline.forEach(([lat, lon], i) => {
      if (i === 0) g.moveTo(px(lon), py(lat));
      else g.lineTo(px(lon), py(lat));
    });
    g.stroke({ width: 1.6, color: 0x59d8ff, alpha: 0.9 });
    stations.forEach((station) => {
      g.circle(px(station.lon), py(station.lat), 3).fill({ color: PALETTE.gold, alpha: 0.95 });
    });
    accuracyPanel.addChild(g);

    const live = new PIXI.Graphics();
    live.label = "live";
    accuracyPanel.addChild(live);
    (accuracyPanel as PIXI.Container & { liveProject?: (lat: number, lon: number) => [number, number] }).liveProject =
      (lat: number, lon: number) => [px(lon), py(lat)];
  };

  const updateAccuracyTrains = () => {
    if (!accuracyDebug) return;
    const panel = accuracyPanel as PIXI.Container & {
      liveProject?: (lat: number, lon: number) => [number, number];
    };
    const live = accuracyPanel.children.find((c) => c.label === "live") as PIXI.Graphics | undefined;
    if (!live || !panel.liveProject) return;
    live.clear();
    latestTrains.forEach((train) => {
      const [x, y] = panel.liveProject!(train.lat, train.lon);
      live.circle(x, y, 2.4).fill({ color: 0xffffff, alpha: 0.95 });
    });
  };

  // --------------------------------------------------------------- plates --
  let plateGeneration = 0;

  const showPlate = async (spec: PlateSpec, immediate = false) => {
    const generation = ++plateGeneration;
    const texture = await loadPlateTexture(spec.url);
    if (!texture || generation !== plateGeneration) return;

    if (activeSprite) {
      const old = activeSprite;
      if (immediate || reducedMotion) {
        old.destroy();
      } else {
        fadingSprites.push({ sprite: old, bornAt: performance.now() });
      }
    }
    const sprite = new PIXI.Sprite(texture) as PlateSprite;
    sprite.plateUrl = spec.url;
    sprite.alpha = immediate || reducedMotion ? 1 : 0;
    plateLayer.addChild(sprite);
    activeSprite = sprite;
    activeView = computeView(spec, texture);
    layoutPlate();
    layoutStations();
    layoutDebug();
    prefetchNeighbours();
  };

  const layoutPlate = () => {
    if (!activeSprite || !activeView) return;
    activeView = computeView(activeView.spec, activeView.texture);
    activeSprite.position.set(activeView.offsetX, activeView.offsetY);
    activeSprite.scale.set(activeView.scale);
    if (routeDebug) {
      console.log(
        `[plate] ${activeView.spec.id} tex=${activeView.texture.width}x${activeView.texture.height} ` +
          `scale=${activeView.scale.toFixed(3)} offset=${activeView.offsetX.toFixed(0)},${activeView.offsetY.toFixed(0)} ` +
          `screen=${app.screen.width}x${app.screen.height} pan=${panX.toFixed(0)},${panY.toFixed(0)}`
      );
    }
    // Fading-out plates keep their last transform; they disappear quickly.
  };

  const prefetchNeighbours = () => {
    const band = bandIndex();
    [band - 1, band + 1]
      .filter((b) => b >= 0 && b < BAND_COUNT)
      .forEach((b) => void loadPlateTexture(plateForBand(b, focusedStationId).url));
  };

  const syncPlate = (immediate = false) => {
    const spec = activePlateSpec();
    if (!activeView || activeView.spec.id !== spec.id) {
      panX = 0;
      panY = 0;
      void showPlate(spec, immediate);
      return;
    }
    layoutPlate();
    layoutStations();
    layoutDebug();
  };

  // Crossfade ticker: fade the active plate in over the previous one, then
  // drop the old texture reference so the LRU can evict it.
  app.ticker.add(() => {
    const now = performance.now();
    if (activeSprite && activeSprite.alpha < 1) {
      const step = reducedMotion ? 1 : app.ticker.deltaMS / CROSSFADE_MS;
      activeSprite.alpha = Math.min(1, activeSprite.alpha + step);
    }
    if (activeSprite && activeSprite.alpha >= 1 && fadingSprites.length > 0) {
      fadingSprites = fadingSprites.filter(({ sprite, bornAt }) => {
        if (now - bornAt > CROSSFADE_MS + 80) {
          sprite.destroy();
          return false;
        }
        return true;
      });
    }
  });

  // --------------------------------------------------------------- trains --
  type TrainVisual = {
    container: PIXI.Container;
    sprite: PIXI.Sprite | null;
    pin: PIXI.Graphics;
    mode: TrainMode | null;
    displayX: number;
    displayY: number;
    rotation: number;
    hasDisplay: boolean;
    lastProgress: number;
    direction: 1 | -1;
  };

  const trainSprites = new Map<string, PIXI.Container>();
  const trainVisuals = new Map<string, TrainVisual>();

  const ensureTrainVisual = (train: SimTrainState): TrainVisual => {
    let visual = trainVisuals.get(train.id);
    if (visual) return visual;
    const container = new PIXI.Container();
    container.eventMode = "static";
    container.cursor = "pointer";
    container.on("pointertap", () => trainTapHandler?.(train.id));

    const texture = trainTextures.get(train.trainTypeId) ?? trainTextures.get("n700s") ?? null;
    let sprite: PIXI.Sprite | null = null;
    if (texture) {
      sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5, 0.56);
      container.addChild(sprite);
    }
    const pin = new PIXI.Graphics();
    pin.circle(0, 0, 5).fill({ color: 0xffffff, alpha: 0.95 });
    pin.circle(0, 0, 9).stroke({ width: 2, color: PALETTE.blue, alpha: 0.8 });
    pin.circle(0, 0, 13).stroke({ width: 1, color: PALETTE.glow, alpha: 0.3 });
    container.addChild(pin);

    trainLayer.addChild(container);
    visual = {
      container,
      sprite,
      pin,
      mode: null,
      displayX: 0,
      displayY: 0,
      rotation: 0,
      hasDisplay: false,
      lastProgress: -1,
      direction: 1
    };
    trainVisuals.set(train.id, visual);
    trainSprites.set(train.id, container);
    return visual;
  };

  const removeTrainVisual = (id: string) => {
    const visual = trainVisuals.get(id);
    if (!visual) return;
    visual.container.destroy({ children: true });
    trainVisuals.delete(id);
    trainSprites.delete(id);
  };

  const updateTrains = (trains: SimTrainState[]) => {
    const view = activeView;
    const seen = new Set<string>();
    if (view) {
      const [c0, c1] = view.spec.coverage;
      const span = Math.max(1e-6, c1 - c0);
      const margin = span * 0.06;
      const plateWidthScreen = view.texture.width * view.scale;
      const dwellSlots = new Map<string, number>();

      trains.forEach((train) => {
        const p = lineProgress(line, train.lat, train.lon);
        if (p < c0 - margin || p > c1 + margin) {
          const existing = trainVisuals.get(train.id);
          if (existing) existing.container.visible = false;
          seen.add(train.id);
          return;
        }
        const visual = ensureTrainVisual(train);
        seen.add(train.id);
        visual.container.visible = true;

        if (visual.lastProgress >= 0 && Math.abs(p - visual.lastProgress) > 1e-7) {
          visual.direction = p > visual.lastProgress ? 1 : -1;
        }
        visual.lastProgress = p;

        const t = clamp((p - c0) / span, 0, 1);
        const pose = routePoseToScreen(view, t);

        // Seat the train on a plausible track: moving services keep to a side
        // by direction, dwelling services spread across the platform lanes.
        const lanes = view.spec.lanes ?? 1;
        const spread = (view.spec.laneSpread ?? 0) * plateWidthScreen;
        let laneOffset = 0;
        if (lanes > 1 && spread > 0) {
          if (train.status === "dwell" || train.status === "idle") {
            const key = train.nextStationId ?? "terminal";
            const slot = dwellSlots.get(key) ?? 0;
            dwellSlots.set(key, slot + 1);
            const lane = (slot % lanes) - (lanes - 1) / 2;
            laneOffset = lane * spread;
          } else {
            laneOffset = visual.direction * spread * 0.5;
          }
        }
        const nx = -pose.tangent.y;
        const ny = pose.tangent.x;
        const targetX = pose.point.x + nx * laneOffset;
        const targetY = pose.point.y + ny * laneOffset;

        if (!visual.hasDisplay || Math.hypot(targetX - visual.displayX, targetY - visual.displayY) > 320) {
          visual.displayX = targetX;
          visual.displayY = targetY;
          visual.hasDisplay = true;
        } else {
          const blend = reducedMotion ? 1 : 0.16;
          visual.displayX += (targetX - visual.displayX) * blend;
          visual.displayY += (targetY - visual.displayY) * blend;
        }
        visual.container.position.set(visual.displayX, visual.displayY);
        visual.container.zIndex = visual.displayY;

        const mode = view.spec.trainMode;
        const usePin = mode === "pin" || !visual.sprite;
        visual.pin.visible = usePin;
        if (visual.sprite) visual.sprite.visible = !usePin;
        visual.mode = mode;

        if (!usePin && visual.sprite) {
          const sprite = visual.sprite;
          const targetLength = view.spec.trainScale * plateWidthScreen * (mode === "mini" ? 0.85 : 1);
          const scale = targetLength / sprite.texture.width;

          const theta = Math.atan2(pose.tangent.y, pose.tangent.x);
          // The consist sprites are double-ended, so we only align the body
          // axis with the rail; mirroring picks whichever of the two isometric
          // diagonals needs the smaller residual rotation.
          const plain = axisDelta(TRAIN_SPRITE_AXIS, theta);
          const mirrored = axisDelta(Math.PI - TRAIN_SPRITE_AXIS, theta);
          const useMirror = Math.abs(mirrored) < Math.abs(plain);
          const desired = clamp(useMirror ? mirrored : plain, -0.6, 0.6);
          const blend = reducedMotion || quality === "low" ? 1 : 0.2;
          visual.rotation += normalizeAngle(desired - visual.rotation) * blend;
          sprite.rotation = visual.rotation;
          sprite.scale.set(useMirror ? -scale : scale, scale);
        } else {
          const pinScale = view.spec.macro === "overview" ? 0.8 : 1;
          visual.pin.scale.set(pinScale);
        }
      });
    }

    Array.from(trainVisuals.keys()).forEach((id) => {
      if (!seen.has(id)) removeTrainVisual(id);
    });
    updateAccuracyTrains();
  };

  // ------------------------------------------------------------ camera ops --
  let zoomTweenTarget: number | null = null;

  const setZoomImmediate = (next: number) => {
    const clamped = clamp(next, ZOOM_MIN, ZOOM_MAX);
    if (Math.abs(clamped - zoom) < 1e-4) return;
    const bandBefore = bandIndex();
    zoom = clamped;
    if (bandIndex() !== bandBefore) {
      syncPlate();
    } else {
      layoutPlate();
      layoutStations();
      layoutDebug();
    }
    updateTrains(latestTrains);
  };

  const zoomTo = (next: number) => {
    if (reducedMotion) {
      zoomTweenTarget = null;
      setZoomImmediate(next);
      return;
    }
    zoomTweenTarget = clamp(next, ZOOM_MIN, ZOOM_MAX);
  };

  app.ticker.add(() => {
    if (zoomTweenTarget === null) return;
    const delta = zoomTweenTarget - zoom;
    if (Math.abs(delta) < 0.005) {
      setZoomImmediate(zoomTweenTarget);
      zoomTweenTarget = null;
      return;
    }
    setZoomImmediate(zoom + delta * Math.min(1, app.ticker.deltaMS / 140));
  });

  const focusStation = (id: string) => {
    const station = stations.find((s) => s.id === id);
    if (!station) return;
    const changed = focusedStationId !== station.id;
    focusedStationId = station.id;
    if (changed && bandIndex() >= 6) {
      syncPlate();
      updateTrains(latestTrains);
    }
    if (zoom < 6) zoomTo(6.45);
  };

  const setViewMode = (mode: "japan" | "corridor" | "station") => {
    if (mode === "japan") zoomTo(0.5);
    else if (mode === "corridor") zoomTo(2.4);
    else zoomTo(zoom >= 6 ? zoom : 6.45);
  };

  const resetView = () => {
    panX = 0;
    panY = 0;
    focusedStationId = "tokyo";
    zoomTo(DEFAULT_ZOOM);
    syncPlate();
  };

  // ---------------------------------------------------------- interaction --
  const pointers = new Map<number, PIXI.Point>();
  let pinchBaseDist = 0;
  let pinchBaseZoom = 0;

  app.stage.on("pointerdown", (e) => {
    pointers.set(e.pointerId, new PIXI.Point(e.global.x, e.global.y));
    if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      pinchBaseDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchBaseZoom = zoom;
    }
  });
  app.stage.on("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const next = new PIXI.Point(e.global.x, e.global.y);
    if (pointers.size === 1) {
      panX += next.x - prev.x;
      panY += next.y - prev.y;
      layoutPlate();
      layoutStations();
      layoutDebug();
      updateTrains(latestTrains);
    } else if (pointers.size === 2) {
      pointers.set(e.pointerId, next);
      const [a, b] = Array.from(pointers.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchBaseDist > 0) {
        zoomTweenTarget = null;
        setZoomImmediate(pinchBaseZoom + Math.log2(dist / pinchBaseDist) * 1.4);
      }
      return;
    }
    pointers.set(e.pointerId, next);
  });
  const releasePointer = (e: PIXI.FederatedPointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchBaseDist = 0;
  };
  app.stage.on("pointerup", releasePointer);
  app.stage.on("pointerupoutside", releasePointer);
  app.stage.on("pointercancel", releasePointer);

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoomTweenTarget = null;
      setZoomImmediate(zoom - e.deltaY * 0.0016);
    },
    { passive: false }
  );

  app.renderer.on("resize", () => {
    layoutPlate();
    layoutStations();
    layoutDebug();
    layoutAccuracyPanel();
    updateTrains(latestTrains);
  });

  // ---------------------------------------------------------------- public --
  const toScreen = (lat: number, lon: number) => {
    const view = activeView;
    if (!view) return new PIXI.Point(app.screen.width / 2, app.screen.height / 2);
    const [c0, c1] = view.spec.coverage;
    const span = Math.max(1e-6, c1 - c0);
    const p = lineProgress(line, lat, lon);
    const t = (p - c0) / span;
    const clampedT = clamp(t, 0, 1);
    const pose = routePoseToScreen(view, clampedT);
    // Off-plate positions are pushed along the route tangent so audio
    // proximity falls away smoothly instead of pinning to the plate edge.
    const overflow = (t - clampedT) * view.texture.width * view.scale;
    return new PIXI.Point(pose.point.x + pose.tangent.x * overflow, pose.point.y + pose.tangent.y * overflow);
  };

  const update = (trains: SimTrainState[]) => {
    latestTrains = trains;
    updateTrains(trains);

    if (followTarget) {
      const visual = trainVisuals.get(followTarget);
      if (visual && visual.container.visible) {
        const dx = app.screen.width / 2 - visual.displayX;
        const dy = app.screen.height / 2 - visual.displayY;
        const amount = reducedMotion ? 1 : 0.05;
        panX += dx * amount;
        panY += dy * amount;
        layoutPlate();
        layoutStations();
        layoutDebug();
      }
    }
  };

  if (routeDebug) {
    (window as Window & { __plateDebug?: unknown }).__plateDebug = () =>
      plateLayer.children.map((child) => ({
        url: (child as PlateSprite).plateUrl,
        alpha: child.alpha,
        x: child.x,
        y: child.y,
        scale: (child as PIXI.Sprite).scale.x,
        visible: child.visible
      }));
  }

  // Initial view.
  syncPlate(true);
  await loadPlateTexture(activePlateSpec().url);

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
    setQuality: (next) => {
      quality = next;
    },
    setAccuracyDebug: (enabled) => {
      accuracyDebug = enabled;
      accuracyPanel.visible = enabled;
      document.body.classList.toggle("accuracy-debug", enabled);
      layoutAccuracyPanel();
    },
    zoomBy: (factor) => {
      zoomTo((zoomTweenTarget ?? zoom) + Math.log2(factor) * 0.9);
    },
    setZoom: (next) => {
      zoomTo(next);
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
    getZoom: () => zoomTweenTarget ?? zoom,
    getZoomRange: () => ({ min: ZOOM_MIN, max: ZOOM_MAX }),
    getStats: () => ({
      trains: Array.from(trainVisuals.values()).filter((v) => v.container.visible).length,
      trackSprites: plateTextures.size,
      landmarks: 0,
      detailLevel: bandIndex() + 1,
      detailIndex: bandIndex(),
      view: activeView?.spec.macro ?? "city",
      routeMode: activeView?.spec.id ?? "loading",
      trainMode: activeView?.spec.trainMode ?? "full",
      platformDetail: 0,
      loadedCityArt: plateTextures.size,
      pendingCityArt: pendingTextures.size,
      accuracyDebug
    })
  };
};
