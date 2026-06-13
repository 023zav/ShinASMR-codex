import "./style.css";
import stations from "./data/seed/stations.json";
import lines from "./data/seed/lines.json";
import trainTypes from "./data/seed/train_types.json";
import services from "./data/seed/services.json";
import derivedRuntime from "./data/derived_runtime.json";
import {
  StationsSchema,
  LinesSchema,
  TrainTypesSchema,
  ServicesSchema,
  DerivedRuntimeSchema
} from "./data/types";
import {
  initI18n,
  t,
  getLang,
  setLang,
  applyStaticTranslations,
  formatDate,
  formatNumber,
  Lang
} from "./i18n";
import { Simulation } from "./sim";

// Real-world reference data for the five featured Tokaido Shinkansen stops:
// platform layout, operational distance from Tokyo, and approximate daily
// Shinkansen riders (public pre-2020 figures, rounded).
const STATION_FACTS: Record<
  string,
  { platforms: { en: string; ja: string }; km: number; riders: number }
> = {
  tokyo: { platforms: { en: "3 platforms · 6 tracks", ja: "3面6線" }, km: 0, riders: 93000 },
  yokohama: { platforms: { en: "2 platforms · 4 tracks", ja: "2面4線" }, km: 28.8, riders: 33000 },
  nagoya: { platforms: { en: "2 platforms · 4 tracks", ja: "2面4線" }, km: 366.0, riders: 69000 },
  kyoto: { platforms: { en: "2 platforms · 4 tracks", ja: "2面4線" }, km: 513.6, riders: 36000 },
  osaka: { platforms: { en: "5 platforms · 8 tracks", ja: "5面8線" }, km: 552.6, riders: 85000 }
};

/** Current wall-clock time in Japan (the corridor's timezone), in minutes. */
const nowJstMinutes = () => {
  const utc = Date.now() + new Date().getTimezoneOffset() * 60000;
  return Math.floor((utc / 60000 + 9 * 60) % 1440);
};

const DEFAULT_TOKYO_ART = `${import.meta.env.BASE_URL}assets-generated/lod-style-v2/lod-08-tokyo-station-close.webp`;

const errorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
};

const isWebGLStartupError = (err: unknown) => {
  const msg = errorMessage(err);
  return /webgl|webgpu|context|renderer/i.test(msg);
};

const showNoWebglFallback = (err: unknown) => {
  const loadingScreen = document.getElementById("loadingScreen") as HTMLDivElement | null;
  const loadingStatus = document.getElementById("loadingStatus") as HTMLDivElement | null;
  const artLayer = document.getElementById("artLayer") as HTMLDivElement | null;
  const scene = document.getElementById("scene") as HTMLCanvasElement | null;
  const details = document.getElementById("details") as HTMLDivElement | null;
  const perfHud = document.getElementById("perfHud") as HTMLDivElement | null;

  document.body.classList.remove("is-loading");
  document.body.classList.add("is-ready", "generated-world", "no-webgl");
  document.body.dataset.view = "city";
  document.body.dataset.detail = "15";
  document.body.dataset.station = "tokyo";

  if (artLayer) {
    artLayer.dataset.view = "city";
    artLayer.dataset.detail = "15";
    artLayer.dataset.station = "tokyo";
    artLayer.style.setProperty("--world-art-url", `url("${DEFAULT_TOKYO_ART}")`);
    artLayer.style.setProperty("--world-art-position", "center center");
    artLayer.style.setProperty("--world-art-size", "cover");
    artLayer.style.setProperty(
      "background-image",
      `linear-gradient(180deg, rgba(4, 12, 15, 0.02), rgba(4, 12, 15, 0.08)), url("${DEFAULT_TOKYO_ART}")`,
      "important"
    );
    artLayer.style.setProperty("opacity", "1", "important");
  }

  if (scene) scene.hidden = true;
  if (loadingStatus)
    loadingStatus.textContent =
      "WebGL is unavailable in this browser context; showing generated Tokyo Station fallback.";
  if (loadingScreen) {
    window.setTimeout(() => loadingScreen.classList.add("hidden"), 240);
  }
  if (details) {
    const title = details.querySelector(".details-title");
    const body = details.querySelector(".details-body");
    if (title) title.textContent = "Tokyo Station preview";
    if (body) {
      body.innerHTML = `
        <div class="train-preview train-preview-n700s" aria-hidden="true"></div>
        <div class="detail-row"><span>Renderer</span><strong>CSS fallback</strong></div>
        <div class="detail-row"><span>Reason</span><strong>WebGL unavailable</strong></div>
        <div class="detail-row"><span>Experience</span><strong>Generated art preview</strong></div>`;
    }
  }
  if (perfHud) perfHud.textContent = "CSS fallback | WebGL unavailable";
  console.warn("WebGL renderer unavailable; activated generated-art fallback.", err);
};

if (import.meta.env.DEV && "serviceWorker" in navigator) {
  // Dev on the same origin can be haunted by an old PWA worker from a
  // previous production-like run, so we clear it aggressively.
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      registration.unregister().catch(() => undefined);
    });
  });
  if ("caches" in window) {
    caches.keys().then((keys) => {
      keys.forEach((key) => {
        caches.delete(key).catch(() => undefined);
      });
    });
  }
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => {
      console.warn("Service worker registration failed", err);
    });
  });
}

const boot = async () => {
  const loadingScreen = document.getElementById("loadingScreen") as HTMLDivElement | null;
  const loadingStatus = document.getElementById("loadingStatus") as HTMLDivElement | null;
  const setBootStatus = (message: string) => {
    if (loadingStatus) loadingStatus.textContent = message;
  };

  document.body.classList.add("is-loading");
  setBootStatus("Loading timetable and station data");
  await initI18n();
  applyStaticTranslations();
  setBootStatus(t("loading_data"));

  const parsedStations = StationsSchema.parse(stations);
  const parsedLines = LinesSchema.parse(lines);
  const parsedTrainTypes = TrainTypesSchema.parse(trainTypes);
  const parsedServices = ServicesSchema.parse(services);
  const parsedRuntime = DerivedRuntimeSchema.parse(derivedRuntime);

  setBootStatus(t("loading_renderer"));
  const [{ initRenderer }, { AudioEngine }] = await Promise.all([
    import("./render"),
    import("./audio")
  ]);

  setBootStatus(t("loading_scene"));
  const canvas = document.getElementById("scene") as HTMLCanvasElement;
  const renderer = await initRenderer(canvas, parsedLines, parsedStations, parsedTrainTypes);
  const sim = new Simulation(
    parsedLines,
    parsedServices,
    parsedStations,
    parsedTrainTypes,
    parsedRuntime
  );
  const audio = new AudioEngine();

  // The clock follows real Japan time by default. Deterministic state for
  // visual QA runs and shareable links: ?time=480 sets the simulated clock
  // (minutes), ?paused freezes it, ?zoom=6.5 selects the zoom band,
  // ?station=kyoto sets the focus city.
  const queryParams = new URLSearchParams(window.location.search);
  // ?qa pins anything wall-clock-dependent so screenshot runs are
  // reproducible (the renderer also disables idle drift and zoom tweens).
  const qaMode = queryParams.has("qa");
  const hudDate = () => (qaMode ? new Date(2026, 0, 1) : new Date());
  const timeParam = Number(queryParams.get("time"));
  sim.setTime(Number.isFinite(timeParam) && queryParams.has("time") ? timeParam : nowJstMinutes());
  if (queryParams.has("paused")) sim.setPlaying(false);
  const stationParam = queryParams.get("station");
  if (stationParam) renderer.focusStation(stationParam);
  const zoomParam = Number(queryParams.get("zoom"));
  if (Number.isFinite(zoomParam) && queryParams.has("zoom")) renderer.setZoom(zoomParam);

  // Automation hook used by scripts/visual-qa.mjs.
  (window as Window & { __shinkansen?: unknown }).__shinkansen = {
    setZoom: (z: number) => renderer.setZoom(z),
    getZoom: () => renderer.getZoom(),
    focusStation: (id: string) => renderer.focusStation(id),
    setViewMode: (mode: "japan" | "corridor" | "station") => renderer.setViewMode(mode),
    setTime: (minutes: number) => sim.setTime(minutes),
    setPlaying: (playing: boolean) => sim.setPlaying(playing),
    setLang: (lang: Lang) => switchLanguage(lang),
    getStats: () => renderer.getStats()
  };

  const playPauseBtn = document.getElementById("playPause") as HTMLButtonElement;
  const speedBtns = Array.from(document.querySelectorAll<HTMLButtonElement>(".speed button"));
  const timeScrub = document.getElementById("timeScrub") as HTMLInputElement;
  const timeLabel = document.getElementById("timeLabel") as HTMLDivElement;
  const details = document.getElementById("details") as HTMLDivElement;
  const detailsTitle = details.querySelector(".details-title") as HTMLDivElement;
  const detailsBody = details.querySelector(".details-body") as HTMLDivElement;
  const followToggle = document.getElementById("followToggle") as HTMLInputElement;
  const reducedMotionToggle = document.getElementById("reducedMotionToggle") as HTMLInputElement;
  const accuracyDebugToggle = document.getElementById("accuracyDebugToggle") as HTMLInputElement;
  const soundBtn = document.getElementById("soundBtn") as HTMLButtonElement;
  const volume = document.getElementById("volume") as HTMLInputElement;
  const aboutBtn = document.getElementById("aboutBtn") as HTMLButtonElement;
  const aboutModal = document.getElementById("aboutModal") as HTMLDivElement;
  const aboutClose = document.getElementById("aboutClose") as HTMLButtonElement;
  const lineFilter = document.getElementById("lineFilter") as HTMLSelectElement;
  const trainFilter = document.getElementById("trainFilter") as HTMLSelectElement;
  const perfHud = document.getElementById("perfHud") as HTMLDivElement;
  const perfStats = document.getElementById("perfStats") as HTMLDivElement;
  const viewModeSelect = document.getElementById("viewModeSelect") as HTMLSelectElement;
  const qualitySelect = document.getElementById("qualitySelect") as HTMLSelectElement;
  const zoomIn = document.getElementById("zoomIn") as HTMLButtonElement;
  const zoomOut = document.getElementById("zoomOut") as HTMLButtonElement;
  const zoomReset = document.getElementById("zoomReset") as HTMLButtonElement;
  const zoomSlider = document.getElementById("zoomSlider") as HTMLInputElement;
  const activeServiceMetric = document.getElementById("activeServiceMetric") as HTMLSpanElement;
  const timetableList = document.getElementById("timetableList") as HTMLDivElement;
  const notificationFeed = document.getElementById("notificationFeed") as HTMLDivElement;
  const lodDebug = document.getElementById("lodDebug") as HTMLElement;
  const lodDebugToggle = document.getElementById("lodDebugToggle") as HTMLButtonElement;
  const hudToggle = document.getElementById("hudToggle") as HTMLButtonElement;
  const debugZoom = document.getElementById("debugZoom") as HTMLElement;
  const debugLevel = document.getElementById("debugLevel") as HTMLElement;
  const debugView = document.getElementById("debugView") as HTMLElement;
  const debugCityArt = document.getElementById("debugCityArt") as HTMLElement;
  const debugAccuracy = document.getElementById("debugAccuracy") as HTMLElement;
  const stationSummaryTitle = document.getElementById("stationSummaryTitle") as HTMLHeadingElement;
  const stationSummary = document.getElementById("stationSummary") as HTMLDListElement;
  const dateLabel = document.getElementById("dateLabel") as HTMLSpanElement;
  const dayPhase = document.getElementById("dayPhase") as HTMLSpanElement;
  const flowMetric = document.getElementById("flowMetric") as HTMLElement;
  const onTimeMetric = document.getElementById("onTimeMetric") as HTMLElement;
  const serviceAlerts = document.getElementById("serviceAlerts") as HTMLElement;
  const langToggle = document.getElementById("langToggle") as HTMLButtonElement;

  const stationName = (id: string) => {
    const station = sim.getStation(id);
    if (!station) return id;
    return getLang() === "ja" && station.name_local ? station.name_local : station.name_en;
  };

  const renderStationCard = (stationId: string) => {
    const station = sim.getStation(stationId);
    if (!station) return;
    const facts = STATION_FACTS[stationId];
    stationSummaryTitle.textContent = stationName(stationId);
    const lang = getLang();
    stationSummary.innerHTML = `
      <div><dt>${t("local_label")}</dt><dd>${lang === "ja" ? station.name_en : (station.name_local ?? "—")}</dd></div>
      <div><dt>${t("platforms")}</dt><dd>${facts ? facts.platforms[lang] : "—"}</dd></div>
      <div><dt>${t("from_tokyo")}</dt><dd>${facts ? t("km_value", { km: facts.km.toFixed(1) }) : "—"}</dd></div>
      <div><dt>${t("riders")}</dt><dd>${facts ? t("riders_value", { count: formatNumber(facts.riders) }) : "—"}</dd></div>`;
  };

  const dayPhaseLabel = (minutes: number) => {
    const h = (minutes / 60) % 24;
    if (h >= 5 && h < 10) return `☀ ${t("phase_morning")}`;
    if (h >= 10 && h < 16) return `☀ ${t("phase_day")}`;
    if (h >= 16 && h < 19) return `🌇 ${t("phase_evening")}`;
    return `🌙 ${t("phase_night")}`;
  };

  detailsTitle.textContent = t("no_selection");
  detailsBody.textContent = t("tap_hint");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  reducedMotionToggle.checked = prefersReducedMotion;
  renderer.setReducedMotion(prefersReducedMotion);

  const syncCompactHud = () => {
    const compact =
      window.matchMedia("(pointer: coarse)").matches ||
      window.innerWidth <= 1320 ||
      window.innerHeight > window.innerWidth * 1.08;
    document.body.classList.toggle("compact-hud", compact);
  };
  syncCompactHud();
  window.addEventListener("resize", syncCompactHud, { passive: true });

  // On compact layouts the train card starts collapsed so the world stays
  // visible; tapping its header expands it.
  if (document.body.classList.contains("compact-hud")) {
    document.body.classList.add("details-collapsed");
  }
  details.addEventListener("click", (event) => {
    if (!document.body.classList.contains("compact-hud")) return;
    const target = event.target as HTMLElement;
    if (target.closest(".details-title") || target.closest(".section-kicker")) {
      document.body.classList.toggle("details-collapsed");
    }
  });

  let playing = true;
  let selectedTrainId: string | null = null;
  let selectedStationId: string | null = null;

  playPauseBtn.addEventListener("click", () => {
    playing = !playing;
    sim.setPlaying(playing);
    playPauseBtn.textContent = playing ? t("pause") : t("play");
  });

  speedBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const speed = Number(btn.dataset.speed ?? "1");
      sim.setSpeed(speed);
      speedBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  timeScrub.addEventListener("input", () => {
    sim.setTime(Number(timeScrub.value));
  });

  soundBtn.addEventListener("click", async () => {
    await audio.start();
    soundBtn.textContent = t("disable_sound");
  });
  volume.addEventListener("input", () => {
    audio.setVolume(Number(volume.value));
  });

  aboutBtn.addEventListener("click", () => {
    aboutModal.classList.remove("hidden");
  });
  aboutClose.addEventListener("click", () => {
    aboutModal.classList.add("hidden");
  });

  followToggle.addEventListener("change", () => {
    renderer.setFollowTarget(followToggle.checked ? selectedTrainId : null);
  });
  reducedMotionToggle.addEventListener("change", () => {
    renderer.setReducedMotion(reducedMotionToggle.checked);
  });
  accuracyDebugToggle.addEventListener("change", () => {
    renderer.setAccuracyDebug(accuracyDebugToggle.checked);
  });
  viewModeSelect.addEventListener("change", () => {
    renderer.setViewMode(viewModeSelect.value as "japan" | "corridor" | "station");
  });
  qualitySelect.addEventListener("change", () => {
    const value = qualitySelect.value as "low" | "medium" | "high";
    renderer.setQuality(value);
  });
  zoomIn.addEventListener("click", () => renderer.zoomBy(1.16));
  zoomOut.addEventListener("click", () => renderer.zoomBy(0.86));
  zoomReset.addEventListener("click", () => renderer.resetView());
  const zoomRange = renderer.getZoomRange();
  zoomSlider.min = String(zoomRange.min);
  zoomSlider.max = String(zoomRange.max);
  zoomSlider.value = renderer.getZoom().toFixed(2);
  zoomSlider.addEventListener("input", () => renderer.setZoom(Number(zoomSlider.value)));
  // The slider mirrors the live zoom every frame, except while the user is
  // scrubbing it (writing back mid-drag would fight their thumb).
  let zoomScrubbing = false;
  zoomSlider.addEventListener("pointerdown", () => {
    zoomScrubbing = true;
  });
  window.addEventListener("pointerup", () => {
    zoomScrubbing = false;
  });
  lodDebugToggle.addEventListener("click", () => {
    lodDebug.classList.toggle("collapsed");
    lodDebugToggle.textContent = lodDebug.classList.contains("collapsed") ? t("show") : t("hide");
  });
  hudToggle.addEventListener("click", () => {
    document.body.classList.toggle("hud-minimal");
    hudToggle.textContent = document.body.classList.contains("hud-minimal")
      ? t("show_hud")
      : t("clean_view");
  });

  const updateDetails = (trainId: string | null, stationId: string | null) => {
    if (trainId) {
      const state = sim.getTrainStates().find((t) => t.id === trainId);
      if (!state) return;
      const trainType = sim.getTrainType(state.trainTypeId);
      const service = parsedServices.find((s) => s.id === state.id);
      const routeStops = service?.stops ?? [];
      const previewClass = `train-preview train-preview-${state.trainTypeId}`;
      detailsTitle.textContent = `${state.name} (${trainType?.name_en ?? ""})`;
      detailsBody.innerHTML = `
        <div class="${previewClass}" aria-hidden="true"></div>
        <div class="detail-row"><span>${t("status")}</span><strong>${state.status === "moving" ? t("status_passing") : t("status_at_station")}</strong></div>
        <div class="detail-row"><span>${t("next_stop")}</span><strong>${state.nextStationId ? stationName(state.nextStationId) : t("terminal")}</strong></div>
        <div class="detail-row"><span>${t("speed")}</span><strong>${state.speedKmh} km/h</strong></div>
        <div class="detail-row"><span>${t("progress")}</span><strong>${Math.round(state.progress * 100)}%</strong></div>
        <div class="detail-row"><span>${t("trainset")}</span><strong>${trainType?.length_m ?? 400} m</strong></div>
        <div class="route-timeline">
          ${routeStops
            .map((stop) => {
              const current = stop.station_id === state.nextStationId ? " current" : "";
              return `<div class="route-stop${current}"><span>${stationName(stop.station_id)}</span><strong>${stop.departure ?? stop.arrival}</strong></div>`;
            })
            .join("")}
        </div>`;
      return;
    }
    if (stationId) {
      const station = sim.getStation(stationId);
      if (!station) return;
      detailsTitle.textContent = stationName(station.id);
      const departures = parsedServices
        .flatMap((service) =>
          service.stops
            .filter((stop) => stop.station_id === station.id)
            .map((stop) => ({ service, stop }))
        )
        .slice(0, 5);
      detailsBody.innerHTML = `
        <div class="station-preview station-preview-${station.id}" aria-hidden="true"></div>
        <div class="detail-row"><span>${t("local_label")}</span><strong>${getLang() === "ja" ? station.name_en : (station.name_local ?? "—")}</strong></div>
        <div class="detail-row"><span>${t("line")}</span><strong>${t("tokaido_line")}</strong></div>
        <div class="detail-row"><span>${t("ambience")}</span><strong>${t("platform_hush")}</strong></div>
        <div class="route-timeline">
          ${departures
            .map(
              ({ service, stop }) =>
                `<div class="route-stop"><span>${service.name_en}</span><strong>${stop.departure ?? stop.arrival}</strong></div>`
            )
            .join("")}
        </div>`;
      renderStationCard(station.id);
      return;
    }
    detailsTitle.textContent = t("no_selection");
    detailsBody.textContent = t("tap_hint");
  };

  renderer.setTrainTapHandler((id) => {
    selectedTrainId = id;
    selectedStationId = null;
    updateDetails(selectedTrainId, null);
    if (followToggle.checked) renderer.setFollowTarget(selectedTrainId);
  });

  renderer.setStationTapHandler((id) => {
    selectedStationId = id;
    selectedTrainId = null;
    if (viewModeSelect.value === "station") renderer.focusStation(id);
    updateDetails(null, selectedStationId);
    renderer.setFollowTarget(null);
  });

  const populateFilters = () => {
    const lineValue = lineFilter.value || "all";
    const trainValue = trainFilter.value || "all";
    lineFilter.innerHTML = `<option value="all">${t("all_lines")}</option>`;
    parsedLines.forEach((line) => {
      const opt = document.createElement("option");
      opt.value = line.id;
      opt.textContent = getLang() === "ja" ? t("tokaido_line") : line.name_en;
      lineFilter.appendChild(opt);
    });
    trainFilter.innerHTML = `<option value="all">${t("all_trains")}</option>`;
    parsedTrainTypes.forEach((tt) => {
      const opt = document.createElement("option");
      opt.value = tt.id;
      opt.textContent = tt.name_en;
      trainFilter.appendChild(opt);
    });
    lineFilter.value = lineValue;
    trainFilter.value = trainValue;
  };

  populateFilters();
  renderer.setQuality(qualitySelect.value as "low" | "medium" | "high");

  const parseClock = (clock: string) => {
    const [h, m] = clock.split(":").map(Number);
    return h * 60 + m;
  };

  const serviceStatus = (service: (typeof parsedServices)[number]) => {
    const now = sim.timeMinutes;
    const first = parseClock(service.stops[0].arrival);
    const last = parseClock(service.stops[service.stops.length - 1].departure);
    if (now < first) return { label: t("svc_standby"), active: false };
    if (now > last + 8) return { label: t("svc_complete"), active: false };
    const dwell = service.stops.find((stop) => {
      const arrival = parseClock(stop.arrival);
      const departure = parseClock(stop.departure);
      return now >= arrival && now <= departure;
    });
    if (dwell) return { label: t("svc_boarding"), active: true };
    return { label: t("svc_on_route"), active: true };
  };

  const renderTimetable = () => {
    timetableList.innerHTML = parsedServices
      .slice(0, 8)
      .map((service, index) => {
        const first = service.stops[0];
        const last = service.stops[service.stops.length - 1];
        const origin = stationName(first.station_id);
        const destination = stationName(last.station_id);
        const color = service.train_type_id === "n700a" ? "var(--amber)" : "var(--blue)";
        const status = serviceStatus(service);
        return `
          <div class="timetable-row${status.active ? " current" : ""}">
            <span class="timetable-dot" style="background:${color}"></span>
            <span class="timetable-main">
              <span class="timetable-name">${service.name_en}</span>
              <span class="timetable-route">${origin} → ${destination} · ${t("track_n", { n: (index % 4) + 1 })}</span>
            </span>
            <span class="timetable-status">${status.label}</span>
          </div>`;
      })
      .join("");
  };

  const renderNotifications = (activeTrains: number) => {
    const timeText = formatTime(sim.timeMinutes);
    const selected = selectedTrainId
      ? sim.getTrainStates().find((train) => train.id === selectedTrainId)?.name
      : null;
    notificationFeed.innerHTML = `
      <span>${timeText}&nbsp;&nbsp;${t("notif_active", { count: activeTrains })}</span>
      <span>${timeText}&nbsp;&nbsp;${t("notif_ambience")}</span>
      <span>${timeText}&nbsp;&nbsp;${selected ? t("notif_selected", { name: selected }) : t("notif_tap")}</span>`;
  };

  // Language toggle: re-renders every translated surface, including the
  // in-world station chips.
  const syncLangToggle = () => {
    langToggle.textContent = getLang() === "ja" ? "EN" : "日本語";
  };
  const refreshLocalizedHud = () => {
    applyStaticTranslations();
    syncLangToggle();
    dateLabel.textContent = formatDate(hudDate());
    playPauseBtn.textContent = playing ? t("pause") : t("play");
    hudToggle.textContent = document.body.classList.contains("hud-minimal")
      ? t("show_hud")
      : t("clean_view");
    lodDebugToggle.textContent = lodDebug.classList.contains("collapsed") ? t("show") : t("hide");
    if (!audio.isStarted()) soundBtn.textContent = t("enable_sound");
    else soundBtn.textContent = t("disable_sound");
    populateFilters();
    renderTimetable();
    renderStationCard(selectedStationId ?? "tokyo");
    updateDetails(selectedTrainId, selectedStationId);
    renderer.setStationLabelLanguage(getLang());
  };
  const switchLanguage = async (lang: Lang) => {
    await setLang(lang);
    refreshLocalizedHud();
  };
  langToggle.addEventListener("click", () => {
    void switchLanguage(getLang() === "ja" ? "en" : "ja");
  });

  renderStationCard("tokyo");
  renderTimetable();
  syncLangToggle();
  dateLabel.textContent = formatDate(hudDate());
  renderer.setStationLabelLanguage(getLang());
  let lastTimetableMinute = -1;
  let lastDetailsUpdate = 0;
  let lastNotificationsUpdate = 0;

  document.body.classList.remove("is-loading");
  document.body.classList.add("is-ready");
  setBootStatus(t("loading_ready"));
  if (loadingScreen) {
    window.setTimeout(
      () => {
        loadingScreen.classList.add("hidden");
      },
      prefersReducedMotion ? 0 : 240
    );
  }

  window.addEventListener("shinasmr:plate-error", (event) => {
    const url = (event as CustomEvent<{ url: string }>).detail?.url ?? "";
    serviceAlerts.textContent = `⚠ ${url.split("/").pop() ?? "plate"}`;
    console.warn("World plate unavailable; keeping previous view.", url);
  });

  let last = performance.now();
  let fpsAccum = 0;
  let fpsFrames = 0;
  let fpsLastEmit = performance.now();
  let audioUpdateBudget = 0;
  renderer.app.ticker.add(() => {
    const now = performance.now();
    const delta = (now - last) / 1000;
    last = now;
    sim.update(delta);
    const trains = sim.getTrainStates();
    const lineFilterValue = lineFilter.value;
    const trainFilterValue = trainFilter.value;
    const filtered = trains.filter((t) => {
      if (t.status === "inactive") return false;
      const lineOk = lineFilterValue === "all" || t.lineId === lineFilterValue;
      const trainOk = trainFilterValue === "all" || t.trainTypeId === trainFilterValue;
      return lineOk && trainOk;
    });
    if (!selectedTrainId && !selectedStationId && filtered.length > 0) {
      selectedTrainId = filtered[0].id;
      updateDetails(selectedTrainId, null);
    }
    activeServiceMetric.textContent = `${filtered.length}`;
    if (now - lastNotificationsUpdate > 1000) {
      lastNotificationsUpdate = now;
      renderNotifications(filtered.length);
      // Topbar status strip: all values derived from the live simulation.
      dayPhase.textContent = dayPhaseLabel(sim.timeMinutes);
      flowMetric.textContent =
        filtered.length < 4
          ? t("flow_calm")
          : filtered.length < 8
            ? t("flow_steady")
            : t("flow_busy");
      onTimeMetric.textContent = "100%";
      serviceAlerts.textContent = t("service_alerts", { count: 0 });
      dateLabel.textContent = formatDate(hudDate());
    }
    renderer.setAmbientMinutes(sim.timeMinutes);
    renderer.update(filtered);
    if (!zoomScrubbing) zoomSlider.value = renderer.getZoom().toFixed(2);
    if (selectedTrainId && now - lastDetailsUpdate > 250) {
      lastDetailsUpdate = now;
      updateDetails(selectedTrainId, null);
    }

    const timeLabelText = formatTime(sim.timeMinutes);
    timeLabel.textContent = timeLabelText;
    timeScrub.value = `${Math.round(sim.timeMinutes)}`;
    const currentMinute = Math.floor(sim.timeMinutes);
    if (currentMinute !== lastTimetableMinute) {
      lastTimetableMinute = currentMinute;
      renderTimetable();
    }

    if (audio.isStarted()) {
      audioUpdateBudget += delta;
      const perfQuality = qualitySelect.value as "low" | "medium" | "high";
      const minInterval = perfQuality === "low" ? 0.2 : perfQuality === "medium" ? 0.08 : 0.03;
      if (audioUpdateBudget >= minInterval) {
        audioUpdateBudget = 0;
        const cam = renderer.getCameraCenter();
        const minDist = filtered.reduce((acc, train) => {
          const p = renderer.toScreen(train.lat, train.lon);
          const dx = p.x - cam.x;
          const dy = p.y - cam.y;
          return Math.min(acc, Math.hypot(dx, dy));
        }, Number.POSITIVE_INFINITY);
        const intensity = Math.max(0, 1 - minDist / 600);
        const activity = Math.min(1, filtered.length / 6);
        const perfFactor = perfQuality === "low" ? 0.7 : perfQuality === "medium" ? 0.85 : 1;
        audio.update(activity * perfFactor, intensity * perfFactor);
      }
    }

    fpsAccum += delta;
    fpsFrames += 1;
    if (now - fpsLastEmit > 500) {
      const fps = fpsFrames / Math.max(0.001, fpsAccum);
      const zoom = renderer.getZoom();
      const stats = renderer.getStats();
      perfHud.textContent = `FPS: ${Math.round(fps)} | Z${stats.detailLevel}/8 ${stats.view} · ${stats.routeMode}`;
      debugZoom.textContent = zoom.toFixed(2);
      debugLevel.textContent = `${stats.detailLevel}/8`;
      debugView.textContent = stats.view;
      debugCityArt.textContent = `${stats.loadedCityArt} loaded${stats.pendingCityArt ? ` / ${stats.pendingCityArt} pending` : ""}`;
      debugAccuracy.textContent = stats.accuracyDebug ? t("on") : t("off");
      perfStats.textContent = `Performance: FPS ${Math.round(fps)} | Zoom ${zoom.toFixed(
        2
      )} | Band ${stats.detailLevel}/8 ${stats.view} | Plate ${stats.routeMode} | Train ${stats.trainMode} | Trains ${stats.trains} | Plates cached ${stats.trackSprites} | Quality ${qualitySelect.value}`;
      fpsAccum = 0;
      fpsFrames = 0;
      fpsLastEmit = now;
    }
  });
};

const formatTime = (minutes: number) => {
  const m = Math.floor(minutes) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

boot().catch((err) => {
  if (isWebGLStartupError(err)) {
    showNoWebglFallback(err);
    return;
  }

  document.body.classList.remove("is-loading");
  const loadingStatus = document.getElementById("loadingStatus");
  if (loadingStatus) {
    const msg = errorMessage(err);
    loadingStatus.textContent = `Startup failed: ${msg}`;
  }
  const details = document.getElementById("details");
  if (details) {
    const title = details.querySelector(".details-title");
    const body = details.querySelector(".details-body");
    if (title) title.textContent = "Render error";
    if (body) {
      const msg = errorMessage(err);
      body.textContent = `Startup failed: ${msg}`;
    }
  }
  console.error(err);
});
