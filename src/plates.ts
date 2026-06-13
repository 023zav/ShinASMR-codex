import { Line } from "./data/types";

export type MacroView = "overview" | "regional" | "corridor" | "city";
export type TrainMode = "pin" | "mini" | "full";

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
export type PlateSpec = {
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

// Asset URLs are resolved against Vite's base so the build works both at the
// dev-server root and the GitHub Pages "/ShinASMR-codex/" subpath. BASE_URL
// always ends in a slash.
const BASE = import.meta.env.BASE_URL;
const ART = `${BASE}assets-generated/lod-style-v2`;

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

const NAGOYA_REGIONAL: PlateSpec = {
  id: "nagoya-regional",
  url: `${ART}/lod-r1-nagoya-regional-corridor.webp`,
  macro: "regional",
  trainMode: "full",
  trainScale: 0.085,
  coverage: [0.45, 0.8],
  route: [
    [1.0, 0.14],
    [0.85, 0.225],
    [0.7, 0.32],
    [0.55, 0.425],
    [0.405, 0.525],
    [0.285, 0.62],
    [0.15, 0.745],
    [0.0, 0.875]
  ],
  stations: { nagoya: 0.62 },
  focus: [0.46, 0.42],
  lanes: 2,
  laneSpread: 0.006
};

const NAGOYA_APPROACH: PlateSpec = {
  id: "nagoya-approach",
  url: `${ART}/lod-r2-nagoya-approach.webp`,
  macro: "regional",
  trainMode: "full",
  trainScale: 0.1,
  coverage: [0.6, 0.73],
  route: [
    [1.0, 0.125],
    [0.8, 0.285],
    [0.6, 0.44],
    [0.39, 0.575],
    [0.225, 0.7],
    [0.0, 0.875]
  ],
  stations: { nagoya: 0.51 },
  focus: [0.5, 0.42],
  lanes: 2,
  laneSpread: 0.007
};

const KANSAI_REGIONAL: PlateSpec = {
  id: "kansai-regional",
  url: `${ART}/lod-r3-kansai-regional-corridor.webp`,
  macro: "regional",
  trainMode: "full",
  trainScale: 0.085,
  coverage: [0.85, 1],
  route: [
    [1.0, 0.31],
    [0.86, 0.39],
    [0.7, 0.46],
    [0.55, 0.55],
    [0.42, 0.66],
    [0.2, 0.775],
    [0.0, 0.86]
  ],
  stations: { kyoto: 0.52, osaka: 1 },
  focus: [0.48, 0.52],
  lanes: 2,
  laneSpread: 0.006
};

const KANSAI_APPROACH: PlateSpec = {
  id: "kansai-approach",
  url: `${ART}/lod-r4-kansai-approach.webp`,
  macro: "regional",
  trainMode: "full",
  trainScale: 0.1,
  coverage: [0.92, 1],
  route: [
    [0.0, 0.105],
    [0.2, 0.28],
    [0.37, 0.425],
    [0.6, 0.605],
    [0.8, 0.745],
    [1.0, 0.885]
  ],
  stations: { kyoto: 0.09, osaka: 0.97 },
  focus: [0.5, 0.44],
  lanes: 2,
  laneSpread: 0.007
};

/**
 * Bands 4-5 resolve per focused station the same way the city bands do:
 * the Tokyo/Yokohama focus keeps the original Kanagawa pair, Nagoya and
 * Kyoto/Shin-Osaka get their own regional + approach plates.
 */
export const REGIONAL_PLATES: Record<string, { regional: PlateSpec; approach: PlateSpec }> = {
  tokyo: { regional: KANAGAWA, approach: TOKYO_APPROACH },
  yokohama: { regional: KANAGAWA, approach: TOKYO_APPROACH },
  nagoya: { regional: NAGOYA_REGIONAL, approach: NAGOYA_APPROACH },
  kyoto: { regional: KANSAI_REGIONAL, approach: KANSAI_APPROACH },
  osaka: { regional: KANSAI_REGIONAL, approach: KANSAI_APPROACH }
};

export const CITY_PLATES: Record<string, { city: PlateSpec; close: PlateSpec }> = {
  tokyo: {
    city: {
      id: "tokyo-city",
      url: `${ART}/lod-07-tokyo-yard-city.webp`,
      macro: "city",
      trainMode: "full",
      trainScale: 0.3,
      coverage: [0, 0.02],
      route: [
        [0.56, 0.3],
        [0.4, 0.44],
        [0.22, 0.6],
        [0.0, 0.79]
      ],
      stations: { tokyo: 0.04 },
      focus: [0.42, 0.44],
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
        [0.5, 0.628],
        [0.66, 0.578],
        [0.823, 0.528],
        [1.0, 0.472]
      ],
      stations: { tokyo: 0.05 },
      focus: [0.55, 0.52],
      lanes: 5,
      laneSpread: 0.02
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
        [0.78, 0.05],
        [0.62, 0.185],
        [0.5, 0.285],
        [0.36, 0.405],
        [0.22, 0.525],
        [0.0, 0.71]
      ],
      stations: { yokohama: 0.5 },
      focus: [0.45, 0.33],
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
        [0.0, 0.165],
        [0.2, 0.32],
        [0.4, 0.47],
        [0.52, 0.545],
        [0.66, 0.615],
        [0.82, 0.72],
        [1.0, 0.84]
      ],
      stations: { yokohama: 0.5 },
      focus: [0.42, 0.46],
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
        [1.0, 0.04],
        [0.85, 0.16],
        [0.7, 0.29],
        [0.55, 0.42],
        [0.4, 0.55],
        [0.27, 0.675],
        [0.1, 0.82],
        [0.0, 0.9]
      ],
      stations: { nagoya: 0.5 },
      focus: [0.48, 0.45],
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
        [0.62, 0.0],
        [0.45, 0.136],
        [0.3, 0.256],
        [0.15, 0.376],
        [0.0, 0.496]
      ],
      stations: { nagoya: 0.5 },
      focus: [0.38, 0.28],
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
        [0.85, 0.0],
        [0.7, 0.124],
        [0.63, 0.18],
        [0.52, 0.27]
      ],
      stations: { osaka: 1 },
      focus: [0.58, 0.22],
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

export const BAND_COUNT = 8;
export const ZOOM_MIN = 0;
export const ZOOM_MAX = BAND_COUNT - 0.01;
/**
 * Open on the regional viaduct tableau (band 4): full trains in a calm
 * landscape, with room to zoom both ways, instead of a station close-up.
 */
export const DEFAULT_ZOOM = 4.45;
/** Extra plate magnification across one band before the next plate fades in. */
export const BAND_INNER_SCALE = 0.38;
export const CROSSFADE_MS = 460;

export const plateForBand = (band: number, focusedStationId: string): PlateSpec => {
  const cityArt = CITY_PLATES[focusedStationId] ?? CITY_PLATES.tokyo;
  const regionalArt = REGIONAL_PLATES[focusedStationId] ?? REGIONAL_PLATES.tokyo;
  switch (clamp(Math.floor(band), 0, BAND_COUNT - 1)) {
    case 0:
      return JAPAN_BOARD;
    case 1:
      return JAPAN_ATLAS;
    case 2:
      return TOKAIDO_CORRIDOR;
    case 3:
      return CENTRAL_HONSHU;
    case 4:
      return regionalArt.regional;
    case 5:
      return regionalArt.approach;
    case 6:
      return cityArt.city;
    default:
      return cityArt.close;
  }
};

export const TRAIN_TEXTURES: Record<string, string> = {
  n700s: `${BASE}assets-generated/vehicle-alpha/train-n700s-blue.webp`,
  n700a: `${BASE}assets-generated/vehicle-alpha/train-n700a-gold.webp`,
  series500: `${BASE}assets-generated/vehicle-alpha/train-500series-slate.webp`,
  doctor923: `${BASE}assets-generated/vehicle-alpha/train-doctor-yellow.webp`
};

/** Undirected body axis of the isometric consist sprites (nose lower-left). */
export const TRAIN_SPRITE_AXIS = -0.45;

export const PALETTE = {
  ink: 0x061018,
  label: 0xf2f7ec,
  blue: 0x2f76c6,
  gold: 0xd4a34e,
  glow: 0xa7d8ce
};

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export type AmbientGrade = { r: number; g: number; b: number };

/**
 * Day/night color grade keyframes over the 24h sim clock (minutes), as a
 * multiplicative tint on the art plates. Deliberately subtle: the plates
 * stay readable, the world just cools down at night and warms at the
 * golden hours.
 */
const AMBIENT_KEYFRAMES: Array<[number, AmbientGrade]> = [
  [0, { r: 0.74, g: 0.78, b: 0.94 }], // deep night
  [270, { r: 0.74, g: 0.78, b: 0.94 }], // 04:30 still night
  [330, { r: 0.97, g: 0.88, b: 0.86 }], // 05:30 dawn blush
  [420, { r: 1, g: 1, b: 1 }], // 07:00 full day
  [990, { r: 1, g: 1, b: 1 }], // 16:30 late afternoon
  [1110, { r: 1, g: 0.9, b: 0.8 }], // 18:30 dusk gold
  [1170, { r: 0.74, g: 0.78, b: 0.94 }], // 19:30 night again
  [1440, { r: 0.74, g: 0.78, b: 0.94 }]
];

/** Multiplicative plate tint for a sim clock time, interpolated between phases. */
export const ambientGradeForMinutes = (minutes: number): AmbientGrade => {
  const m = ((minutes % 1440) + 1440) % 1440;
  for (let i = 0; i < AMBIENT_KEYFRAMES.length - 1; i += 1) {
    const [t0, c0] = AMBIENT_KEYFRAMES[i];
    const [t1, c1] = AMBIENT_KEYFRAMES[i + 1];
    if (m >= t0 && m <= t1) {
      const f = t1 === t0 ? 0 : (m - t0) / (t1 - t0);
      return {
        r: c0.r + (c1.r - c0.r) * f,
        g: c0.g + (c1.g - c0.g) * f,
        b: c0.b + (c1.b - c0.b) * f
      };
    }
  }
  return { r: 1, g: 1, b: 1 };
};

export const gradeToTint = (grade: AmbientGrade) =>
  (Math.round(clamp(grade.r, 0, 1) * 255) << 16) |
  (Math.round(clamp(grade.g, 0, 1) * 255) << 8) |
  Math.round(clamp(grade.b, 0, 1) * 255);

export const normalizeAngle = (angle: number) => {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
};

/** Smallest signed rotation between two undirected axes. */
export const axisDelta = (from: number, to: number) => {
  let d = normalizeAngle(to - from);
  if (d > Math.PI / 2) d -= Math.PI;
  if (d < -Math.PI / 2) d += Math.PI;
  return d;
};

export type RoutePose = { x: number; y: number; tangent: { x: number; y: number } };

export const sampleRoute = (route: Array<[number, number]>, t: number): RoutePose => {
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

export const lineProgress = (line: Line, lat: number, lon: number) => {
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
