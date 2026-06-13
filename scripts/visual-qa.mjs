/*
 * Automated visual QA for the plate-ladder renderer.
 *
 * Builds the app, serves the production bundle, then captures a screenshot
 * matrix across desktop + mobile viewports, every zoom band, and each focus
 * city. Screenshots land in qa/screenshots/ and a summary in qa/report.md.
 *
 * Usage:
 *   npm run qa:visual              # full matrix
 *   npm run qa:visual -- --debug-routes   # adds ?routedebug overlay shots
 *   npm run qa:visual -- --skip-build     # reuse existing dist/
 *   npm run qa:visual -- --compare        # diff against qa/goldens, fail on drift
 *   npm run qa:visual -- --update-goldens # regenerate qa/goldens from this run
 */
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const outDir = path.join(root, "qa", "screenshots");
const goldenDir = path.join(root, "qa", "goldens");
const PORT = 4173;
// `vite preview` honors the configured base, so the app lives at the subpath.
const BASE_PATH = "/ShinASMR-codex/";
const BASE = `http://127.0.0.1:${PORT}`;
const APP_URL = `${BASE}${BASE_PATH}`;

const args = new Set(process.argv.slice(2));
const DEBUG_ROUTES = args.has("--debug-routes");
const SKIP_BUILD = args.has("--skip-build");
const COMPARE = args.has("--compare");
const UPDATE_GOLDENS = args.has("--update-goldens");

// Goldens are committed low-res (360px wide) so they stay light in git while
// still catching layout/art/regression drift. A capture fails the compare
// when more than 2% of golden pixels differ.
const GOLDEN_WIDTH = 360;
const PIXEL_DIFF_RATIO = 0.02;
const PIXELMATCH_THRESHOLD = 0.16;

/** Box-filter downscale to the golden width (pngjs has no resampler). */
const downscale = (png, targetWidth) => {
  if (png.width <= targetWidth) return png;
  const scale = png.width / targetWidth;
  const targetHeight = Math.max(1, Math.round(png.height / scale));
  const out = new PNG({ width: targetWidth, height: targetHeight });
  for (let ty = 0; ty < targetHeight; ty += 1) {
    const y0 = Math.floor(ty * scale);
    const y1 = Math.min(png.height, Math.max(y0 + 1, Math.floor((ty + 1) * scale)));
    for (let tx = 0; tx < targetWidth; tx += 1) {
      const x0 = Math.floor(tx * scale);
      const x1 = Math.min(png.width, Math.max(x0 + 1, Math.floor((tx + 1) * scale)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (sy * png.width + sx) * 4;
          r += png.data[i];
          g += png.data[i + 1];
          b += png.data[i + 2];
          a += png.data[i + 3];
          n += 1;
        }
      }
      const o = (ty * targetWidth + tx) * 4;
      out.data[o] = Math.round(r / n);
      out.data[o + 1] = Math.round(g / n);
      out.data[o + 2] = Math.round(b / n);
      out.data[o + 3] = Math.round(a / n);
    }
  }
  return out;
};

const readPng = (file) => PNG.sync.read(fs.readFileSync(file));
const writePng = (file, png) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
};

const findChromium = () => {
  if (process.env.QA_CHROMIUM && fs.existsSync(process.env.QA_CHROMIUM))
    return process.env.QA_CHROMIUM;
  const candidates = [];
  for (const dir of [
    "/opt/pw-browsers",
    path.join(process.env.HOME ?? "", ".cache", "ms-playwright")
  ]) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      for (const sub of [
        "chrome-linux/chrome",
        "chrome-linux64/chrome",
        "chrome-linux/headless_shell"
      ]) {
        const candidate = path.join(dir, entry, sub);
        if (fs.existsSync(candidate)) candidates.push(candidate);
      }
    }
  }
  return candidates.sort().pop() ?? null;
};

const waitForServer = async (url, timeoutMs = 60000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      // Any HTTP response (even a 404) means the server is bound and serving;
      // we only need it reachable before Playwright navigates.
      await fetch(url);
      return;
    } catch {
      // Server not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Preview server did not start at ${url}`);
};

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, isMobile: false },
  { name: "mobile", width: 390, height: 844, isMobile: true }
];

// Zoom band midpoints across the 8-plate ladder, plus each focused city close-up.
const BAND_SHOTS = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5];
const CITY_SHOTS = ["tokyo", "yokohama", "nagoya", "kyoto", "osaka"];
// Bands 4-5 resolve per focused region; Tokyo/Yokohama is already covered by
// the band sweep, so capture the Nagoya and Kansai regional/approach plates.
const REGIONAL_SHOTS = ["nagoya", "osaka"];

const run = async () => {
  if (!SKIP_BUILD) {
    console.log("Building production bundle...");
    await execFileAsync("npx", ["vite", "build"], { cwd: root });
  }

  const chromiumPath = findChromium();
  if (!chromiumPath) {
    console.error(
      "No Chromium binary found. Set QA_CHROMIUM or run `npx playwright install chromium`."
    );
    process.exit(1);
  }

  console.log("Starting preview server...");
  // Bind IPv4 explicitly: the harness polls 127.0.0.1, but `vite preview`
  // otherwise listens on `localhost`, which resolves to IPv6 ::1 on the CI
  // runner — so 127.0.0.1 requests are refused and the wait times out. Server
  // output is surfaced (not ignored) so a real startup failure is diagnosable.
  const server = spawn(
    "npx",
    ["vite", "preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { cwd: root, stdio: ["ignore", "inherit", "inherit"] }
  );
  const stopServer = () => {
    try {
      server.kill("SIGTERM");
    } catch {
      // Already gone.
    }
  };
  process.on("exit", stopServer);

  try {
    await waitForServer(APP_URL);
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      executablePath: chromiumPath,
      args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
    });

    const captured = [];
    const shots = [];
    const failures = [];

    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.isMobile,
        hasTouch: viewport.isMobile,
        deviceScaleFactor: viewport.isMobile ? 2 : 1
      });
      const page = await context.newPage();
      const dir = path.join(outDir, viewport.name);
      fs.mkdirSync(dir, { recursive: true });

      const errors = [];
      page.on("pageerror", (err) => errors.push(String(err)));
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });

      const open = async (query) => {
        // `qa` keeps captures deterministic (no idle camera drift).
        await page.goto(`${APP_URL}?time=485&paused&qa${query}`, { waitUntil: "load" });
        await page.waitForSelector("body.is-ready", { timeout: 25000 });
        await page.waitForFunction(() => Boolean(window.__shinkansen), undefined, {
          timeout: 10000
        });
      };

      const shoot = async (name) => {
        // Let crossfades and texture loads settle before capturing.
        await page.waitForTimeout(900);
        const file = path.join(dir, `${name}.png`);
        await page.screenshot({ path: file });
        captured.push(path.relative(root, file));
        shots.push({ viewport: viewport.name, name, file });
        console.log(`  captured ${viewport.name}/${name}.png`);
      };

      // The zoom tween plus first-time texture decode can outlast the fixed
      // settle delay, so regional shots wait for the expected plate to land.
      const waitForPlate = async (plateId) => {
        await page.waitForFunction(
          (id) => window.__shinkansen.getStats().routeMode === id,
          plateId,
          { timeout: 15000 }
        );
      };

      const routeDebugQuery = DEBUG_ROUTES ? "&routedebug" : "";

      await open(routeDebugQuery);
      // Expected plate per band with the default Tokyo focus; waiting on the
      // plate id keeps captures deterministic for the golden compare.
      const BAND_PLATE_IDS = [
        "japan-board",
        "japan-atlas",
        "tokaido-corridor",
        "central-honshu",
        "kanagawa-corridor",
        "tokyo-approach",
        "tokyo-city",
        "tokyo-close"
      ];
      for (const zoom of BAND_SHOTS) {
        await page.evaluate((z) => window.__shinkansen.setZoom(z), zoom);
        await waitForPlate(BAND_PLATE_IDS[Math.floor(zoom)]);
        await shoot(`band-${zoom.toFixed(1).replace(".", "_")}`);
      }

      for (const station of CITY_SHOTS) {
        await page.evaluate((id) => {
          window.__shinkansen.focusStation(id);
          window.__shinkansen.setZoom(6.5);
        }, station);
        await waitForPlate(`${station}-city`);
        await shoot(`city-${station}`);
        await page.evaluate(() => window.__shinkansen.setZoom(7.5));
        await waitForPlate(`${station}-close`);
        await shoot(`close-${station}`);
      }

      const REGIONAL_PLATE_IDS = {
        nagoya: ["nagoya-regional", "nagoya-approach"],
        osaka: ["kansai-regional", "kansai-approach"]
      };
      for (const station of REGIONAL_SHOTS) {
        const [regionalId, approachId] = REGIONAL_PLATE_IDS[station];
        await page.evaluate((id) => {
          window.__shinkansen.focusStation(id);
          window.__shinkansen.setZoom(4.5);
        }, station);
        await waitForPlate(regionalId);
        await shoot(`regional-${station}`);
        await page.evaluate(() => window.__shinkansen.setZoom(5.5));
        await waitForPlate(approachId);
        await shoot(`approach-${station}`);
      }

      if (errors.length > 0) {
        failures.push({
          viewport: viewport.name,
          errors: Array.from(new Set(errors)).slice(0, 12)
        });
      }
      await context.close();
    }

    await browser.close();

    // ----------------------------------------------- golden regression pass --
    const goldenResults = [];
    let goldenDrift = false;
    if ((COMPARE || UPDATE_GOLDENS) && DEBUG_ROUTES) {
      console.warn("Skipping golden compare: --debug-routes changes the captures.");
    } else if (COMPARE || UPDATE_GOLDENS) {
      const diffDir = path.join(outDir, "diffs");
      for (const shot of shots) {
        const key = `${shot.viewport}/${shot.name}`;
        const goldenFile = path.join(goldenDir, shot.viewport, `${shot.name}.png`);
        const small = downscale(readPng(shot.file), GOLDEN_WIDTH);
        if (UPDATE_GOLDENS) {
          writePng(goldenFile, small);
          goldenResults.push({ key, status: "updated", detail: "" });
          continue;
        }
        if (!fs.existsSync(goldenFile)) {
          goldenDrift = true;
          goldenResults.push({
            key,
            status: "missing",
            detail: "no golden; run --update-goldens"
          });
          continue;
        }
        const golden = readPng(goldenFile);
        if (golden.width !== small.width || golden.height !== small.height) {
          goldenDrift = true;
          goldenResults.push({
            key,
            status: "drift",
            detail: `size ${small.width}x${small.height} vs golden ${golden.width}x${golden.height}`
          });
          continue;
        }
        const diff = new PNG({ width: golden.width, height: golden.height });
        const changed = pixelmatch(golden.data, small.data, diff.data, golden.width, golden.height, {
          threshold: PIXELMATCH_THRESHOLD
        });
        const ratio = changed / (golden.width * golden.height);
        const detail = `${(ratio * 100).toFixed(2)}% pixels differ`;
        if (ratio > PIXEL_DIFF_RATIO) {
          goldenDrift = true;
          writePng(path.join(diffDir, shot.viewport, `${shot.name}.png`), diff);
          goldenResults.push({ key, status: "drift", detail });
        } else {
          goldenResults.push({ key, status: "ok", detail });
        }
      }
      const counts = goldenResults.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {});
      console.log(
        UPDATE_GOLDENS
          ? `Goldens updated: ${goldenResults.length} in qa/goldens/`
          : `Golden compare: ${counts.ok ?? 0} ok, ${counts.drift ?? 0} drift, ${counts.missing ?? 0} missing`
      );
    }

    const report = [
      "# Visual QA report",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Bundle: ${SKIP_BUILD ? "existing dist/" : "fresh vite build"}`,
      `Route debug overlay: ${DEBUG_ROUTES ? "on" : "off"}`,
      "",
      "## Captured screenshots",
      "",
      ...captured.map((file) => `- ${file}`),
      "",
      "## Browser errors",
      "",
      failures.length === 0
        ? "None."
        : failures
            .map((f) => `### ${f.viewport}\n${f.errors.map((e) => `- ${e}`).join("\n")}`)
            .join("\n\n"),
      ...(goldenResults.length > 0
        ? [
            "",
            "## Golden comparison",
            "",
            ...goldenResults.map((r) => `- ${r.status.toUpperCase()} ${r.key}${r.detail ? ` (${r.detail})` : ""}`)
          ]
        : [])
    ].join("\n");
    fs.writeFileSync(path.join(root, "qa", "report.md"), `${report}\n`);

    console.log(
      `\nDone: ${captured.length} screenshots in qa/screenshots/, report in qa/report.md`
    );
    if (failures.length > 0) {
      console.error("Browser errors were captured; see qa/report.md");
      process.exitCode = 1;
    }
    if (goldenDrift) {
      console.error(
        "Golden comparison failed; see qa/report.md and qa/screenshots/diffs/. " +
          "If the change is intentional, refresh with `npm run qa:visual -- --update-goldens`."
      );
      process.exitCode = 1;
    }
  } finally {
    stopServer();
  }
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
