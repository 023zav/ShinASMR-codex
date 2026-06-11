import {
  Line,
  Service,
  Station,
  TrainType,
  DerivedRuntime
} from "./data/types";

export type SimTrainState = {
  id: string;
  serviceId: string;
  lineId: string;
  trainTypeId: string;
  name: string;
  lat: number;
  lon: number;
  speedKmh: number;
  progress: number;
  nextStationId: string | null;
  status: "inactive" | "idle" | "dwell" | "moving";
};

export type ClockMode = "live" | "sandbox";

const parseTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// Minutes since midnight in Japan Standard Time (UTC+9), with fractional
// seconds so live train positions glide instead of stepping once a minute.
export const jstNowMinutes = () => {
  const utcMinutes = Date.now() / 60000;
  return (((utcMinutes + 540) % 1440) + 1440) % 1440;
};

type StopTime = { stationId: string; arr: number; dep: number };

type ServiceRuntime = {
  service: Service;
  stops: StopTime[];
  visibleFrom: number;
  visibleUntil: number;
  inactiveState: SimTrainState;
  lineRuntime: DerivedRuntime["line_runtime"][number];
  line: Line;
};

export class Simulation {
  private stations: Station[];
  private trainTypes: TrainType[];
  private stationMap: Map<string, Station>;
  private trainTypeMap: Map<string, TrainType>;
  private runtimes: ServiceRuntime[];
  private playing = true;
  private speed = 1;
  clockMode: ClockMode = "live";
  timeMinutes = 360;

  constructor(
    lines: Line[],
    services: Service[],
    stations: Station[],
    trainTypes: TrainType[],
    runtime: DerivedRuntime
  ) {
    this.stations = stations;
    this.trainTypes = trainTypes;
    this.stationMap = new Map(stations.map((s) => [s.id, s]));
    this.trainTypeMap = new Map(trainTypes.map((t) => [t.id, t]));
    const lineMap = new Map(lines.map((l) => [l.id, l]));
    const lineRuntimeMap = new Map(runtime.line_runtime.map((l) => [l.id, l]));

    this.runtimes = [];
    for (const service of services) {
      const line = lineMap.get(service.line_id);
      const lineRuntime = lineRuntimeMap.get(service.line_id);
      if (!line || !lineRuntime) continue;
      const stops: StopTime[] = service.stops.map((stop) => ({
        stationId: stop.station_id,
        arr: parseTime(stop.arrival),
        dep: parseTime(stop.departure)
      }));
      const firstOffset = lineRuntime.station_offsets_m[stops[0].stationId] ?? 0;
      const { lat, lon } = offsetToLatLon(firstOffset, line, lineRuntime);
      this.runtimes.push({
        service,
        stops,
        visibleFrom: stops[0].arr,
        visibleUntil: stops[stops.length - 1].dep + 6,
        inactiveState: {
          id: service.id,
          serviceId: service.id,
          lineId: service.line_id,
          trainTypeId: service.train_type_id,
          name: service.name_en,
          lat,
          lon,
          speedKmh: 0,
          progress: 0,
          nextStationId: null,
          status: "inactive"
        },
        lineRuntime,
        line
      });
    }

    this.timeMinutes = jstNowMinutes();
  }

  setPlaying(value: boolean) {
    this.playing = value;
    if (!value) this.clockMode = "sandbox";
  }

  setSpeed(multiplier: number) {
    this.speed = multiplier;
    this.clockMode = "sandbox";
  }

  setTime(minutes: number) {
    this.timeMinutes = minutes;
    this.clockMode = "sandbox";
  }

  goLive() {
    this.clockMode = "live";
    this.playing = true;
    this.speed = 1;
    this.timeMinutes = jstNowMinutes();
  }

  update(deltaSeconds: number) {
    if (this.clockMode === "live") {
      // The network clock is Japan's clock: the simulator always shows where
      // every scheduled train actually is right now.
      this.timeMinutes = jstNowMinutes();
      return;
    }
    if (!this.playing) return;
    // 1x = 6 simulated seconds per real second. The app is an ASMR simulator,
    // so the default train motion should read as calm observation, not arcade.
    this.timeMinutes += deltaSeconds * this.speed * 0.1;
    if (this.timeMinutes >= 1440) this.timeMinutes -= 1440;
    if (this.timeMinutes < 0) this.timeMinutes += 1440;
  }

  getTrainStates(): SimTrainState[] {
    const now = this.timeMinutes;
    return this.runtimes.map((rt) => {
      if (now < rt.visibleFrom || now > rt.visibleUntil) return rt.inactiveState;

      const stops = rt.stops;
      let status: SimTrainState["status"] = "idle";
      let posOffset = 0;
      let speedKmh = 0;
      let progress = 0;
      let nextStationId: string | null = null;

      for (let i = 0; i < stops.length - 1; i += 1) {
        const from = stops[i];
        const to = stops[i + 1];

        if (now >= from.arr && now < from.dep) {
          status = "dwell";
          posOffset = rt.lineRuntime.station_offsets_m[from.stationId] ?? 0;
          nextStationId = to.stationId;
          break;
        }

        if (now >= from.dep && now <= to.arr) {
          const t = clamp01((now - from.dep) / Math.max(1, to.arr - from.dep));
          const eased = easeInOut(t);
          const startOffset = rt.lineRuntime.station_offsets_m[from.stationId] ?? 0;
          const endOffset = rt.lineRuntime.station_offsets_m[to.stationId] ?? 0;
          posOffset = startOffset + (endOffset - startOffset) * eased;
          const distanceM = Math.abs(endOffset - startOffset);
          const durationH = Math.max(1, to.arr - from.dep) / 60;
          speedKmh = (distanceM / 1000) / durationH;
          progress = eased;
          status = "moving";
          nextStationId = to.stationId;
          break;
        }

        if (i === stops.length - 2 && now > to.arr) {
          status = "idle";
          posOffset = rt.lineRuntime.station_offsets_m[to.stationId] ?? 0;
          nextStationId = null;
          progress = 1;
        }
      }

      const { lat, lon } = offsetToLatLon(posOffset, rt.line, rt.lineRuntime);
      return {
        id: rt.service.id,
        serviceId: rt.service.id,
        lineId: rt.service.line_id,
        trainTypeId: rt.service.train_type_id,
        name: rt.service.name_en,
        lat,
        lon,
        speedKmh: Math.round(speedKmh),
        progress,
        nextStationId,
        status
      };
    });
  }

  getStation(id: string) {
    return this.stationMap.get(id) ?? null;
  }

  getTrainType(id: string) {
    return this.trainTypeMap.get(id) ?? null;
  }

  getStations() {
    return this.stations;
  }

  getTrainTypes() {
    return this.trainTypes;
  }
}

const offsetToLatLon = (
  offset: number,
  line: Line,
  lineRuntime: DerivedRuntime["line_runtime"][number]
) => {
  const cum = lineRuntime.cumulative_lengths_m;
  if (cum.length < 2) {
    const first = line.polyline[0];
    return { lat: first[0], lon: first[1] };
  }
  // Binary search for the segment containing this offset.
  let lo = 0;
  let hi = cum.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  const start = cum[lo];
  const end = cum[lo + 1];
  const t = end - start === 0 ? 0 : clamp01((offset - start) / (end - start));
  const p0 = line.polyline[lo];
  const p1 = line.polyline[lo + 1];
  return {
    lat: p0[0] + (p1[0] - p0[0]) * t,
    lon: p0[1] + (p1[1] - p0[1]) * t
  };
};
