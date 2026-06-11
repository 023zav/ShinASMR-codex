import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DerivedRuntimeSchema,
  LinesSchema,
  StationsSchema
} from "../src/data/types";

const root = process.cwd();
const stationsPath = resolve(root, "src/data/seed/stations.json");
const linesPath = resolve(root, "src/data/seed/lines.json");
const outputPath = resolve(root, "src/data/derived_runtime.json");

const stations = StationsSchema.parse(
  JSON.parse(readFileSync(stationsPath, "utf-8"))
);
const lines = LinesSchema.parse(JSON.parse(readFileSync(linesPath, "utf-8")));

const stationById = new Map(stations.map((s) => [s.id, s]));

const toRad = (deg: number) => (deg * Math.PI) / 180;
const haversine = (a: [number, number], b: [number, number]) => {
  const [lat1, lon1] = a.map(toRad);
  const [lat2, lon2] = b.map(toRad);
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const r = 6371000;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
};

const line_runtime = lines.map((line) => {
  const cumulative: number[] = [0];
  let total = 0;
  for (let i = 1; i < line.polyline.length; i += 1) {
    const d = haversine(line.polyline[i - 1], line.polyline[i]);
    total += d;
    cumulative.push(total);
  }
  const station_offsets: Record<string, number> = {};
  for (const stationId of line.station_ids_in_order) {
    const st = stationById.get(stationId);
    if (!st) continue;
    // Project the station onto each segment (not just vertices) so offsets stay
    // accurate even where the polyline has sparse shape points.
    let bestOffset = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < line.polyline.length - 1; i += 1) {
      const [aLat, aLon] = line.polyline[i];
      const [bLat, bLon] = line.polyline[i + 1];
      const dLat = bLat - aLat;
      const dLon = bLon - aLon;
      const len2 = dLat * dLat + dLon * dLon;
      const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((st.lat - aLat) * dLat + (st.lon - aLon) * dLon) / len2));
      const pLat = aLat + dLat * t;
      const pLon = aLon + dLon * t;
      const d = haversine([st.lat, st.lon], [pLat, pLon]);
      if (d < bestDist) {
        bestDist = d;
        bestOffset = cumulative[i] + haversine([aLat, aLon], [pLat, pLon]);
      }
    }
    station_offsets[stationId] = bestOffset;
  }
  return {
    id: line.id,
    total_length_m: total,
    cumulative_lengths_m: cumulative,
    station_offsets_m: station_offsets
  };
});

const payload = DerivedRuntimeSchema.parse({ line_runtime });
writeFileSync(outputPath, JSON.stringify(payload, null, 2));
console.log(`Wrote ${outputPath}`);
