import * as PIXI from "pixi.js";
import { Line, Station, TrainType } from "./data/types";
import { SimTrainState } from "./sim";
import {
  MacroView,
  TrainMode,
  PlateSpec,
  BAND_COUNT,
  ZOOM_MIN,
  ZOOM_MAX,
  DEFAULT_ZOOM,
  BAND_INNER_SCALE,
  CROSSFADE_MS,
  plateForBand,
  TRAIN_TEXTURES,
  TRAIN_SPRITE_AXIS,
  clamp,
  normalizeAngle,
  axisDelta,
  sampleRoute,
  lineProgress,
  ambientGradeForMinutes,
  gradeToTint,
  PALETTE
} from "./plates";

export type RenderHandles = {
  app: PIXI.Application;
  camera: PIXI.Container;
  trainSprites: Map<string, PIXI.Container>;
  stationSprites: Map<string, PIXI.Container>;
  world: PIXI.Container;
  toScreen: (lat: number, lon: number) => PIXI.Point;
  setFollowTarget: (id: string | null) => void;
  setReducedMotion: (enabled: boolean) => void;
  setQuality: (quality: "low" | "medium" | "high") => void;
  setAccuracyDebug: (enabled: boolean) => void;
  zoomBy: (factor: number) => void;
  setZoom: (zoom: number) => void;
  resetView: () => void;
  setViewMode: (mode: "japan" | "corridor" | "station") => void;
  focusStation: (id: string) => void;
  setTrainTapHandler: (handler: (id: string) => void) => void;
  setStationTapHandler: (handler: (id: string) => void) => void;
  setStationLabelLanguage: (lang: "en" | "ja") => void;
  setAmbientMinutes: (minutes: number) => void;
  update: (trains: SimTrainState[]) => void;
  getCameraCenter: () => PIXI.Point;
  getZoom: () => number;
  getZoomRange: () => { min: number; max: number };
  getStats: () => {
    trains: number;
    trackSprites: number;
    landmarks: number;
    detailLevel: number;
    detailIndex: number;
    view: MacroView;
    routeMode: string;
    trainMode: TrainMode;
    platformDetail: number;
    loadedCityArt: number;
    pendingCityArt: number;
    accuracyDebug: boolean;
  };
};

type Quality = "low" | "medium" | "high";

export const initRenderer = async (
  canvas: HTMLCanvasElement,
  lines: Line[],
  stations: Station[],
  trainTypes: TrainType[]
): Promise<RenderHandles> => {
  void trainTypes;
  const app = new PIXI.Application();
  // Size the stage from the #app element, not window.innerWidth: mobile
  // browsers (and emulators) can report a layout viewport that differs from
  // the visual one, which leaves the canvas larger than the screen and pushes
  // the world off-view.
  const appShell = document.getElementById("app") ?? document.body;
  await app.init({
    canvas,
    resizeTo: appShell as HTMLElement,
    backgroundColor: 0x0a161d,
    backgroundAlpha: 1,
    antialias: false,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true
  });

  const camera = new PIXI.Container();
  const world = new PIXI.Container();
  world.sortableChildren = true;
  camera.addChild(world);
  app.stage.addChild(camera);
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  const plateLayer = new PIXI.Container();
  plateLayer.zIndex = 0;
  const trainLayer = new PIXI.Container();
  trainLayer.zIndex = 20;
  trainLayer.sortableChildren = true;
  const stationLayer = new PIXI.Container();
  stationLayer.zIndex = 30;
  const overlayLayer = new PIXI.Container();
  overlayLayer.zIndex = 40;
  const debugLayer = new PIXI.Container();
  debugLayer.zIndex = 50;
  world.addChild(plateLayer, trainLayer, stationLayer, overlayLayer, debugLayer);

  // ---------------------------------------------------------------- state --
  const line = lines[0];
  let zoom = window.innerWidth < 760 ? DEFAULT_ZOOM - 0.25 : DEFAULT_ZOOM;
  let focusedStationId = "tokyo";
  let quality: Quality = "medium";
  let reducedMotion = false;
  let followTarget: string | null = null;
  let accuracyDebug = false;
  const routeDebug = typeof window !== "undefined" && window.location.search.includes("routedebug");
  // QA captures must be deterministic, so the idle drift stays off there.
  const qaMode =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("qa");
  let trainTapHandler: ((id: string) => void) | null = null;
  let stationTapHandler: ((id: string) => void) | null = null;
  let latestTrains: SimTrainState[] = [];
  let panX = 0;
  let panY = 0;

  // ------------------------------------------------------- ambient grade --
  // Day/night tint follows the sim clock; the current value eases toward the
  // target so scrubbing time doesn't flash (reduced motion snaps instead).
  let ambientMinutes = 720;
  const ambientCurrent = { r: 1, g: 1, b: 1 };

  // -------------------------------------------------------- idle drift --
  // After 30s without interaction the camera wanders very slowly, a calm
  // "screensaver breath". Any input eases it back out.
  const IDLE_DRIFT_DELAY_MS = 30000;
  let lastInteractionAt = performance.now();
  let driftStrength = 0;
  let driftX = 0;
  let driftY = 0;
  let driftClock = 0;
  const markInteraction = () => {
    lastInteractionAt = performance.now();
  };

  // ----------------------------------------------------- texture pipeline --
  const MAX_CACHED_PLATES = 6;
  const plateTextures = new Map<string, PIXI.Texture>();
  const pendingTextures = new Map<string, Promise<PIXI.Texture | undefined>>();
  const textureLru: string[] = [];

  const touchLru = (url: string) => {
    const idx = textureLru.indexOf(url);
    if (idx >= 0) textureLru.splice(idx, 1);
    textureLru.push(url);
    while (textureLru.length > MAX_CACHED_PLATES) {
      const evict = textureLru.shift();
      if (!evict) break;
      const inUse = plateLayer.children.some(
        (child) => child instanceof PIXI.Sprite && (child as PlateSprite).plateUrl === evict
      );
      if (inUse) {
        textureLru.push(evict);
        break;
      }
      plateTextures.delete(evict);
      void PIXI.Assets.unload(evict).catch(() => undefined);
    }
  };

  const loadPlateTexture = (url: string): Promise<PIXI.Texture | undefined> => {
    const cached = plateTextures.get(url);
    if (cached) {
      touchLru(url);
      return Promise.resolve(cached);
    }
    // Share the in-flight load: a plate switch must be able to await a
    // texture the neighbour prefetch already started, not give up on it.
    const pending = pendingTextures.get(url);
    if (pending) return pending;
    const load = (async () => {
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const texture = (await PIXI.Assets.load(url)) as PIXI.Texture;
            plateTextures.set(url, texture);
            touchLru(url);
            return texture;
          } catch (err) {
            if (attempt === 1) {
              // Keep the previous plate on screen and tell the HUD instead of
              // silently leaving an empty world.
              window.dispatchEvent(new CustomEvent("shinasmr:plate-error", { detail: { url } }));
              console.warn("Plate texture failed to load:", url, err);
            }
          }
        }
        return undefined;
      } finally {
        pendingTextures.delete(url);
      }
    })();
    pendingTextures.set(url, load);
    return load;
  };

  const trainTextures = new Map<string, PIXI.Texture>();
  await Promise.all(
    Object.entries(TRAIN_TEXTURES).map(async ([key, url]) => {
      try {
        trainTextures.set(key, (await PIXI.Assets.load(url)) as PIXI.Texture);
      } catch {
        // Train sprite missing: pins are used as fallback.
      }
    })
  );

  // ------------------------------------------------------- plate transform --
  type PlateSprite = PIXI.Sprite & {
    plateUrl?: string;
    plateSpec?: PlateSpec;
    plateBand?: number;
    platePanX?: number;
    platePanY?: number;
  };

  type PlateView = {
    spec: PlateSpec;
    texture: PIXI.Texture;
    scale: number;
    offsetX: number;
    offsetY: number;
  };

  let activeView: PlateView | null = null;
  let activeSprite: PlateSprite | null = null;
  let activeBand = 0;
  let fadingSprites: Array<{ sprite: PlateSprite; bornAt: number }> = [];

  const bandIndex = () => clamp(Math.floor(zoom), 0, BAND_COUNT - 1);
  const activePlateSpec = () => plateForBand(bandIndex(), focusedStationId);

  /**
   * Continuous cover transform for a plate that belongs to zoom band `band`.
   * The band fraction is allowed to run past [0, 1]: while the next plate's
   * texture is still loading (or the previous one is crossfading out) the
   * visible plate keeps magnifying with the live zoom value instead of
   * freezing, so the world never lags behind the input.
   */
  const computeView = (
    spec: PlateSpec,
    texture: PIXI.Texture,
    band: number,
    px = panX,
    py = panY
  ): PlateView => {
    const sw = app.screen.width;
    const sh = app.screen.height;
    const iw = texture.width;
    const ih = texture.height;
    const cover = Math.max(sw / iw, sh / ih);
    const fraction = clamp(zoom - band, -0.75, 1.75);
    const scale = cover * (1 + fraction * BAND_INNER_SCALE);
    let offsetX = sw / 2 - spec.focus[0] * iw * scale + px + driftX;
    let offsetY = sh / 2 - spec.focus[1] * ih * scale + py + driftY;
    if (iw * scale >= sw) offsetX = clamp(offsetX, sw - iw * scale, 0);
    if (ih * scale >= sh) offsetY = clamp(offsetY, sh - ih * scale, 0);
    return { spec, texture, scale, offsetX, offsetY };
  };

  const imageToScreen = (view: PlateView, nx: number, ny: number) =>
    new PIXI.Point(
      view.offsetX + nx * view.texture.width * view.scale,
      view.offsetY + ny * view.texture.height * view.scale
    );

  const routePoseToScreen = (view: PlateView, t: number) => {
    const pose = sampleRoute(view.spec.route, t);
    const point = imageToScreen(view, pose.x, pose.y);
    // Tangent in screen space: uniform scale per axis (x and y scale equally
    // because the cover transform is uniform), so only aspect of the source
    // normalized coords matters.
    const tx = pose.tangent.x * view.texture.width;
    const ty = pose.tangent.y * view.texture.height;
    const len = Math.hypot(tx, ty) || 1;
    return { point, tangent: new PIXI.Point(tx / len, ty / len) };
  };

  // -------------------------------------------------------- station chips --
  const stationSprites = new Map<string, PIXI.Container>();
  let stationLabelLang: "en" | "ja" = "en";

  const stationLabel = (station: Station) =>
    stationLabelLang === "ja" && station.name_local ? station.name_local : station.name_en;

  const buildStationChip = (station: Station) => {
    const chip = new PIXI.Container();
    const text = new PIXI.Text({
      text: stationLabel(station),
      style: {
        fontFamily: "Verdana, Trebuchet MS, sans-serif",
        fontSize: 12,
        fontWeight: "700",
        fill: PALETTE.label,
        dropShadow: { color: "#02070b", blur: 2, distance: 1, alpha: 0.9 }
      }
    });
    text.anchor.set(0.5, 1);
    text.position.set(0, -12);
    const bg = new PIXI.Graphics();
    bg.roundRect(-text.width / 2 - 8, -text.height - 18, text.width + 16, text.height + 10, 4)
      .fill({ color: PALETTE.ink, alpha: 0.66 })
      .stroke({ width: 1, color: PALETTE.glow, alpha: 0.35 });
    const dot = new PIXI.Graphics();
    dot.circle(0, 0, 4).fill({ color: PALETTE.gold, alpha: 0.95 });
    dot.circle(0, 0, 7).stroke({ width: 1.4, color: PALETTE.label, alpha: 0.75 });
    chip.addChild(bg, text, dot);
    chip.eventMode = "static";
    chip.cursor = "pointer";
    chip.on("pointertap", () => stationTapHandler?.(station.id));
    return chip;
  };

  const rebuildStationChips = () => {
    stationSprites.forEach((chip) => chip.destroy({ children: true }));
    stationSprites.clear();
    stations.forEach((station) => {
      const chip = buildStationChip(station);
      stationLayer.addChild(chip);
      stationSprites.set(station.id, chip);
    });
  };
  rebuildStationChips();

  const layoutStations = () => {
    const view = activeView;
    stations.forEach((station) => {
      const chip = stationSprites.get(station.id);
      if (!chip) return;
      const anchorT = view?.spec.stations[station.id];
      if (!view || anchorT === undefined) {
        chip.visible = false;
        return;
      }
      const pose = routePoseToScreen(view, anchorT);
      chip.position.copyFrom(pose.point);
      const emphasis = station.id === focusedStationId ? 1 : 0.86;
      chip.scale.set(emphasis * (view.spec.macro === "city" ? 1.08 : 0.94));
      chip.alpha = view.spec.macro === "city" && station.id !== focusedStationId ? 0 : 1;
      chip.visible = chip.alpha > 0;
    });
  };

  // ---------------------------------------------------------- route debug --
  const layoutDebug = () => {
    debugLayer.removeChildren().forEach((node) => node.destroy({ children: true }));
    if (!routeDebug || !activeView) return;
    const g = new PIXI.Graphics();
    const steps = 64;
    for (let i = 0; i <= steps; i += 1) {
      const pose = routePoseToScreen(activeView, i / steps);
      if (i === 0) g.moveTo(pose.point.x, pose.point.y);
      else g.lineTo(pose.point.x, pose.point.y);
    }
    g.stroke({ width: 2, color: 0xff4fd8, alpha: 0.9 });
    Object.entries(activeView.spec.stations).forEach(([id, t]) => {
      if (t === undefined) return;
      const pose = routePoseToScreen(activeView!, t);
      g.circle(pose.point.x, pose.point.y, 6).stroke({ width: 2, color: 0x59d8ff, alpha: 0.95 });
      void id;
    });
    debugLayer.addChild(g);
  };

  // ------------------------------------------------------ accuracy overlay --
  const accuracyPanel = new PIXI.Container();
  accuracyPanel.visible = false;
  overlayLayer.addChild(accuracyPanel);

  const layoutAccuracyPanel = () => {
    accuracyPanel.removeChildren().forEach((node) => node.destroy({ children: true }));
    if (!accuracyDebug) return;
    const W = 264;
    const H = 170;
    const PAD = 18;
    accuracyPanel.position.set(16, app.screen.height - H - 64);

    const bg = new PIXI.Graphics();
    bg.roundRect(0, 0, W, H, 8).fill({ color: PALETTE.ink, alpha: 0.82 }).stroke({
      width: 1,
      color: PALETTE.glow,
      alpha: 0.4
    });
    accuracyPanel.addChild(bg);

    const title = new PIXI.Text({
      text: "True coordinates (debug)",
      style: {
        fontFamily: "Verdana, sans-serif",
        fontSize: 10,
        fontWeight: "700",
        fill: PALETTE.glow
      }
    });
    title.position.set(10, 8);
    accuracyPanel.addChild(title);

    const lats = line.polyline.map((p) => p[0]);
    const lons = line.polyline.map((p) => p[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const px = (lon: number) =>
      PAD + ((lon - minLon) / Math.max(1e-9, maxLon - minLon)) * (W - PAD * 2);
    const py = (lat: number) =>
      H - PAD - ((lat - minLat) / Math.max(1e-9, maxLat - minLat)) * (H - PAD * 2 - 14);

    const g = new PIXI.Graphics();
    line.polyline.forEach(([lat, lon], i) => {
      if (i === 0) g.moveTo(px(lon), py(lat));
      else g.lineTo(px(lon), py(lat));
    });
    g.stroke({ width: 1.6, color: 0x59d8ff, alpha: 0.9 });
    stations.forEach((station) => {
      g.circle(px(station.lon), py(station.lat), 3).fill({ color: PALETTE.gold, alpha: 0.95 });
    });
    accuracyPanel.addChild(g);

    const live = new PIXI.Graphics();
    live.label = "live";
    accuracyPanel.addChild(live);
    (
      accuracyPanel as PIXI.Container & {
        liveProject?: (lat: number, lon: number) => [number, number];
      }
    ).liveProject = (lat: number, lon: number) => [px(lon), py(lat)];
  };

  const updateAccuracyTrains = () => {
    if (!accuracyDebug) return;
    const panel = accuracyPanel as PIXI.Container & {
      liveProject?: (lat: number, lon: number) => [number, number];
    };
    const live = accuracyPanel.children.find((c) => c.label === "live") as
      | PIXI.Graphics
      | undefined;
    if (!live || !panel.liveProject) return;
    live.clear();
    latestTrains.forEach((train) => {
      const [x, y] = panel.liveProject!(train.lat, train.lon);
      live.circle(x, y, 2.4).fill({ color: 0xffffff, alpha: 0.95 });
    });
  };

  // --------------------------------------------------------------- plates --
  let plateGeneration = 0;

  const showPlate = async (spec: PlateSpec, band: number, immediate = false) => {
    const generation = ++plateGeneration;
    const texture = await loadPlateTexture(spec.url);
    if (!texture || generation !== plateGeneration) return;

    if (activeSprite) {
      const old = activeSprite;
      if (immediate || reducedMotion) {
        old.destroy();
      } else {
        // The outgoing plate keeps the pan it was viewed with; the live pan
        // resets so the incoming plate opens centered on its focus.
        old.platePanX = panX;
        old.platePanY = panY;
        fadingSprites.push({ sprite: old, bornAt: performance.now() });
      }
    }
    panX = 0;
    panY = 0;
    const sprite = new PIXI.Sprite(texture) as PlateSprite;
    sprite.plateUrl = spec.url;
    sprite.plateSpec = spec;
    sprite.plateBand = band;
    sprite.alpha = immediate || reducedMotion ? 1 : 0;
    plateLayer.addChild(sprite);
    activeSprite = sprite;
    activeBand = band;
    activeView = computeView(spec, texture, band);
    layoutPlate();
    layoutStations();
    layoutDebug();
    prefetchNeighbours();
  };

  const layoutPlate = () => {
    if (!activeSprite || !activeView) return;
    activeView = computeView(activeView.spec, activeView.texture, activeBand);
    activeSprite.position.set(activeView.offsetX, activeView.offsetY);
    activeSprite.scale.set(activeView.scale);
    // Outgoing plates keep tracking the live zoom while they fade so a fast
    // zoom never shows a frozen world underneath the crossfade.
    for (const { sprite } of fadingSprites) {
      if (!sprite.plateSpec || sprite.plateBand === undefined) continue;
      const view = computeView(
        sprite.plateSpec,
        sprite.texture,
        sprite.plateBand,
        sprite.platePanX ?? 0,
        sprite.platePanY ?? 0
      );
      sprite.position.set(view.offsetX, view.offsetY);
      sprite.scale.set(view.scale);
    }
    if (routeDebug) {
      console.info(
        `[plate] ${activeView.spec.id} tex=${activeView.texture.width}x${activeView.texture.height} ` +
          `scale=${activeView.scale.toFixed(3)} offset=${activeView.offsetX.toFixed(0)},${activeView.offsetY.toFixed(0)} ` +
          `screen=${app.screen.width}x${app.screen.height} pan=${panX.toFixed(0)},${panY.toFixed(0)}`
      );
    }
  };

  const prefetchNeighbours = () => {
    const band = bandIndex();
    [band - 1, band + 1]
      .filter((b) => b >= 0 && b < BAND_COUNT)
      .forEach((b) => void loadPlateTexture(plateForBand(b, focusedStationId).url));
  };

  const syncPlate = (immediate = false) => {
    const spec = activePlateSpec();
    if (!activeView || activeView.spec.id !== spec.id) {
      // Pan stays live while the next texture loads; showPlate resets it at
      // the actual swap so the visible plate never jumps mid-zoom.
      void showPlate(spec, bandIndex(), immediate);
    }
    layoutPlate();
    layoutStations();
    layoutDebug();
  };

  // Crossfade ticker: fade the active plate in over the previous one, then
  // drop the old texture reference so the LRU can evict it.
  app.ticker.add(() => {
    const now = performance.now();
    if (activeSprite && activeSprite.alpha < 1) {
      const step = reducedMotion ? 1 : app.ticker.deltaMS / CROSSFADE_MS;
      activeSprite.alpha = Math.min(1, activeSprite.alpha + step);
    }
    if (activeSprite && activeSprite.alpha >= 1 && fadingSprites.length > 0) {
      fadingSprites = fadingSprites.filter(({ sprite, bornAt }) => {
        if (now - bornAt > CROSSFADE_MS + 80) {
          sprite.destroy();
          return false;
        }
        return true;
      });
    }
  });

  // Ambient grade ticker: ease the plate tint toward the sim clock's grade.
  app.ticker.add(() => {
    const target = ambientGradeForMinutes(ambientMinutes);
    const blend = reducedMotion ? 1 : Math.min(1, app.ticker.deltaMS / 1200);
    ambientCurrent.r += (target.r - ambientCurrent.r) * blend;
    ambientCurrent.g += (target.g - ambientCurrent.g) * blend;
    ambientCurrent.b += (target.b - ambientCurrent.b) * blend;
    const tint = gradeToTint(ambientCurrent);
    if (activeSprite) activeSprite.tint = tint;
    for (const { sprite } of fadingSprites) sprite.tint = tint;
  });

  // Idle drift ticker: ease a slow Lissajous wander in after 30s idle.
  app.ticker.add(() => {
    const allowDrift = !reducedMotion && !qaMode;
    const idle = performance.now() - lastInteractionAt > IDLE_DRIFT_DELAY_MS;
    const targetStrength = allowDrift && idle ? 1 : 0;
    const blend = Math.min(1, app.ticker.deltaMS / 2400);
    driftStrength += (targetStrength - driftStrength) * blend;
    if (driftStrength < 0.002) {
      if (driftX !== 0 || driftY !== 0) {
        driftX = 0;
        driftY = 0;
        driftClock = 0;
        layoutPlate();
        layoutStations();
        layoutDebug();
        updateTrains(latestTrains);
      }
      return;
    }
    driftClock += app.ticker.deltaMS / 1000;
    const reach = Math.min(app.screen.width, app.screen.height) * 0.02;
    driftX = Math.sin(driftClock * ((Math.PI * 2) / 47)) * reach * driftStrength;
    driftY = Math.sin(driftClock * ((Math.PI * 2) / 61) + 1.3) * reach * 0.8 * driftStrength;
    layoutPlate();
    layoutStations();
    layoutDebug();
    updateTrains(latestTrains);
  });

  // --------------------------------------------------------------- trains --
  type TrainVisual = {
    container: PIXI.Container;
    sprite: PIXI.Sprite | null;
    pin: PIXI.Graphics;
    mode: TrainMode | null;
    displayX: number;
    displayY: number;
    rotation: number;
    hasDisplay: boolean;
    lastProgress: number;
    direction: 1 | -1;
    alpha: number;
    targetAlpha: number;
  };

  const trainSprites = new Map<string, PIXI.Container>();
  const trainVisuals = new Map<string, TrainVisual>();

  const ensureTrainVisual = (train: SimTrainState): TrainVisual => {
    let visual = trainVisuals.get(train.id);
    if (visual) return visual;
    const container = new PIXI.Container();
    container.eventMode = "static";
    container.cursor = "pointer";
    container.on("pointertap", () => trainTapHandler?.(train.id));

    const texture = trainTextures.get(train.trainTypeId) ?? trainTextures.get("n700s") ?? null;
    let sprite: PIXI.Sprite | null = null;
    if (texture) {
      sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5, 0.56);
      container.addChild(sprite);
    }
    const pin = new PIXI.Graphics();
    pin.circle(0, 0, 5).fill({ color: 0xffffff, alpha: 0.95 });
    pin.circle(0, 0, 9).stroke({ width: 2, color: PALETTE.blue, alpha: 0.8 });
    pin.circle(0, 0, 13).stroke({ width: 1, color: PALETTE.glow, alpha: 0.3 });
    container.addChild(pin);

    trainLayer.addChild(container);
    visual = {
      container,
      sprite,
      pin,
      mode: null,
      displayX: 0,
      displayY: 0,
      rotation: 0,
      hasDisplay: false,
      lastProgress: -1,
      direction: 1,
      alpha: 0,
      targetAlpha: 1
    };
    trainVisuals.set(train.id, visual);
    trainSprites.set(train.id, container);
    return visual;
  };

  const removeTrainVisual = (id: string) => {
    const visual = trainVisuals.get(id);
    if (!visual) return;
    visual.container.destroy({ children: true });
    trainVisuals.delete(id);
    trainSprites.delete(id);
  };

  const updateTrains = (trains: SimTrainState[]) => {
    const view = activeView;
    const seen = new Set<string>();
    if (view) {
      const [c0, c1] = view.spec.coverage;
      const span = Math.max(1e-6, c1 - c0);
      const margin = span * 0.06;
      const plateWidthScreen = view.texture.width * view.scale;
      const dwellSlots = new Map<string, number>();

      trains.forEach((train) => {
        // The sim provides exact track-offset progress; deriving it from
        // lat/lon is only the fallback for externally injected states.
        const p = train.lineFraction ?? lineProgress(line, train.lat, train.lon);
        if (p < c0 - margin || p > c1 + margin) {
          // Fade out instead of popping when a train leaves the plate.
          const existing = trainVisuals.get(train.id);
          if (existing) existing.targetAlpha = 0;
          seen.add(train.id);
          return;
        }
        const visual = ensureTrainVisual(train);
        seen.add(train.id);
        visual.targetAlpha = 1;

        if (visual.lastProgress >= 0 && Math.abs(p - visual.lastProgress) > 1e-7) {
          visual.direction = p > visual.lastProgress ? 1 : -1;
        }
        visual.lastProgress = p;

        const t = clamp((p - c0) / span, 0, 1);
        const pose = routePoseToScreen(view, t);

        // Seat the train on a plausible track: moving services keep to a side
        // by direction, dwelling services spread across the platform lanes.
        const lanes = view.spec.lanes ?? 1;
        const spread = (view.spec.laneSpread ?? 0) * plateWidthScreen;
        let laneOffset = 0;
        if (lanes > 1 && spread > 0) {
          if (train.status === "dwell" || train.status === "idle") {
            const key = train.nextStationId ?? "terminal";
            const slot = dwellSlots.get(key) ?? 0;
            dwellSlots.set(key, slot + 1);
            const lane = (slot % lanes) - (lanes - 1) / 2;
            laneOffset = lane * spread;
          } else {
            laneOffset = visual.direction * spread * 0.5;
          }
        }
        const nx = -pose.tangent.y;
        const ny = pose.tangent.x;
        const targetX = pose.point.x + nx * laneOffset;
        const targetY = pose.point.y + ny * laneOffset;

        if (
          !visual.hasDisplay ||
          Math.hypot(targetX - visual.displayX, targetY - visual.displayY) > 320
        ) {
          visual.displayX = targetX;
          visual.displayY = targetY;
          visual.hasDisplay = true;
        } else {
          // QA captures snap so trains sit at their exact simulated pose.
          const blend = reducedMotion || qaMode ? 1 : 0.16;
          visual.displayX += (targetX - visual.displayX) * blend;
          visual.displayY += (targetY - visual.displayY) * blend;
        }
        visual.container.position.set(visual.displayX, visual.displayY);
        visual.container.zIndex = visual.displayY;

        const mode = view.spec.trainMode;
        const usePin = mode === "pin" || !visual.sprite;
        visual.pin.visible = usePin;
        if (visual.sprite) visual.sprite.visible = !usePin;
        visual.mode = mode;

        if (!usePin && visual.sprite) {
          const sprite = visual.sprite;
          const targetLength =
            view.spec.trainScale * plateWidthScreen * (mode === "mini" ? 0.85 : 1);
          const scale = targetLength / sprite.texture.width;

          const theta = Math.atan2(pose.tangent.y, pose.tangent.x);
          // The consist sprites are double-ended, so we only align the body
          // axis with the rail; mirroring picks whichever of the two isometric
          // diagonals needs the smaller residual rotation.
          const plain = axisDelta(TRAIN_SPRITE_AXIS, theta);
          const mirrored = axisDelta(Math.PI - TRAIN_SPRITE_AXIS, theta);
          const useMirror = Math.abs(mirrored) < Math.abs(plain);
          const desired = clamp(useMirror ? mirrored : plain, -0.6, 0.6);
          const blend = reducedMotion || qaMode || quality === "low" ? 1 : 0.2;
          visual.rotation += normalizeAngle(desired - visual.rotation) * blend;
          sprite.rotation = visual.rotation;
          sprite.scale.set(useMirror ? -scale : scale, scale);
        } else {
          const pinScale = view.spec.macro === "overview" ? 0.8 : 1;
          visual.pin.scale.set(pinScale);
        }
      });
    }

    Array.from(trainVisuals.keys()).forEach((id) => {
      if (!seen.has(id)) removeTrainVisual(id);
    });

    // Ease train visibility so coverage-edge crossings breathe in and out.
    const fadeBlend = reducedMotion || qaMode ? 1 : Math.min(1, app.ticker.deltaMS / 300);
    trainVisuals.forEach((visual) => {
      visual.alpha += (visual.targetAlpha - visual.alpha) * fadeBlend;
      visual.container.alpha = visual.alpha;
      visual.container.visible = visual.alpha > 0.02;
    });
    updateAccuracyTrains();
  };

  // ------------------------------------------------------------ camera ops --
  let zoomTweenTarget: number | null = null;

  const setZoomImmediate = (next: number) => {
    const clamped = clamp(next, ZOOM_MIN, ZOOM_MAX);
    if (Math.abs(clamped - zoom) < 1e-4) return;
    const bandBefore = bandIndex();
    zoom = clamped;
    if (bandIndex() !== bandBefore) {
      syncPlate();
    } else {
      layoutPlate();
      layoutStations();
      layoutDebug();
    }
    updateTrains(latestTrains);
  };

  const zoomTo = (next: number) => {
    markInteraction();
    // QA captures need exact zoom states, so the tween snaps there too.
    if (reducedMotion || qaMode) {
      zoomTweenTarget = null;
      setZoomImmediate(next);
      return;
    }
    zoomTweenTarget = clamp(next, ZOOM_MIN, ZOOM_MAX);
  };

  app.ticker.add(() => {
    if (zoomTweenTarget === null) return;
    const delta = zoomTweenTarget - zoom;
    if (Math.abs(delta) < 0.005) {
      setZoomImmediate(zoomTweenTarget);
      zoomTweenTarget = null;
      return;
    }
    setZoomImmediate(zoom + delta * Math.min(1, app.ticker.deltaMS / 240));
  });

  const focusStation = (id: string) => {
    const station = stations.find((s) => s.id === id);
    if (!station) return;
    markInteraction();
    const changed = focusedStationId !== station.id;
    focusedStationId = station.id;
    if (changed && bandIndex() >= 6) {
      syncPlate();
      updateTrains(latestTrains);
    }
    if (zoom < 6) zoomTo(6.45);
  };

  const setViewMode = (mode: "japan" | "corridor" | "station") => {
    if (mode === "japan") zoomTo(0.5);
    else if (mode === "corridor") zoomTo(2.4);
    else zoomTo(zoom >= 6 ? zoom : 6.45);
  };

  const resetView = () => {
    panX = 0;
    panY = 0;
    focusedStationId = "tokyo";
    zoomTo(DEFAULT_ZOOM);
    syncPlate();
  };

  // ---------------------------------------------------------- interaction --
  const pointers = new Map<number, PIXI.Point>();
  let pinchBaseDist = 0;
  let pinchBaseZoom = 0;

  app.stage.on("pointerdown", (e) => {
    markInteraction();
    pointers.set(e.pointerId, new PIXI.Point(e.global.x, e.global.y));
    if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      pinchBaseDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchBaseZoom = zoom;
    }
  });
  app.stage.on("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    markInteraction();
    const next = new PIXI.Point(e.global.x, e.global.y);
    if (pointers.size === 1) {
      panX += next.x - prev.x;
      panY += next.y - prev.y;
      layoutPlate();
      layoutStations();
      layoutDebug();
      updateTrains(latestTrains);
    } else if (pointers.size === 2) {
      pointers.set(e.pointerId, next);
      const [a, b] = Array.from(pointers.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchBaseDist > 0) {
        zoomTweenTarget = null;
        setZoomImmediate(pinchBaseZoom + Math.log2(dist / pinchBaseDist) * 1.4);
      }
      return;
    }
    pointers.set(e.pointerId, next);
  });
  const releasePointer = (e: PIXI.FederatedPointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchBaseDist = 0;
  };
  app.stage.on("pointerup", releasePointer);
  app.stage.on("pointerupoutside", releasePointer);
  app.stage.on("pointercancel", releasePointer);

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      // Accumulate into the tween target so wheel zoom glides instead of
      // stepping per event.
      zoomTo((zoomTweenTarget ?? zoom) - e.deltaY * 0.0016);
    },
    { passive: false }
  );

  app.renderer.on("resize", () => {
    layoutPlate();
    layoutStations();
    layoutDebug();
    layoutAccuracyPanel();
    updateTrains(latestTrains);
  });

  // ---------------------------------------------------------------- public --
  const toScreen = (lat: number, lon: number) => {
    const view = activeView;
    if (!view) return new PIXI.Point(app.screen.width / 2, app.screen.height / 2);
    const [c0, c1] = view.spec.coverage;
    const span = Math.max(1e-6, c1 - c0);
    const p = lineProgress(line, lat, lon);
    const t = (p - c0) / span;
    const clampedT = clamp(t, 0, 1);
    const pose = routePoseToScreen(view, clampedT);
    // Off-plate positions are pushed along the route tangent so audio
    // proximity falls away smoothly instead of pinning to the plate edge.
    const overflow = (t - clampedT) * view.texture.width * view.scale;
    return new PIXI.Point(
      pose.point.x + pose.tangent.x * overflow,
      pose.point.y + pose.tangent.y * overflow
    );
  };

  const update = (trains: SimTrainState[]) => {
    latestTrains = trains;
    updateTrains(trains);

    if (followTarget) {
      const visual = trainVisuals.get(followTarget);
      if (visual && visual.container.visible) {
        const dx = app.screen.width / 2 - visual.displayX;
        const dy = app.screen.height / 2 - visual.displayY;
        const amount = reducedMotion ? 1 : 0.05;
        panX += dx * amount;
        panY += dy * amount;
        layoutPlate();
        layoutStations();
        layoutDebug();
      }
    }
  };

  if (routeDebug) {
    (window as Window & { __plateDebug?: unknown }).__plateDebug = () =>
      plateLayer.children.map((child) => ({
        url: (child as PlateSprite).plateUrl,
        alpha: child.alpha,
        x: child.x,
        y: child.y,
        scale: (child as PIXI.Sprite).scale.x,
        visible: child.visible
      }));
  }

  // Initial view.
  syncPlate(true);
  await loadPlateTexture(activePlateSpec().url);

  return {
    app,
    camera,
    trainSprites,
    stationSprites,
    world,
    toScreen,
    setFollowTarget: (id) => {
      followTarget = id;
    },
    setReducedMotion: (enabled) => {
      reducedMotion = enabled;
    },
    setQuality: (next) => {
      quality = next;
    },
    setAccuracyDebug: (enabled) => {
      accuracyDebug = enabled;
      accuracyPanel.visible = enabled;
      document.body.classList.toggle("accuracy-debug", enabled);
      layoutAccuracyPanel();
    },
    zoomBy: (factor) => {
      zoomTo((zoomTweenTarget ?? zoom) + Math.log2(factor) * 0.9);
    },
    setZoom: (next) => {
      zoomTo(next);
    },
    resetView,
    setViewMode,
    focusStation,
    setTrainTapHandler: (handler) => {
      trainTapHandler = handler;
    },
    setStationTapHandler: (handler) => {
      stationTapHandler = handler;
    },
    setStationLabelLanguage: (lang) => {
      if (lang === stationLabelLang) return;
      stationLabelLang = lang;
      rebuildStationChips();
      layoutStations();
    },
    setAmbientMinutes: (minutes) => {
      ambientMinutes = minutes;
    },
    update,
    getCameraCenter: () => new PIXI.Point(app.screen.width / 2, app.screen.height / 2),
    // The live zoom, not the tween target: HUD readouts track the glide.
    getZoom: () => zoom,
    getZoomRange: () => ({ min: ZOOM_MIN, max: ZOOM_MAX }),
    getStats: () => ({
      trains: Array.from(trainVisuals.values()).filter((v) => v.container.visible).length,
      trackSprites: plateTextures.size,
      landmarks: 0,
      detailLevel: bandIndex() + 1,
      detailIndex: bandIndex(),
      view: activeView?.spec.macro ?? "city",
      routeMode: activeView?.spec.id ?? "loading",
      trainMode: activeView?.spec.trainMode ?? "full",
      platformDetail: 0,
      loadedCityArt: plateTextures.size,
      pendingCityArt: pendingTextures.size,
      accuracyDebug
    })
  };
};
