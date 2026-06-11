import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Generates a realistic full-day Tokaido + San'yō timetable into
// src/data/seed/services.json. Deterministic: same input data, same output.
// Patterns follow the real service structure (Nozomi/Hikari/Kodama on the
// Tokaido, Mizuho/Sakura/Kodama on the San'yō, through Nozomi to Hakata),
// with run times derived from real corridor distances.

const root = process.cwd();
const runtime = JSON.parse(readFileSync(resolve(root, "src/data/derived_runtime.json"), "utf-8"));
const offsets: Record<string, number> = runtime.line_runtime[0].station_offsets_m;

const ORDER = [
  "tokyo", "shinagawa", "yokohama", "odawara", "atami", "mishima", "shin-fuji", "shizuoka",
  "kakegawa", "hamamatsu", "toyohashi", "mikawa-anjo", "nagoya", "gifu-hashima", "maibara",
  "kyoto", "osaka", "shin-kobe", "nishi-akashi", "himeji", "aioi", "okayama", "shin-kurashiki",
  "fukuyama", "shin-onomichi", "mihara", "higashi-hiroshima", "hiroshima", "shin-iwakuni",
  "tokuyama", "shin-yamaguchi", "asa", "shin-shimonoseki", "kokura", "hakata"
];

const slice = (from: string, to: string) => ORDER.slice(ORDER.indexOf(from), ORDER.indexOf(to) + 1);

const PATTERNS = {
  nozomiFull: ["tokyo", "shinagawa", "yokohama", "nagoya", "kyoto", "osaka", "shin-kobe", "okayama", "hiroshima", "kokura", "hakata"],
  nozomiOsaka: ["tokyo", "shinagawa", "yokohama", "nagoya", "kyoto", "osaka"],
  hikariOkayama: ["tokyo", "shinagawa", "yokohama", "odawara", "nagoya", "kyoto", "osaka", "shin-kobe", "himeji", "okayama"],
  hikariOsaka: ["tokyo", "shinagawa", "yokohama", "mishima", "shizuoka", "hamamatsu", "nagoya", "kyoto", "osaka"],
  kodamaOsaka: slice("tokyo", "osaka"),
  kodamaNagoya: slice("tokyo", "nagoya"),
  sakura: ["osaka", "shin-kobe", "himeji", "okayama", "fukuyama", "hiroshima", "kokura", "hakata"],
  mizuho: ["osaka", "shin-kobe", "okayama", "hiroshima", "kokura", "hakata"],
  kodamaSanyo: slice("osaka", "hakata")
};

type Spec = {
  family: "Nozomi" | "Hikari" | "Kodama" | "Sakura" | "Mizuho" | "Inspection";
  pattern: string[];
  trainType: string;
  cruiseKmh: number;
  dwellMin: number;
};

const SPECS: Record<string, Spec> = {
  nozomiFull: { family: "Nozomi", pattern: PATTERNS.nozomiFull, trainType: "n700s", cruiseKmh: 262, dwellMin: 2 },
  nozomiOsaka: { family: "Nozomi", pattern: PATTERNS.nozomiOsaka, trainType: "n700a", cruiseKmh: 262, dwellMin: 2 },
  hikariOkayama: { family: "Hikari", pattern: PATTERNS.hikariOkayama, trainType: "n700a", cruiseKmh: 242, dwellMin: 2 },
  hikariOsaka: { family: "Hikari", pattern: PATTERNS.hikariOsaka, trainType: "n700a", cruiseKmh: 242, dwellMin: 2 },
  kodamaOsaka: { family: "Kodama", pattern: PATTERNS.kodamaOsaka, trainType: "n700s", cruiseKmh: 230, dwellMin: 3 },
  kodamaNagoya: { family: "Kodama", pattern: PATTERNS.kodamaNagoya, trainType: "n700a", cruiseKmh: 230, dwellMin: 3 },
  sakura: { family: "Sakura", pattern: PATTERNS.sakura, trainType: "n700kyushu", cruiseKmh: 252, dwellMin: 2 },
  mizuho: { family: "Mizuho", pattern: PATTERNS.mizuho, trainType: "n700kyushu", cruiseKmh: 262, dwellMin: 1 },
  kodamaSanyo: { family: "Kodama", pattern: PATTERNS.kodamaSanyo, trainType: "series500", cruiseKmh: 225, dwellMin: 3 }
};

const fmt = (minutes: number) => {
  const m = Math.round(minutes);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

type Service = {
  id: string;
  line_id: string;
  train_type_id: string;
  name_en: string;
  stops: { station_id: string; arrival: string; departure: string }[];
};

const services: Service[] = [];
const counters: Record<string, { west: number; east: number }> = {
  Nozomi: { west: 1, east: 2 },
  Hikari: { west: 501, east: 502 },
  Kodama: { west: 701, east: 702 },
  Sakura: { west: 541, east: 542 },
  Mizuho: { west: 601, east: 602 },
  Inspection: { west: 923, east: 924 }
};

const LAST_ARRIVAL = 23 * 60 + 59;

const makeService = (specKey: string, departMinutes: number, eastbound: boolean, trainTypeOverride?: string) => {
  const spec = SPECS[specKey];
  const pattern = eastbound ? [...spec.pattern].reverse() : spec.pattern;
  const stops: Service["stops"] = [];
  let t = departMinutes;
  for (let i = 0; i < pattern.length; i += 1) {
    const id = pattern[i];
    if (i === 0) {
      stops.push({ station_id: id, arrival: fmt(t - 4), departure: fmt(t) });
      continue;
    }
    const distKm = Math.abs(offsets[id] - offsets[pattern[i - 1]]) / 1000;
    // Per-hop time: cruise + a fixed acceleration/braking penalty per stop.
    t += (distKm / spec.cruiseKmh) * 60 + 2.2;
    const isLast = i === pattern.length - 1;
    const arrival = t;
    const dwell = isLast ? 2 : spec.dwellMin;
    stops.push({ station_id: id, arrival: fmt(arrival), departure: fmt(arrival + dwell) });
    t = arrival + dwell;
  }
  if (t > LAST_ARRIVAL) return; // services must finish before midnight
  const dir = eastbound ? "east" : "west";
  const number = counters[spec.family][dir];
  counters[spec.family][dir] += 2;
  services.push({
    id: `${spec.family.toLowerCase()}-${number}`,
    line_id: "tokaido",
    train_type_id: trainTypeOverride ?? spec.trainType,
    name_en: `${spec.family} ${number}`,
    stops
  });
};

for (const eastbound of [false, true]) {
  for (let h = 6; h <= 21; h += 1) {
    const base = h * 60;
    // Through Nozomi Tokyo<->Hakata until the run can finish before midnight,
    // then the late slots short-turn at Shin-Osaka, like the real timetable.
    makeService(h <= 18 ? "nozomiFull" : "nozomiOsaka", base + 0, eastbound);
    if (h <= 20) makeService("nozomiOsaka", base + 12, eastbound, h % 2 === 0 ? "n700s" : "n700a");
    if (h <= 18) makeService("nozomiFull", base + 30, eastbound, "n700a");
    else if (h <= 21) makeService("nozomiOsaka", base + 30, eastbound);
    if (h <= 20) makeService("nozomiOsaka", base + 51, eastbound);
    makeService(h % 2 === 0 ? "hikariOkayama" : "hikariOsaka", base + 3, eastbound);
    makeService(h % 2 === 0 ? "hikariOsaka" : "hikariOkayama", base + 33, eastbound);
    if (h <= 20) makeService("kodamaOsaka", base + 20, eastbound, h % 2 === 0 ? "n700a" : "n700s");
    if (h <= 21) makeService("kodamaNagoya", base + 48, eastbound);
    // San'yō locals: Sakura hourly, all-stops Kodama every other hour.
    if (h === 6 || h === 19) makeService("mizuho", base + 5, eastbound);
    else makeService("sakura", base + 5, eastbound);
    if (h % 2 === 0 && h <= 19) makeService("kodamaSanyo", base + 35, eastbound);
  }
}

// One Doctor Yellow inspection round trip — the rare yellow treat.
makeService("nozomiOsaka", 10 * 60 + 47, false, "doctor923");
services[services.length - 1].id = "inspection-923";
services[services.length - 1].name_en = "Doctor Yellow 923";
makeService("nozomiOsaka", 15 * 60 + 33, true, "doctor923");
services[services.length - 1].id = "inspection-924";
services[services.length - 1].name_en = "Doctor Yellow 924";

services.sort((a, b) => a.stops[0].departure.localeCompare(b.stops[0].departure));
writeFileSync(resolve(root, "src/data/seed/services.json"), JSON.stringify(services) + "\n");
console.log(`Wrote ${services.length} services`);
const arrOf = (s: Service) => s.stops[s.stops.length - 1].arrival;
const last = [...services].sort((a, b) => arrOf(a).localeCompare(arrOf(b))).at(-1);
console.log("latest arrival:", last && `${last.name_en} ${arrOf(last)}`);
