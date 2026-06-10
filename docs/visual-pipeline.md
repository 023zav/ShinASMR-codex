# ASMR Shinkansen Visual Pipeline

## Architecture: one authoritative plate per zoom band

The world is rendered from a single authored art ladder, the
`public/assets-generated/lod-style-v2` set, drawn once in a consistent
SimCity-inspired isometric pixel style:

| Band | Plate | View |
| ---- | ----- | ---- |
| 0 | `lod-01-japan-national-board` | Japan overview |
| 1 | `lod-02-japan-rail-atlas` | Japan rail atlas |
| 2 | `lod-03-tokaido-national-corridor` | Tokaido corridor |
| 3 | `lod-04-central-honshu-railway` | Central Honshu |
| 4 | `lod-05-kanagawa-corridor` | Regional viaduct |
| 5 | `lod-06-tokyo-yokohama-approach` | Tokyo approach |
| 6 | `lod-07/09/11/13/15` | Focused city (per station) |
| 7 | `lod-08/10/12/14/16` | Focused station close-up |

Zooming is continuous: within a band the plate magnifies up to ~1.38x, then
the next plate crossfades in. Bands 6–7 resolve per focused station
(Tokyo, Shin-Yokohama, Nagoya, Kyoto, Shin-Osaka).

Each plate (`src/plates.ts`) declares:

- `route`: a hand-authored rail polyline in normalized image coordinates that
  traces the railway actually drawn in the plate;
- `coverage`: the slice of real Tokaido line progress (0 = Tokyo,
  1 = Shin-Osaka) the plate depicts;
- `stations`: anchor points along the route for tappable station chips;
- `focus`: the cover-crop focus so portrait viewports keep the corridor
  in frame;
- `lanes`/`laneSpread`: parallel platform tracks for dwelling trains.

Timetable positions (lat/lon from `src/sim.ts`) are mapped to line progress,
then onto the active plate's authored route, through the exact same
cover transform used to draw the plate. Trains, chips, and audio proximity
therefore cannot drift away from the artwork.

Train consists (`public/assets-generated/vehicle-alpha/*`) are isometric and
double-ended; the renderer aligns the body axis with the local rail tangent,
mirroring to whichever isometric diagonal needs the smaller residual rotation.

There is no MapLibre layer, no CSS background art, and no procedural city
geometry at runtime. The legacy CSS art layer (`#artLayer`) exists only as
the no-WebGL fallback. The real-coordinate geometry is available as a debug
inset via the "Map accuracy" toggle.

## Visual QA

Every visual change should be verified with the screenshot harness before
handoff:

```bash
npm run qa:visual                   # build + 36 screenshots + qa/report.md
npm run qa:visual -- --debug-routes # overlays authored rail routes for tuning
npm run qa:visual -- --skip-build   # reuse existing dist/
```

The matrix covers desktop (1440x900) and mobile (390x844, DPR 2), all eight
zoom bands, and city + close views for all five stations, with a
deterministic simulation clock (`?time=485&paused`). Captures land in
`qa/screenshots/` (gitignored); the run summary plus any captured browser
errors land in `qa/report.md`.

Useful URL parameters when inspecting by hand: `?zoom=`, `?station=`,
`?time=`, `?paused`, `?routedebug`.

## Imagegen pass (asset regeneration)

`scripts/asset-prompts.json` and the `*-prompts.json` files remain the art
bible for regenerating plates:

```bash
OPENAI_API_KEY=... npm run generate:assets -- --overwrite
```

When adding a new plate, keep the style prefix identical to lod-style-v2,
export both `.png` (source) and `.webp` (runtime), then author its `route`,
`coverage`, and `focus` in `src/plates.ts` and verify with
`npm run qa:visual -- --debug-routes`.
