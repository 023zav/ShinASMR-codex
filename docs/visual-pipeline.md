# ASMR Shinkansen Visual Pipeline

## Runtime Baseline

The prototype currently renders its core world procedurally in PixiJS:

- Japan islands are separate lat/lon polygons projected into an isometric scene.
- The Tokaido Shinkansen corridor is drawn from real station coordinates and synthetic service data.
- Stations, landmarks, rails, sleepers, shadows, labels, and trains are vector sprites built at runtime.
- Generated image assets are not used by the renderer until they pass an atlas/QA step.

This keeps the MVP coherent and prevents mismatched transparent-background sprites from breaking the scene.

## Imagegen Pass

Use `scripts/asset-prompts.json` as the asset art bible. Generate into `public/assets-generated`, then curate into a packed atlas only after reviewing:

```bash
OPENAI_API_KEY=... npm run generate:assets -- --overwrite
```

Train-only pass:

```bash
OPENAI_API_KEY=... npm run generate:assets -- --overwrite --only=train
```

Recommended next step is to adapt ideas from LayrKits/Sprite-Pipeline:

- Generate each asset against the same style prefix.
- Remove/check alpha backgrounds.
- Normalize scale, shadow direction, camera angle, and anchor points.
- Pack approved sprites into one atlas with a JSON frame manifest.
- Keep procedural sprites as fallback when an atlas frame is missing.

## Map Data Plan

The runtime is lat/lon-based, so richer real geometry can replace the seed data later:

- Use OpenStreetMap railway/station extracts for line geometry.
- Keep ODbL attribution in the About modal.
- Use OpenFreeMap or local vector tiles only after deciding whether the game should show full cartographic context or a stylized railway-board abstraction.

For the MVP, the stylized railway-board abstraction is intentional: it gives a calm game-readable ASMR view while preserving real geographic station placement.
