# ASMR Shinkansen

A calm, timetable-driven Tokaido Shinkansen ambience simulator for the
browser. The world is an authored ladder of generated isometric art plates
(Japan → rail atlas → corridor → region → approach → city → station) with
live trains seated on hand-authored rail geometry, a quiet operations HUD,
and generative audio. English and Japanese UI.

Private prototype — not yet licensed for redistribution.

## Run

```bash
npm ci
npm run dev        # Vite dev server
npm run build      # production bundle in dist/
npm run preview    # serve the production bundle
```

## Quality gates

```bash
npm run typecheck  # strict TypeScript
npm run lint       # ESLint (flat config)
npm test           # Vitest: simulation + plate-ladder invariants
npm run check:prototype  # static asset/architecture checks
npm run qa:visual  # Playwright screenshot matrix -> qa/screenshots + qa/report.md
```

`qa:visual` captures desktop (1440x900) and mobile (390x844) across all 8
zoom bands and all five cities with a deterministic clock. Add
`-- --debug-routes` to overlay the authored rail polylines when tuning art
alignment. CI (GitHub Actions) runs all of the above on every push.

Useful URL parameters: `?zoom=6.5`, `?station=kyoto`, `?time=485`,
`?paused`, `?routedebug`.

## Architecture

| Path | Role |
| --- | --- |
| `src/plates.ts` | The art ladder: per-plate rail routes, line-progress coverage, station anchors, focus crops (pure data + math, unit-tested) |
| `src/render.ts` | PixiJS plate renderer: cover transform, crossfades, rail-aligned train consists, bounded texture cache |
| `src/sim.ts` | Pure timetable simulation (positions, dwell/move states) |
| `src/main.ts` | HUD wiring, localization, audio coupling |
| `src/i18n.ts` | EN/JA dictionaries and formatting |
| `docs/visual-pipeline.md` | How the plate ladder and visual QA work |

Asset regeneration (needs `OPENAI_API_KEY` with image generation access):

```bash
OPENAI_API_KEY=... npm run generate:assets -- --overwrite
```
