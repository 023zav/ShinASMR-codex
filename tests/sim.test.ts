import { beforeEach, describe, expect, it } from "vitest";
import { Simulation } from "../src/sim";
import linesSeed from "../src/data/seed/lines.json";
import stationsSeed from "../src/data/seed/stations.json";
import trainTypesSeed from "../src/data/seed/train_types.json";
import servicesSeed from "../src/data/seed/services.json";
import runtimeSeed from "../src/data/derived_runtime.json";
import {
  DerivedRuntimeSchema,
  LinesSchema,
  ServicesSchema,
  StationsSchema,
  TrainTypesSchema
} from "../src/data/types";

const lines = LinesSchema.parse(linesSeed);
const stations = StationsSchema.parse(stationsSeed);
const trainTypes = TrainTypesSchema.parse(trainTypesSeed);
const services = ServicesSchema.parse(servicesSeed);
const runtime = DerivedRuntimeSchema.parse(runtimeSeed);

const parseClock = (clock: string) => {
  const [h, m] = clock.split(":").map(Number);
  return h * 60 + m;
};

let sim: Simulation;

beforeEach(() => {
  sim = new Simulation(lines, services, stations, trainTypes, runtime);
});

describe("Simulation.getTrainStates", () => {
  const service = services[0];
  const firstStop = service.stops[0];
  const secondStop = service.stops[1];

  it("marks services inactive before their first arrival", () => {
    sim.setTime(parseClock(firstStop.arrival) - 30);
    const state = sim.getTrainStates().find((s) => s.id === service.id)!;
    expect(state.status).toBe("inactive");
  });

  it("dwells at the origin station between arrival and departure", () => {
    sim.setTime(parseClock(firstStop.arrival) + 0.5);
    const state = sim.getTrainStates().find((s) => s.id === service.id)!;
    expect(state.status).toBe("dwell");
    expect(state.speedKmh).toBe(0);
    const origin = stations.find((s) => s.id === firstStop.station_id)!;
    expect(state.lat).toBeCloseTo(origin.lat, 2);
    expect(state.lon).toBeCloseTo(origin.lon, 2);
  });

  it("moves between stations with interpolated position and speed", () => {
    const depart = parseClock(firstStop.departure);
    const arrive = parseClock(secondStop.arrival);
    sim.setTime((depart + arrive) / 2);
    const state = sim.getTrainStates().find((s) => s.id === service.id)!;
    expect(state.status).toBe("moving");
    expect(state.speedKmh).toBeGreaterThan(0);
    expect(state.progress).toBeGreaterThan(0);
    expect(state.progress).toBeLessThan(1);
    expect(state.nextStationId).toBe(secondStop.station_id);
  });

  it("reports lineFraction consistent with the leg being travelled", () => {
    const depart = parseClock(firstStop.departure);
    const arrive = parseClock(secondStop.arrival);
    sim.setTime((depart + arrive) / 2);
    const state = sim.getTrainStates().find((s) => s.id === service.id)!;
    const lineRuntime = runtime.line_runtime.find((l) => l.id === service.line_id)!;
    const total = lineRuntime.cumulative_lengths_m[lineRuntime.cumulative_lengths_m.length - 1];
    const fromFrac = (lineRuntime.station_offsets_m[firstStop.station_id] ?? 0) / total;
    const toFrac = (lineRuntime.station_offsets_m[secondStop.station_id] ?? 0) / total;
    const [lo, hi] = fromFrac < toFrac ? [fromFrac, toFrac] : [toFrac, fromFrac];
    expect(state.lineFraction).toBeGreaterThanOrEqual(lo);
    expect(state.lineFraction).toBeLessThanOrEqual(hi);
  });

  it("goes idle at the terminal after the last arrival", () => {
    const lastStop = service.stops[service.stops.length - 1];
    sim.setTime(parseClock(lastStop.departure) + 3);
    const state = sim.getTrainStates().find((s) => s.id === service.id)!;
    expect(state.status).toBe("idle");
    expect(state.nextStationId).toBeNull();
  });

  it("keeps every active state within the line bounds", () => {
    for (let minutes = 0; minutes < 1440; minutes += 45) {
      sim.setTime(minutes);
      for (const state of sim.getTrainStates()) {
        expect(state.lineFraction).toBeGreaterThanOrEqual(0);
        expect(state.lineFraction).toBeLessThanOrEqual(1);
        expect(Number.isFinite(state.lat)).toBe(true);
        expect(Number.isFinite(state.lon)).toBe(true);
      }
    }
  });
});

describe("Simulation.update", () => {
  it("advances the clock at the calm 1x rate and wraps at midnight", () => {
    sim.setTime(1439.95);
    sim.setSpeed(1);
    sim.update(60); // one real minute at 1x = 6 simulated minutes
    expect(sim.timeMinutes).toBeLessThan(1440);
    expect(sim.timeMinutes).toBeGreaterThanOrEqual(0);
  });

  it("does not advance while paused", () => {
    sim.setTime(480);
    sim.setPlaying(false);
    sim.update(120);
    expect(sim.timeMinutes).toBe(480);
  });
});
