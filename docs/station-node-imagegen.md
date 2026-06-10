# Station Node Image Generation

Station nodes are generated with `gpt-image-2` as sprite assets only. They are not used as geographic map backgrounds; OpenFreeMap/OSM remains the source of truth for city geography.

## Generate

```bash
set -a; source .env.local; set +a
python3 "$HOME/.codex/skills/.system/imagegen/scripts/image_gen.py" generate-batch \
  --input scripts/station-node-prompts.gpt-image-2.jsonl \
  --out-dir public/assets-generated/station-nodes \
  --concurrency 1 \
  --force
```

## Chroma-Key Removal

Run `remove_chroma_key.py` for each `*-chroma.png` into `public/assets-generated/station-nodes-alpha/`.

Runtime station node outputs:

- `public/assets-generated/station-nodes-alpha/station-node-tokyo.png`
- `public/assets-generated/station-nodes-alpha/station-node-shin-yokohama.png`
- `public/assets-generated/station-nodes-alpha/station-node-nagoya.png`
- `public/assets-generated/station-nodes-alpha/station-node-kyoto.png`
- `public/assets-generated/station-nodes-alpha/station-node-shin-osaka.png`
