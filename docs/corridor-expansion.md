# Tokaido & San'yō Corridor Expansion

The simulator covers the full Tokyo–Hakata corridor: 17 Tokaido + 18 San'yō
stations as one `tokaido` line (1,025 km). All content is data-driven:

## Data pipeline

1. `src/data/seed/stations.json` — 35 stations with kanji names and
   `metadata` (prefecture, `rank`: terminal/major/regional/local,
   `description_en`, `landmarks_en`, `art_theme`). The rank controls label
   density, platform counts in the UI and how many zoom plates a city gets.
2. `src/data/seed/lines.json` — corridor polyline with a vertex at every
   station. After editing run `npm run precompute` (projects stations onto
   segments for metre-accurate offsets).
3. `npx tsx scripts/generate-timetable.ts` — regenerates
   `services.json` (~294 daily services) from real service patterns. Run
   times derive from corridor distances per train family.

## Clock

`Simulation` defaults to `clockMode: "live"` — minutes-since-midnight in
JST, so the board always matches what the real network is doing (including
the empty overnight window). Touching speed/scrub/pause switches to
sandbox mode; the LIVE button returns to real time.

## City art

`npx tsx scripts/generate-city-assets.ts` generates, via OpenAI
gpt-image-1 (needs `OPENAI_API_KEY`):

- zoom plates `cities/<id>/z{10..15}.webp` (six levels for
  terminals/majors, z10/z13/z15 for smaller stations),
- a landmark sprite `landmarks/<id>.webp` (transparent, colors specified
  per landmark in `LANDMARK_BRIEFS` — keep these explicit, the style line
  alone drifts sprites into sepia wood tones),
- a station building sprite `station-nodes-v2/<id>.webp`.

It also writes `src/data/city-art-manifest.json`, which the renderer uses
to resolve the plate nearest to the current zoom band, and to lazy-load
landmark/station sprites. The five original cities keep their hand-tuned
plates through the same manifest. The script skips existing files — safe
to re-run; delete a file to regenerate it.

`scripts/prune-dist.mjs` keeps the deployed site under the GitHub Pages
1 GB limit by shipping only assets referenced from the built bundle.
