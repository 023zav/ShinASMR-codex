import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import OpenAI from "openai";
import sharp from "sharp";

// Generates per-city zoom plates, landmark sprites and station-node sprites
// for every corridor station, in the established retro-pixel-art style, then
// converts them to compressed webp and writes a manifest the renderer uses
// to pick art per station/zoom. Skips files that already exist, so it is
// safe to re-run until everything is filled in.

const root = process.cwd();
const outBase = resolve(root, "public/assets-generated");
const manifestPath = resolve(root, "src/data/city-art-manifest.json");

type StationMeta = {
  id: string;
  name_en: string;
  metadata?: {
    rank?: string;
    art_theme?: string;
    landmarks_en?: string[];
    prefecture?: string;
  };
};

const stations = JSON.parse(
  readFileSync(resolve(root, "src/data/seed/stations.json"), "utf-8")
) as StationMeta[];

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("Missing OPENAI_API_KEY.");
  process.exit(1);
}
const client = new OpenAI({ apiKey });

// Cities that already ship full hand-tuned plate sets from earlier passes.
const LEGACY_CITIES = new Set(["tokyo", "yokohama", "nagoya", "kyoto", "osaka"]);

const STYLE =
  "Retro 16-bit pixel-art inspired isometric Japanese scene, muted desaturated palette, " +
  "soft warm daylight, gentle painterly texture, calm quiet mood, consistent oblique " +
  "three-quarter top-down view. No text, no letters, no numbers, no logos, no UI elements, no frames.";

// Sprites need truthful local color: the plate style line above drifts
// isolated objects into sepia wood tones, so sprites get their own style and
// explicit per-landmark material colors.
const SPRITE_STYLE =
  "Retro pixel-art inspired isometric game sprite, soft painterly texture, clean crisp " +
  "silhouette, gentle but truthful real-world colors and materials (not sepia, not monochrome). " +
  "No text, no letters, no logos, no frame.";

const LANDMARK_BRIEFS: Record<string, string> = {
  shinagawa: "a cluster of three modern office towers in blue-grey glass and steel",
  odawara: "Odawara Castle keep: white plastered walls, grey tiled roofs, grey stone base",
  atami: "a terraced seaside onsen resort hotel in cream and seafoam tones with rising steam wisps",
  mishima: "a Shinto shrine gate and hall: vermilion red pillars, white walls, dark cypress roof",
  "shin-fuji": "Mount Fuji: snow-white summit cone, blue-violet volcanic slopes",
  shizuoka: "Sunpu Castle east gate: white plaster walls, grey tile roofs, stone moat wall",
  kakegawa: "Kakegawa Castle wooden keep: white plaster upper walls, natural dark wood, grey roofs",
  hamamatsu: "Act Tower: a slender silver-glass skyscraper shaped like a harmonica",
  toyohashi: "a retro city streetcar: cream and crimson livery, single headlight",
  "mikawa-anjo": "a brick-red Dutch-style park windmill with white sails among flowers",
  "gifu-hashima": "a small white castle keep on a green forested mountain",
  maibara: "snow-capped Mount Ibuki rising over the blue waters of Lake Biwa",
  "shin-kobe": "Kobe Port Tower: a bright vermilion-red lattice hyperboloid tower",
  "nishi-akashi": "the Akashi Kaikyo suspension bridge: two pale grey-green towers and a long deck over blue water",
  himeji: "Himeji Castle, the White Heron: brilliant white plastered walls, layered blue-grey tiled roofs, stone base",
  aioi: "a red-and-white shipyard gantry crane over a blue bay",
  okayama: "Okayama Castle: matte black wooden walls with golden roof accents",
  "shin-kurashiki": "a Kurashiki canal storehouse: white earthen walls with black tile lattice, willow tree",
  fukuyama: "Fukuyama Castle keep: white walls, grey-green tiled roofs, beside pink roses",
  "shin-onomichi": "a vermilion three-storey pagoda on a green hillside over the sea",
  mihara: "a small white island ferry by grey castle stone walls",
  "higashi-hiroshima": "a sake brewery: white namako-pattern storehouse walls and a red brick chimney",
  hiroshima: "the great vermilion torii gate of Itsukushima standing in calm blue sea water",
  "shin-iwakuni": "Kintai Bridge: five graceful natural-wood arches over a clear teal river",
  tokuyama: "a petrochemical plant: silver distillation towers, white tanks, slender flare stack",
  "shin-yamaguchi": "Ruriko-ji five-storey pagoda: dark cypress-bark roofs, white and wood body, among pines",
  asa: "a small bronze folk-tale statue of a sleeping boy on a stone plinth with green rice sheaves",
  "shin-shimonoseki": "Akama Shrine gate: vermilion red and white with a green-tiled roof",
  kokura: "Kokura Castle: white walls, dark green tiered roofs, above a stone moat",
  hakata: "Fukuoka Tower: a slender triangular tower of silver-blue mirrored glass"
};

const ZOOM_BRIEFS: Record<number, (theme: string) => string> = {
  10: (theme) =>
    `Wide city-district map plate seen from high above: a Japanese city built around its shinkansen station, dense small rooftops in a street grid, the white elevated shinkansen station and its straight tracks crossing the scene. Surrounding geography and identity: ${theme}.`,
  11: (theme) =>
    `Wide approach map plate: elevated shinkansen viaduct sweeping through city blocks toward the station district, rooftops and streets below. City identity: ${theme}.`,
  12: (theme) =>
    `Station-context map plate: the shinkansen station complex within several city blocks, elevated tracks entering the station hall, plazas and bus loops. City identity: ${theme}.`,
  13: (theme) =>
    `Station-yard map plate: the shinkansen station building with its platforms and rail yard, elevated viaduct tracks, canopies over platforms, nearby blocks. City identity: ${theme}.`,
  14: (theme) =>
    `Rail-district map plate: close on the elevated shinkansen corridor cutting through the district next to the station, supporting pillars, catenary masts, rooftops close by. City identity: ${theme}.`,
  15: (theme) =>
    `Platform close-up map plate: shinkansen island platforms with long ribbed canopies, several parallel tracks with overhead catenary, one white-and-blue high speed train waiting, platform furniture. Subtle hint of the city beyond: ${theme}.`
};

type Job = {
  file: string;
  prompt: string;
  size: "1024x1024" | "1536x1024";
  quality: "medium" | "high";
  webp: { width: number; quality: number; alpha?: boolean };
};

const jobs: Job[] = [];
const manifest: Record<
  string,
  { plates: Record<string, string>; landmark?: string; node?: string }
> = {};

const plateLevelsForRank = (rank: string) =>
  rank === "terminal" || rank === "major" ? [10, 11, 12, 13, 14, 15] : [10, 13, 15];

for (const st of stations) {
  const meta = st.metadata ?? {};
  const rank = meta.rank ?? "regional";
  const theme = meta.art_theme ?? "an ordinary mid-size Japanese city";
  const landmark = (meta.landmarks_en ?? [])[0];
  const entry: { plates: Record<string, string>; landmark?: string; node?: string } = { plates: {} };
  manifest[st.id] = entry;

  if (!LEGACY_CITIES.has(st.id)) {
    for (const z of plateLevelsForRank(rank)) {
      const rel = `cities/${st.id}/z${z}.webp`;
      entry.plates[String(z)] = `/assets-generated/${rel}`;
      jobs.push({
        file: rel,
        prompt: `${STYLE}\n\n${ZOOM_BRIEFS[z](theme)}`,
        size: "1536x1024",
        quality: rank === "terminal" ? "high" : "medium",
        webp: { width: 1280, quality: 72 }
      });
    }
    const landmarkRel = `landmarks/${st.id}.webp`;
    entry.landmark = `/assets-generated/${landmarkRel}`;
    jobs.push({
      file: landmarkRel,
      prompt:
        `${SPRITE_STYLE}\n\nSingle iconic landmark sprite for a game map, isolated on a fully transparent background: ` +
        `${LANDMARK_BRIEFS[st.id] ?? landmark ?? "a small Japanese station clock tower"} (${st.name_en}, Japan). ` +
        `One subject only, centered, isometric three-quarter view, faithful real-world materials and colors, transparent background.`,
      size: "1024x1024",
      quality: "medium",
      webp: { width: 512, quality: 88, alpha: true }
    });
    const nodeRel = `station-nodes-v2/${st.id}.webp`;
    entry.node = `/assets-generated/${nodeRel}`;
    const nodeSize =
      rank === "terminal"
        ? "large multi-platform terminal station with a grand hall"
        : rank === "major"
          ? "mid-size elevated station with two island platforms"
          : "compact elevated station with a single island platform";
    jobs.push({
      file: nodeRel,
      prompt:
        `${SPRITE_STYLE}\n\nSingle isometric modern Japanese shinkansen station building sprite for a game map, ` +
        `isolated on a fully transparent background: a ${nodeSize}. Materials: white and pale-grey concrete, ` +
        `dark glass curtain walls, slate-teal ribbed metal canopy roofs over the platforms, a short stub of elevated ` +
        `concrete viaduct track. Strictly modern construction — no wood, no traditional architecture. ` +
        `Building only, centered, transparent background.`,
      size: "1024x1024",
      quality: "medium",
      webp: { width: 640, quality: 88, alpha: true }
    });
  } else {
    // Legacy cities keep their existing hand-tuned plates; record them so the
    // renderer reads everything from one manifest.
    const key = st.id === "yokohama" ? "yokohama" : st.id;
    entry.plates = {
      "10": `/assets-generated/zoom-plates-v3/${key}-z10-station-district.webp`,
      "11": `/assets-generated/polish-v5/${key}-z11-wide-approach-v5.webp`,
      "12": `/assets-generated/polish-v5/${key}-z12-station-context-v5.webp`,
      "13": `/assets-generated/zoom-plates-v3/${key}-z13-station-yard.webp`,
      "14": `/assets-generated/polish-v4/${key}-z14-rail-district-v4.webp`,
      "15": `/assets-generated/polish-v5/${key}-z15-platform-close-v5.webp`
    };
    const legacyLandmark = st.id === "yokohama" ? "yokohama" : st.id;
    entry.landmark = `/assets/landmark-${legacyLandmark}.png`;
    const nodeNames: Record<string, string> = {
      tokyo: "station-node-tokyo",
      yokohama: "station-node-shin-yokohama",
      nagoya: "station-node-nagoya",
      kyoto: "station-node-kyoto",
      osaka: "station-node-shin-osaka"
    };
    entry.node = `/assets-generated/station-nodes-alpha/${nodeNames[st.id]}.png`;
  }
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Manifest written with ${Object.keys(manifest).length} cities; ${jobs.length} candidate images.`);

if (process.argv.includes("--manifest-only")) process.exit(0);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const generateOne = async (job: Job) => {
  const outPath = resolve(outBase, job.file);
  if (existsSync(outPath)) {
    console.log(`[skip] ${job.file}`);
    return;
  }
  mkdirSync(dirname(outPath), { recursive: true });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await client.images.generate({
        model: "gpt-image-1",
        prompt: job.prompt,
        size: job.size,
        quality: job.quality,
        background: job.webp.alpha ? "transparent" : "auto"
      });
      const b64 = response.data?.[0]?.b64_json;
      if (!b64) throw new Error("no image data");
      const png = Buffer.from(b64, "base64");
      let pipeline = sharp(png).resize({ width: job.webp.width, withoutEnlargement: true });
      pipeline = pipeline.webp({ quality: job.webp.quality, alphaQuality: 90 });
      await pipeline.toFile(outPath);
      console.log(`[ok] ${job.file}`);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[retry ${attempt}/3] ${job.file}: ${message}`);
      if (attempt < 3) await sleep(2500 * attempt);
    }
  }
  console.error(`[FAILED] ${job.file}`);
};

const main = async () => {
  const pending = jobs.filter((job) => !existsSync(resolve(outBase, job.file)));
  console.log(`${pending.length} images to generate.`);
  const concurrency = 4;
  let index = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (index < pending.length) {
      const job = pending[index];
      index += 1;
      await generateOne(job);
    }
  });
  await Promise.all(workers);
  console.log("City asset generation complete.");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
