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
 */
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const outDir = path.join(root, "qa", "screenshots");
const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}`;

const args = new Set(process.argv.slice(2));
const DEBUG_ROUTES = args.has("--debug-routes");
const SKIP_BUILD = args.has("--skip-build");

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

const waitForServer = async (url, timeoutMs = 20000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
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
  const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    cwd: root,
    stdio: "ignore"
  });
  const stopServer = () => {
    try {
      server.kill("SIGTERM");
    } catch {
      // Already gone.
    }
  };
  process.on("exit", stopServer);

  try {
    await waitForServer(BASE);
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      executablePath: chromiumPath,
      args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
    });

    const captured = [];
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
        await page.goto(`${BASE}/?time=485&paused${query}`, { waitUntil: "load" });
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
      for (const zoom of BAND_SHOTS) {
        await page.evaluate((z) => window.__shinkansen.setZoom(z), zoom);
        await shoot(`band-${zoom.toFixed(1).replace(".", "_")}`);
      }

      for (const station of CITY_SHOTS) {
        await page.evaluate((id) => {
          window.__shinkansen.focusStation(id);
          window.__shinkansen.setZoom(6.5);
        }, station);
        await shoot(`city-${station}`);
        await page.evaluate(() => window.__shinkansen.setZoom(7.5));
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
            .join("\n\n")
    ].join("\n");
    fs.writeFileSync(path.join(root, "qa", "report.md"), `${report}\n`);

    console.log(
      `\nDone: ${captured.length} screenshots in qa/screenshots/, report in qa/report.md`
    );
    if (failures.length > 0) {
      console.error("Browser errors were captured; see qa/report.md");
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
