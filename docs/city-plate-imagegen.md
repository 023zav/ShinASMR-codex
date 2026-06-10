# City Plate Image Generation

The city zoom art is designed to be generated with OpenAI `gpt-image-2` and consumed by `src/render.ts` as station-specific map plates. Live train positions and rail overlays remain coordinate-driven from local JSON/OSM projection; generated images are only the styled art layer.

## Required Access

`gpt-image-2` requires an OpenAI organization with image-generation access. The generated assets should not be checked into prompts or code with an API key; keep credentials in `.env.local` only.

## Generate

From repo root, with `OPENAI_API_KEY` set in the environment or `.env.local`:

```bash
set -a; source .env.local; set +a
python3 "$HOME/.codex/skills/.system/imagegen/scripts/image_gen.py" generate-batch \
  --input scripts/city-plate-prompts.gpt-image-2.jsonl \
  --out-dir public/assets-generated/city-plates \
  --concurrency 2 \
  --force
```

Expected outputs:

- `public/assets-generated/city-plates/tokyo-station-operations-plate.png`
- `public/assets-generated/city-plates/shin-yokohama-operations-plate.png`
- `public/assets-generated/city-plates/odawara-atami-coast-operations-plate.png`
- `public/assets-generated/city-plates/fuji-shizuoka-operations-plate.png`
- `public/assets-generated/city-plates/hamamatsu-lake-hamana-operations-plate.png`
- `public/assets-generated/city-plates/nagoya-station-operations-plate.png`
- `public/assets-generated/city-plates/gifu-maibara-lake-biwa-operations-plate.png`
- `public/assets-generated/city-plates/kyoto-station-operations-plate.png`
- `public/assets-generated/city-plates/shin-osaka-operations-plate.png`
- `public/assets-generated/city-plates/tokaido-corridor-overview-operations-plate.png`

## Vehicle / Detail Assets

```bash
set -a; source .env.local; set +a
python3 "$HOME/.codex/skills/.system/imagegen/scripts/image_gen.py" generate-batch \
  --input scripts/vehicle-detail-prompts.gpt-image-2.jsonl \
  --out-dir public/assets-generated/vehicle-plates \
  --concurrency 1 \
  --force

python3 "$HOME/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py" \
  --input public/assets-generated/vehicle-plates/train-n700s-blue-chroma.png \
  --out public/assets-generated/vehicle-alpha/train-n700s-blue.png \
  --auto-key border \
  --soft-matte \
  --despill
```

Repeat the chroma-key removal for the other train/platform/rail chroma sheets. Runtime train rendering uses:

- `public/assets-generated/vehicle-alpha/train-n700s-blue.png`
- `public/assets-generated/vehicle-alpha/train-n700a-gold.png`
- `public/assets-generated/vehicle-alpha/train-doctor-yellow.png`
- `public/assets-generated/vehicle-alpha/train-500series-slate.png`

## Runtime Behavior

At mid/close zoom levels, the renderer selects the generated city plate nearest to the current viewport center, fades it in, then overlays coordinate-backed rail, stations, and generated train sprites. Procedural art is fallback only when generated plates are missing.
