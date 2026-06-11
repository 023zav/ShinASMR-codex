import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  BAND_COUNT,
  CITY_PLATES,
  PlateSpec,
  TRAIN_TEXTURES,
  TRAIN_SPRITE_AXIS,
  ambientGradeForMinutes,
  axisDelta,
  gradeToTint,
  lineProgress,
  plateForBand,
  sampleRoute
} from "../src/plates";
import linesSeed from "../src/data/seed/lines.json";
import stationsSeed from "../src/data/seed/stations.json";
import { LinesSchema, StationsSchema } from "../src/data/types";

const lines = LinesSchema.parse(linesSeed);
const stations = StationsSchema.parse(stationsSeed);
const tokaido = lines[0];

const allPlates = (): PlateSpec[] => {
  const plates = new Map<string, PlateSpec>();
  for (const station of Object.keys(CITY_PLATES)) {
    for (let band = 0; band < BAND_COUNT; band += 1) {
      const plate = plateForBand(band, station);
      plates.set(plate.id, plate);
    }
  }
  return Array.from(plates.values());
};

describe("plate ladder invariants", () => {
  it("resolves a plate for every band and focus station", () => {
    for (const station of stations) {
      for (let band = 0; band < BAND_COUNT; band += 1) {
        expect(plateForBand(band, station.id)).toBeDefined();
      }
    }
  });

  it("city bands resolve per focused station", () => {
    const ids = new Set(stations.map((s) => plateForBand(7, s.id).id));
    expect(ids.size).toBe(stations.length);
  });

  it("regional bands resolve per focused region", () => {
    // Tokyo and Yokohama share the Kanagawa pair; Nagoya and Kansai get
    // their own regional + approach plates.
    for (const band of [4, 5]) {
      expect(plateForBand(band, "tokyo").id).toBe(plateForBand(band, "yokohama").id);
      expect(plateForBand(band, "kyoto").id).toBe(plateForBand(band, "osaka").id);
      const ids = new Set(
        ["tokyo", "nagoya", "kyoto"].map((station) => plateForBand(band, station).id)
      );
      expect(ids.size).toBe(3);
    }
  });

  it("regional plates cover their focused station's line progress", () => {
    const anchors: Record<string, number> = {
      tokyo: 0,
      yokohama: 0.0458,
      nagoya: 0.6657,
      kyoto: 0.9275,
      osaka: 1
    };
    for (const [station, progress] of Object.entries(anchors)) {
      for (const band of [4, 5]) {
        const plate = plateForBand(band, station);
        expect(progress).toBeGreaterThanOrEqual(plate.coverage[0] - 0.05);
        expect(progress).toBeLessThanOrEqual(plate.coverage[1] + 0.05);
      }
    }
  });

  it.each(allPlates().map((p) => [p.id, p] as const))("%s declares sane data", (_id, plate) => {
    // Coverage is an ordered slice of real line progress.
    expect(plate.coverage[0]).toBeGreaterThanOrEqual(0);
    expect(plate.coverage[1]).toBeLessThanOrEqual(1);
    expect(plate.coverage[0]).toBeLessThan(plate.coverage[1]);

    // The authored route must be a usable polyline near the image frame.
    expect(plate.route.length).toBeGreaterThanOrEqual(2);
    for (const [x, y] of plate.route) {
      expect(x).toBeGreaterThanOrEqual(-0.2);
      expect(x).toBeLessThanOrEqual(1.2);
      expect(y).toBeGreaterThanOrEqual(-0.2);
      expect(y).toBeLessThanOrEqual(1.2);
    }

    // Station anchors live on the route parameterization.
    for (const t of Object.values(plate.stations)) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }

    expect(plate.focus[0]).toBeGreaterThan(0);
    expect(plate.focus[0]).toBeLessThan(1);
    expect(plate.focus[1]).toBeGreaterThan(0);
    expect(plate.focus[1]).toBeLessThan(1);
  });

  it.each(allPlates().map((p) => [p.id, p.url] as const))(
    "%s artwork exists on disk",
    (_id, url) => {
      expect(existsSync(resolve(__dirname, "..", "public", url.replace(/^\//, "")))).toBe(true);
    }
  );

  it("train consist sprites exist on disk", () => {
    for (const url of Object.values(TRAIN_TEXTURES)) {
      expect(existsSync(resolve(__dirname, "..", "public", url.replace(/^\//, "")))).toBe(true);
    }
  });
});

describe("sampleRoute", () => {
  it("walks a polyline by arc length", () => {
    const route: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [1, 1]
    ];
    expect(sampleRoute(route, 0)).toMatchObject({ x: 0, y: 0 });
    expect(sampleRoute(route, 1)).toMatchObject({ x: 1, y: 1 });
    // Halfway along total length 2 is the corner.
    const mid = sampleRoute(route, 0.5);
    expect(mid.x).toBeCloseTo(1, 5);
    expect(mid.y).toBeCloseTo(0, 5);
    // Quarter point sits mid-first-segment with a horizontal tangent.
    const quarter = sampleRoute(route, 0.25);
    expect(quarter.x).toBeCloseTo(0.5, 5);
    expect(quarter.tangent.x).toBeCloseTo(1, 5);
    expect(quarter.tangent.y).toBeCloseTo(0, 5);
  });

  it("clamps out-of-range parameters", () => {
    const route: Array<[number, number]> = [
      [0.2, 0.2],
      [0.8, 0.8]
    ];
    expect(sampleRoute(route, -1)).toMatchObject({ x: 0.2, y: 0.2 });
    expect(sampleRoute(route, 2).x).toBeCloseTo(0.8, 5);
  });
});

describe("lineProgress", () => {
  it("matches the real Tokaido station order and spacing", () => {
    const progress = Object.fromEntries(
      stations.map((s) => [s.id, lineProgress(tokaido, s.lat, s.lon)])
    );
    expect(progress.tokyo).toBeCloseTo(0, 3);
    expect(progress.yokohama).toBeCloseTo(0.0458, 2);
    expect(progress.nagoya).toBeCloseTo(0.6657, 2);
    expect(progress.kyoto).toBeCloseTo(0.9275, 2);
    expect(progress.osaka).toBeCloseTo(1, 3);
  });

  it("is monotonic along the corridor", () => {
    const ordered = ["tokyo", "yokohama", "nagoya", "kyoto", "osaka"].map((id) => {
      const s = stations.find((st) => st.id === id)!;
      return lineProgress(tokaido, s.lat, s.lon);
    });
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i]).toBeGreaterThan(ordered[i - 1]);
    }
  });
});

describe("ambientGradeForMinutes (day/night grade)", () => {
  it("is neutral during the day and cool at night", () => {
    expect(ambientGradeForMinutes(720)).toEqual({ r: 1, g: 1, b: 1 });
    const night = ambientGradeForMinutes(60);
    expect(night.b).toBeGreaterThan(night.r);
    expect(night.r).toBeLessThan(1);
  });

  it("stays subtle: every channel within [0.7, 1]", () => {
    for (let m = 0; m < 1440; m += 10) {
      const grade = ambientGradeForMinutes(m);
      for (const channel of [grade.r, grade.g, grade.b]) {
        expect(channel).toBeGreaterThanOrEqual(0.7);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });

  it("interpolates smoothly across phase boundaries", () => {
    for (let m = 0; m < 1440; m += 5) {
      const a = ambientGradeForMinutes(m);
      const b = ambientGradeForMinutes(m + 5);
      expect(Math.abs(a.r - b.r)).toBeLessThan(0.03);
      expect(Math.abs(a.g - b.g)).toBeLessThan(0.03);
      expect(Math.abs(a.b - b.b)).toBeLessThan(0.03);
    }
  });

  it("wraps the clock and converts to a tint", () => {
    expect(ambientGradeForMinutes(-60)).toEqual(ambientGradeForMinutes(1380));
    expect(gradeToTint({ r: 1, g: 1, b: 1 })).toBe(0xffffff);
    expect(gradeToTint(ambientGradeForMinutes(60))).not.toBe(0xffffff);
  });
});

describe("axisDelta (train alignment)", () => {
  it("returns zero when the rail matches the sprite axis", () => {
    expect(axisDelta(TRAIN_SPRITE_AXIS, TRAIN_SPRITE_AXIS)).toBeCloseTo(0, 6);
    // Undirected: the opposite travel direction also needs no rotation.
    expect(axisDelta(TRAIN_SPRITE_AXIS, TRAIN_SPRITE_AXIS + Math.PI)).toBeCloseTo(0, 6);
  });

  it("prefers the mirrored diagonal for the opposite isometric slope", () => {
    const theta = -TRAIN_SPRITE_AXIS; // other 2:1 diagonal
    const plain = Math.abs(axisDelta(TRAIN_SPRITE_AXIS, theta));
    const mirrored = Math.abs(axisDelta(Math.PI - TRAIN_SPRITE_AXIS, theta));
    expect(mirrored).toBeLessThan(plain);
  });

  it("stays within a quarter turn", () => {
    for (let theta = -Math.PI; theta <= Math.PI; theta += 0.1) {
      expect(Math.abs(axisDelta(TRAIN_SPRITE_AXIS, theta))).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
    }
  });
});
