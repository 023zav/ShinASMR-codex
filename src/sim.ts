import { Line, Service, Station, TrainType, DerivedRuntime } from "./data/types";

export type SimTrainState = {
  id: string;
  serviceId: string;
  lineId: string;
  trainTypeId: string;
  name: string;
  lat: number;
  lon: number;
  /** Position along the full line, 0 = first polyline point, 1 = last. */
  lineFraction: number;
  speedKmh: number;
  progress: number;
  nextStationId: string | null;
  status: "inactive" | "idle" | "dwell" | "moving";
};

const parseTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class Simulation {
  private lines: Line[];
  private services: Service[];
  private stations: Station[];
  private trainTypes: TrainType[];
  private runtime: DerivedRuntime;
  private playing = true;
  private speed = 1;
  timeMinutes = 360;

  constructor(
    lines: Line[],
    services: Service[],
    stations: Station[],
    trainTypes: TrainType[],
    runtime: DerivedRuntime
  ) {
    this.lines = lines;
    this.services = services;
    this.stations = stations;
    this.trainTypes = trainTypes;
    this.runtime = runtime;
  }

  setPlaying(value: boolean) {
    this.playing = value;
  }

  setSpeed(multiplier: number) {
    this.speed = multiplier;
  }

  setTime(minutes: number) {
    this.timeMinutes = minutes;
  }

  update(deltaSeconds: number) {
    if (!this.playing) return;
    // 1x = 6 simulated seconds per real second. The app is an ASMR simulator,
    // so the default train motion should read as calm observation, not arcade.
    this.timeMinutes += deltaSeconds * this.speed * 0.1;
    if (this.timeMinutes >= 1440) this.timeMinutes -= 1440;
    if (this.timeMinutes < 0) this.timeMinutes += 1440;
  }

  getTrainStates(): SimTrainState[] {
    const lineRuntimeMap = new Map(this.runtime.line_runtime.map((l) => [l.id, l]));
    return this.services.map((service) => {
      const line = this.lines.find((l) => l.id === service.line_id);
      const lineRuntime = lineRuntimeMap.get(service.line_id);
      if (!line || !lineRuntime) {
        return {
          id: service.id,
          serviceId: service.id,
          lineId: service.line_id,
          trainTypeId: service.train_type_id,
          name: service.name_en,
          lat: 0,
          lon: 0,
          lineFraction: 0,
          speedKmh: 0,
          progress: 0,
          nextStationId: null,
          status: "inactive"
        };
      }

      const cum = lineRuntime.cumulative_lengths_m;
      const totalLength = cum.length > 0 ? cum[cum.length - 1] : 0;
      const fractionOf = (offset: number) => (totalLength > 0 ? clamp01(offset / totalLength) : 0);

      const stops = service.stops;
      const now = this.timeMinutes;
      const firstVisible = parseTime(stops[0].arrival);
      const lastVisible = parseTime(stops[stops.length - 1].departure) + 6;
      if (now < firstVisible || now > lastVisible) {
        const first = stops[0];
        const firstOffset = lineRuntime.station_offsets_m[first.station_id] ?? 0;
        const { lat, lon } = this.offsetToLatLon(firstOffset, line, lineRuntime);
        return {
          id: service.id,
          serviceId: service.id,
          lineId: service.line_id,
          trainTypeId: service.train_type_id,
          name: service.name_en,
          lat,
          lon,
          lineFraction: fractionOf(firstOffset),
          speedKmh: 0,
          progress: 0,
          nextStationId: null,
          status: "inactive"
        };
      }

      let status: "inactive" | "idle" | "dwell" | "moving" = "idle";
      let posOffset = 0;
      let speedKmh = 0;
      let progress = 0;
      let nextStationId: string | null = null;

      for (let i = 0; i < stops.length - 1; i += 1) {
        const from = stops[i];
        const to = stops[i + 1];
        const depart = parseTime(from.departure);
        const arrive = parseTime(to.arrival);
        const dwellStart = parseTime(from.arrival);
        const dwellEnd = depart;

        if (now >= dwellStart && now < dwellEnd) {
          status = "dwell";
          posOffset = lineRuntime.station_offsets_m[from.station_id] ?? 0;
          nextStationId = to.station_id;
          progress = 0;
          speedKmh = 0;
          break;
        }

        if (now >= depart && now <= arrive) {
          const t = clamp01((now - depart) / Math.max(1, arrive - depart));
          const eased = easeInOut(t);
          const startOffset = lineRuntime.station_offsets_m[from.station_id] ?? 0;
          const endOffset = lineRuntime.station_offsets_m[to.station_id] ?? 0;
          posOffset = startOffset + (endOffset - startOffset) * eased;
          const distanceM = Math.abs(endOffset - startOffset);
          const durationH = Math.max(1, arrive - depart) / 60;
          speedKmh = distanceM / 1000 / durationH;
          progress = eased;
          status = "moving";
          nextStationId = to.station_id;
          break;
        }

        if (i === stops.length - 2 && now > arrive) {
          status = "idle";
          posOffset = lineRuntime.station_offsets_m[to.station_id] ?? 0;
          nextStationId = null;
          speedKmh = 0;
          progress = 1;
        }
      }

      const { lat, lon } = this.offsetToLatLon(posOffset, line, lineRuntime);
      return {
        id: service.id,
        serviceId: service.id,
        lineId: service.line_id,
        trainTypeId: service.train_type_id,
        name: service.name_en,
        lat,
        lon,
        lineFraction: fractionOf(posOffset),
        speedKmh: Math.round(speedKmh),
        progress,
        nextStationId,
        status
      };
    });
  }

  private offsetToLatLon(
    offset: number,
    line: Line,
    lineRuntime: DerivedRuntime["line_runtime"][number]
  ) {
    const cum = lineRuntime.cumulative_lengths_m;
    if (cum.length < 2) {
      const first = line.polyline[0];
      return { lat: first[0], lon: first[1] };
    }
    let i = 0;
    while (i < cum.length - 1 && cum[i + 1] < offset) i += 1;
    const start = cum[i];
    const end = cum[i + 1];
    const t = end - start === 0 ? 0 : clamp01((offset - start) / (end - start));
    const p0 = line.polyline[i];
    const p1 = line.polyline[i + 1];
    return {
      lat: p0[0] + (p1[0] - p0[0]) * t,
      lon: p0[1] + (p1[1] - p0[1]) * t
    };
  }

  getStation(id: string) {
    return this.stations.find((s) => s.id === id) ?? null;
  }

  getTrainType(id: string) {
    return this.trainTypes.find((t) => t.id === id) ?? null;
  }
}
