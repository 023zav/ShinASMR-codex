import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import OpenAI from "openai";

type AssetPrompt = {
  file: string;
  size: "1024x1024" | "1536x1024" | "1024x1536";
  prompt: string;
};

const root = process.cwd();
const promptsArg = process.argv.find((arg) => arg.startsWith("--prompts="));
const promptsFile = promptsArg ? promptsArg.split("=").slice(1).join("=").trim() : "scripts/asset-prompts.json";
const promptsPath = resolve(root, promptsFile);
const outDir = resolve(root, "public/assets-generated");
const overwrite = process.argv.includes("--overwrite");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
const styleArg = process.argv.find((arg) => arg.startsWith("--style="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Number.POSITIVE_INFINITY;
const only = onlyArg ? onlyArg.split("=").slice(1).join("=").trim() : "";
const stylePrefix = styleArg ? styleArg.split("=").slice(1).join("=").trim() : "";

const loadLocalEnv = () => {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    const lines = readFileSync(path, "utf-8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }
};

loadLocalEnv();

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("Missing OPENAI_API_KEY in environment or .env.local.");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const raw = readFileSync(promptsPath, "utf-8");
const prompts = JSON.parse(raw) as AssetPrompt[];

const client = new OpenAI({ apiKey });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const generateOne = async (item: AssetPrompt, index: number, total: number) => {
  const outPath = resolve(outDir, item.file);
  mkdirSync(dirname(outPath), { recursive: true });
  if (!overwrite && existsSync(outPath)) {
    console.log(`[skip ${index}/${total}] ${item.file} already exists`);
    return;
  }

  const finalPrompt = stylePrefix ? `${stylePrefix}\n\n${item.prompt}` : item.prompt;
  console.log(`[gen ${index}/${total}] ${item.file} (${item.size})`);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await client.images.generate({
        model: "gpt-image-1",
        prompt: finalPrompt,
        size: item.size,
        quality: "high",
        background: finalPrompt.toLowerCase().includes("transparent background")
          ? "transparent"
          : "auto"
      });

      const b64 = response.data?.[0]?.b64_json;
      if (!b64) {
        throw new Error("No image data returned from API");
      }

      const bytes = Buffer.from(b64, "base64");
      writeFileSync(outPath, bytes);
      console.log(`[ok] ${item.file}`);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[retry ${attempt}/3] ${item.file}: ${message}`);
      if (attempt < 3) await sleep(1200 * attempt);
    }
  }

  throw new Error(`Failed to generate ${item.file} after retries`);
};

const main = async () => {
  const filtered = only
    ? prompts.filter((item) => item.file.includes(only) || item.prompt.toLowerCase().includes(only.toLowerCase()))
    : prompts;
  const selected = filtered.slice(0, limit);
  let generated = 0;

  for (let i = 0; i < selected.length; i += 1) {
    const item = selected[i];
    await generateOne(item, i + 1, selected.length);
    generated += 1;
  }

  console.log(`Done. Processed ${generated} assets into ${outDir}`);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Asset generation failed: ${message}`);
  process.exit(1);
});
