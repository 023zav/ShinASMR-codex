// Copies from dist/ only the files the built app actually references.
// The public/ tree carries every art iteration (>1 GB), which exceeds the
// GitHub Pages site limit; the app itself uses a small static subset and
// every reference is a literal path in the built HTML/CSS/JS.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const out = path.join(root, "dist-deploy");

if (!fs.existsSync(dist)) {
  console.error("dist/ not found; run the build first.");
  process.exit(1);
}

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

const refPattern = /(?:assets|assets-generated)\/[A-Za-z0-9_./-]+\.(?:png|webp|jpg|jpeg|gif|json|svg|mp3|ogg|wav)/g;
const referenced = new Set();
for (const file of walk(dist)) {
  if (!/\.(html|css|js|webmanifest)$/.test(file)) continue;
  const content = fs.readFileSync(file, "utf8");
  for (const match of content.match(refPattern) ?? []) referenced.add(match);
}

const copy = (rel) => {
  const src = path.join(dist, rel);
  if (!fs.existsSync(src)) return false;
  const dest = path.join(out, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
};

fs.rmSync(out, { recursive: true, force: true });

// App shell: everything in dist except the two asset trees.
for (const file of walk(dist)) {
  const rel = path.relative(dist, file);
  if (rel.startsWith("assets-generated/")) continue;
  if (rel.startsWith("assets/") && !/\.(js|css)$/.test(rel)) continue;
  copy(rel);
}

let missing = 0;
for (const rel of referenced) {
  if (!copy(rel)) {
    missing += 1;
    console.warn(`Referenced but not in dist: ${rel}`);
  }
}
fs.writeFileSync(path.join(out, ".nojekyll"), "");

const sizeOf = (dir) => walk(dir).reduce((sum, f) => sum + fs.statSync(f).size, 0);
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
console.log(
  `dist-deploy: ${referenced.size} referenced assets (${missing} missing), ${mb(sizeOf(out))} of ${mb(sizeOf(dist))}`
);
