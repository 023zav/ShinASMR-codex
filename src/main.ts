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
import { initI18n, t } from "./i18n";
import { Simulation } from "./sim";
import { withBase } from "./asset-base";

const DEFAULT_TOKYO_ART = withBase("/assets-generated/polish-v5/tokyo-z15-platform-close-v5.webp");

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
  const map = document.getElementById("map") as HTMLDivElement | null;
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
  if (map) map.setAttribute("aria-hidden", "true");
  if (loadingStatus) loadingStatus.textContent = "WebGL is unavailable in this browser context; showing generated Tokyo Station fallback.";
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
    navigator.serviceWorker.register(withBase("/sw.js")).catch((err) => {
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

  const parsedStations = StationsSchema.parse(stations);
  const parsedLines = LinesSchema.parse(lines);
  const parsedTrainTypes = TrainTypesSchema.parse(trainTypes);
  const parsedServices = ServicesSchema.parse(services);
  const parsedRuntime = DerivedRuntimeSchema.parse(derivedRuntime);

  setBootStatus("Loading WebGL renderer and audio engine");
  const [{ initRenderer }, { AudioEngine }] = await Promise.all([
    import("./render"),
    import("./audio")
  ]);

  setBootStatus("Building Tokyo Station close view");
  const canvas = document.getElementById("scene") as HTMLCanvasElement;
  const renderer = await initRenderer(
    canvas,
    parsedLines,
    parsedStations,
    parsedTrainTypes
  );
  const sim = new Simulation(
    parsedLines,
    parsedServices,
    parsedStations,
    parsedTrainTypes,
    parsedRuntime
  );
  const audio = new AudioEngine();

  const playPauseBtn = document.getElementById("playPause") as HTMLButtonElement;
  const speedBtns = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".speed button")
  );
  const timeScrub = document.getElementById("timeScrub") as HTMLInputElement;
  const scheduleMetric = document.getElementById("scheduleMetric") as HTMLSpanElement;
  const timeLabel = document.getElementById("timeLabel") as HTMLDivElement;
  const details = document.getElementById("details") as HTMLDivElement;
  const detailsTitle = details.querySelector(".details-title") as HTMLDivElement;
  const detailsBody = details.querySelector(".details-body") as HTMLDivElement;
  const followToggle = document.getElementById(
    "followToggle"
  ) as HTMLInputElement;
  const reducedMotionToggle = document.getElementById(
    "reducedMotionToggle"
  ) as HTMLInputElement;
  const accuracyDebugToggle = document.getElementById(
    "accuracyDebugToggle"
  ) as HTMLInputElement;
  const soundBtn = document.getElementById("soundBtn") as HTMLButtonElement;
  const volume = document.getElementById("volume") as HTMLInputElement;
  const aboutBtn = document.getElementById("aboutBtn") as HTMLButtonElement;
  const aboutModal = document.getElementById("aboutModal") as HTMLDivElement;
  const aboutClose = document.getElementById("aboutClose") as HTMLButtonElement;
  const decalDebug = document.getElementById("decalDebug") as HTMLDivElement;
  const decalGrid = document.getElementById("decalGrid") as HTMLDivElement;
  const decalClose = document.getElementById("decalClose") as HTMLButtonElement;
  const lineFilter = document.getElementById("lineFilter") as HTMLSelectElement;
  const trainFilter = document.getElementById("trainFilter") as HTMLSelectElement;
  const perfHud = document.getElementById("perfHud") as HTMLDivElement;
  const perfStats = document.getElementById("perfStats") as HTMLDivElement;
  const viewModeSelect = document.getElementById("viewModeSelect") as HTMLSelectElement;
  const qualitySelect = document.getElementById(
    "qualitySelect"
  ) as HTMLSelectElement;
  const zoomIn = document.getElementById("zoomIn") as HTMLButtonElement;
  const zoomOut = document.getElementById("zoomOut") as HTMLButtonElement;
  const zoomReset = document.getElementById("zoomReset") as HTMLButtonElement;
  const zoomSlider = document.getElementById("zoomSlider") as HTMLInputElement;
  const activeServiceMetric = document.getElementById(
    "activeServiceMetric"
  ) as HTMLSpanElement;
  const timetableList = document.getElementById("timetableList") as HTMLDivElement;
  const notificationFeed = document.getElementById(
    "notificationFeed"
  ) as HTMLDivElement;
  const lodDebug = document.getElementById("lodDebug") as HTMLElement;
  const lodDebugToggle = document.getElementById("lodDebugToggle") as HTMLButtonElement;
  const hudToggle = document.getElementById("hudToggle") as HTMLButtonElement;
  const debugZoom = document.getElementById("debugZoom") as HTMLElement;
  const debugLevel = document.getElementById("debugLevel") as HTMLElement;
  const debugView = document.getElementById("debugView") as HTMLElement;
  const debugCityArt = document.getElementById("debugCityArt") as HTMLElement;
  const debugAccuracy = document.getElementById("debugAccuracy") as HTMLElement;
  const stationSummaryTitle = document.getElementById(
    "stationSummaryTitle"
  ) as HTMLHeadingElement;
  const stationSummary = document.getElementById("stationSummary") as HTMLDListElement;

  detailsTitle.textContent = t("no_selection");
  detailsBody.textContent = t("tap_hint");
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
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

  let playing = true;
  let selectedTrainId: string | null = null;
  let selectedStationId: string | null = null;

  const liveBtn = document.getElementById("liveBtn") as HTMLButtonElement;
  const dateLabel = document.getElementById("dateLabel") as HTMLSpanElement;
  const clockModeBadge = document.getElementById("clockModeBadge") as HTMLSpanElement;

  const jstDateText = () =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tokyo",
      day: "numeric",
      month: "short",
      weekday: "short"
    }).format(new Date());

  const syncClockModeUi = () => {
    const live = sim.clockMode === "live";
    liveBtn.classList.toggle("primary", live);
    liveBtn.textContent = live ? "● LIVE" : "○ Go live";
    clockModeBadge.textContent = live ? "● LIVE JST" : "◷ Sandbox";
    dateLabel.textContent = live ? jstDateText() : "Sandbox time";
  };

  liveBtn.addEventListener("click", () => {
    sim.goLive();
    playing = true;
    playPauseBtn.textContent = "Pause";
    speedBtns.forEach((b) => b.classList.toggle("active", b.dataset.speed === "1"));
    syncClockModeUi();
  });

  playPauseBtn.addEventListener("click", () => {
    playing = !playing;
    sim.setPlaying(playing);
    playPauseBtn.textContent = playing ? "Pause" : "Play";
    syncClockModeUi();
  });

  speedBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const speed = Number(btn.dataset.speed ?? "1");
      sim.setSpeed(speed);
      speedBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      syncClockModeUi();
    });
  });

  let scrubbing = false;
  timeScrub.addEventListener("pointerdown", () => {
    scrubbing = true;
  });
  window.addEventListener("pointerup", () => {
    scrubbing = false;
  });
  timeScrub.addEventListener("input", () => {
    sim.setTime(Number(timeScrub.value));
    syncClockModeUi();
  });
  syncClockModeUi();

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
  decalClose.addEventListener("click", () => {
    decalDebug.classList.remove("active");
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
  lodDebugToggle.addEventListener("click", () => {
    lodDebug.classList.toggle("collapsed");
    lodDebugToggle.textContent = lodDebug.classList.contains("collapsed") ? "Show" : "Hide";
  });
  hudToggle.addEventListener("click", () => {
    document.body.classList.toggle("hud-minimal");
    hudToggle.textContent = document.body.classList.contains("hud-minimal") ? "Show HUD" : "Clean view";
  });

  const updateDetails = (trainId: string | null, stationId: string | null) => {
    if (trainId) {
      const state = sim.getTrainStates().find((t) => t.id === trainId);
      if (!state) return;
      const trainType = sim.getTrainType(state.trainTypeId);
      const nextStation = state.nextStationId
        ? sim.getStation(state.nextStationId)
        : null;
      const service = parsedServices.find((s) => s.id === state.id);
      const routeStops = service?.stops ?? [];
      const previewClass = `train-preview train-preview-${state.trainTypeId}`;
      detailsTitle.textContent = `${state.name} (${trainType?.name_en ?? ""})`;
      detailsBody.innerHTML = `
        <div class="${previewClass}" aria-hidden="true"></div>
        <div class="detail-row"><span>Status</span><strong>${state.status === "moving" ? "Passing" : "At station"}</strong></div>
        <div class="detail-row"><span>Next stop</span><strong>${nextStation?.name_en ?? "Terminal"}</strong></div>
        <div class="detail-row"><span>Speed</span><strong>${state.speedKmh} km/h</strong></div>
        <div class="detail-row"><span>Progress</span><strong>${Math.round(state.progress * 100)}%</strong></div>
        <div class="detail-row"><span>Trainset</span><strong>${trainType?.length_m ?? 400} m</strong></div>
        <div class="route-timeline">
          ${routeStops
            .map((stop) => {
              const station = sim.getStation(stop.station_id);
              const current = stop.station_id === state.nextStationId ? " current" : "";
              return `<div class="route-stop${current}"><span>${station?.name_en ?? stop.station_id}</span><strong>${stop.departure ?? stop.arrival}</strong></div>`;
            })
            .join("")}
        </div>`;
      return;
    }
    if (stationId) {
      const station = sim.getStation(stationId);
      if (!station) return;
      detailsTitle.textContent = station.name_en;
      const now = sim.timeMinutes;
      const allCalls = parsedServices.flatMap((service) =>
        service.stops
          .filter((stop) => stop.station_id === station.id)
          .map((stop) => ({ service, stop, dep: parseClock(stop.departure) }))
      );
      // Departure board: next services from the current clock, wrapping to
      // the morning if the day is over.
      const upcoming = allCalls.filter((call) => call.dep >= now).sort((a, b) => a.dep - b.dep);
      const wrapped = allCalls.sort((a, b) => a.dep - b.dep);
      const departures = (upcoming.length > 0 ? upcoming : wrapped).slice(0, 6);
      const meta = (station.metadata ?? {}) as { description_en?: string; rank?: string };
      const tracksByRank: Record<string, string> = {
        terminal: "8 tracks",
        major: "6 tracks",
        regional: "4 tracks",
        local: "2 tracks"
      };
      detailsBody.innerHTML = `
        <div class="station-preview station-preview-${station.id}" aria-hidden="true"></div>
        <div class="detail-row"><span>Local name</span><strong>${station.name_local ?? "Station"}</strong></div>
        <div class="detail-row"><span>Line</span><strong>Tokaido &amp; San'yō</strong></div>
        ${meta.description_en ? `<p class="station-blurb">${meta.description_en}</p>` : ""}
        <div class="route-timeline">
          ${departures
            .map(
              ({ service, stop }) =>
                `<div class="route-stop"><span>${service.name_en}</span><strong>${stop.departure ?? stop.arrival}</strong></div>`
            )
            .join("")}
        </div>`;
      stationSummaryTitle.textContent = station.name_en;
      stationSummary.innerHTML = `
        <div><dt>Local</dt><dd>${station.name_local ?? "—"}</dd></div>
        <div><dt>Platforms</dt><dd>${tracksByRank[meta.rank ?? "regional"] ?? "4 tracks"}</dd></div>
        <div><dt>Next deps</dt><dd>${departures.length}</dd></div>`;
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
    lineFilter.innerHTML = `<option value="all">All lines</option>`;
    parsedLines.forEach((line) => {
      const opt = document.createElement("option");
      opt.value = line.id;
      opt.textContent = line.name_en;
      lineFilter.appendChild(opt);
    });
    trainFilter.innerHTML = `<option value="all">All trains</option>`;
    parsedTrainTypes.forEach((tt) => {
      const opt = document.createElement("option");
      opt.value = tt.id;
      opt.textContent = tt.name_en;
      trainFilter.appendChild(opt);
    });
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
    if (now < first) return { label: "Standby", active: false };
    if (now > last + 8) return { label: "Complete", active: false };
    const dwell = service.stops.find((stop) => {
      const arrival = parseClock(stop.arrival);
      const departure = parseClock(stop.departure);
      return now >= arrival && now <= departure;
    });
    if (dwell) return { label: "Boarding", active: true };
    return { label: "On Route", active: true };
  };

  const renderTimetable = () => {
    // Departure-board behaviour: running services first, then the next
    // scheduled departures. At night this naturally empties out.
    const now = sim.timeMinutes;
    const annotated = parsedServices.map((service) => ({
      service,
      first: parseClock(service.stops[0].departure),
      last: parseClock(service.stops[service.stops.length - 1].arrival)
    }));
    const running = annotated.filter((s) => now >= s.first && now <= s.last);
    const upcoming = annotated
      .filter((s) => s.first > now)
      .sort((a, b) => a.first - b.first);
    const rows = [...running.slice(0, 6), ...upcoming.slice(0, Math.max(2, 8 - running.length))].slice(0, 8);
    if (rows.length === 0) {
      const next = [...annotated].sort((a, b) => a.first - b.first)[0];
      timetableList.innerHTML = `
        <div class="timetable-row">
          <span class="timetable-dot" style="background:var(--blue)"></span>
          <span class="timetable-main">
            <span class="timetable-name">Network at rest</span>
            <span class="timetable-route">First departure ${next ? formatTime(next.first) : "06:00"} JST</span>
          </span>
          <span class="timetable-status">Night</span>
        </div>`;
      return;
    }
    timetableList.innerHTML = rows
      .map(({ service }, index) => {
        const first = service.stops[0];
        const last = service.stops[service.stops.length - 1];
        const origin = sim.getStation(first.station_id)?.name_en ?? first.station_id;
        const destination = sim.getStation(last.station_id)?.name_en ?? last.station_id;
        const color = service.train_type_id === "n700a" ? "var(--amber)" : "var(--blue)";
        const status = serviceStatus(service);
        return `
          <div class="timetable-row${status.active ? " current" : ""}">
            <span class="timetable-dot" style="background:${color}"></span>
            <span class="timetable-main">
              <span class="timetable-name">${service.name_en}</span>
              <span class="timetable-route">${origin} → ${destination} · Track ${(index % 4) + 1}</span>
            </span>
            <span class="timetable-status">${status.label}</span>
          </div>`;
      })
      .join("");
  };

  const renderNotifications = (activeTrains: number) => {
    const timeText = formatTime(sim.timeMinutes);
    if (activeTrains === 0) {
      // Honest night state: no artificial trains. The network sleeps when
      // the real one does.
      const now = sim.timeMinutes;
      const futureFirsts = parsedServices
        .map((service) => parseClock(service.stops[0].departure))
        .sort((a, b) => a - b);
      const next = futureFirsts.find((first) => first > now) ?? futureFirsts[0];
      notificationFeed.innerHTML = `
        <span>${timeText}&nbsp;&nbsp;No trains running — the corridor is closed for the night.</span>
        <span>${timeText}&nbsp;&nbsp;Overnight track inspection and maintenance window.</span>
        <span>${timeText}&nbsp;&nbsp;First departure at ${formatTime(next)} JST.</span>`;
      return;
    }
    const selected = selectedTrainId
      ? sim.getTrainStates().find((train) => train.id === selectedTrainId)?.name
      : null;
    notificationFeed.innerHTML = `
      <span>${timeText}&nbsp;&nbsp;${activeTrains} scheduled Shinkansen services running right now.</span>
      <span>${timeText}&nbsp;&nbsp;Track ambience responding to timetable density.</span>
      <span>${timeText}&nbsp;&nbsp;${selected ? `${selected} selected for close listening.` : "Tap a train for close listening."}</span>`;
  };

  renderTimetable();
  let lastTimetableMinute = -1;
  let lastDetailsUpdate = 0;
  let lastNotificationsUpdate = 0;

  document.body.classList.remove("is-loading");
  document.body.classList.add("is-ready");
  setBootStatus("Ready");
  if (loadingScreen) {
    window.setTimeout(() => {
      loadingScreen.classList.add("hidden");
    }, prefersReducedMotion ? 0 : 240);
  }

  if (window.location.search.includes("decals")) {
    fetch(withBase("/assets/ui-decals.json"))
      .then((r) => r.json())
      .then((data) => {
        const frames = data.frames ?? {};
        Object.entries(frames).forEach(([key, frame]) => {
          const div = document.createElement("div");
          div.className = "decal-item";
          const f = (frame as { frame: { x: number; y: number } }).frame;
          div.style.backgroundPosition = `calc(-${f.x}px * 0.28) calc(-${f.y}px * 0.28)`;
          div.title = key;
          decalGrid.appendChild(div);
        });
        decalDebug.classList.add("active");
      });
  }

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
      const trainOk =
        trainFilterValue === "all" || t.trainTypeId === trainFilterValue;
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
    }
    renderer.update(filtered);
    if (selectedTrainId && now - lastDetailsUpdate > 250) {
      lastDetailsUpdate = now;
      updateDetails(selectedTrainId, null);
    }

    const timeLabelText = formatTime(sim.timeMinutes);
    timeLabel.textContent = timeLabelText;
    if (!scrubbing) timeScrub.value = `${Math.round(sim.timeMinutes)}`;
    scheduleMetric.textContent = filtered.length === 0 ? "Night pause" : "On time";
    const currentMinute = Math.floor(sim.timeMinutes);
    if (currentMinute !== lastTimetableMinute) {
      lastTimetableMinute = currentMinute;
      renderTimetable();
    }

    if (audio.isStarted()) {
      audioUpdateBudget += delta;
      const perfQuality = qualitySelect.value as "low" | "medium" | "high";
      const minInterval =
        perfQuality === "low" ? 0.2 : perfQuality === "medium" ? 0.08 : 0.03;
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
        const perfFactor =
          perfQuality === "low" ? 0.7 : perfQuality === "medium" ? 0.85 : 1;
        audio.update(activity * perfFactor, intensity * perfFactor);
      }
    }

    fpsAccum += delta;
    fpsFrames += 1;
    if (now - fpsLastEmit > 500) {
      const fps = fpsFrames / Math.max(0.001, fpsAccum);
      const zoom = renderer.getZoom();
      zoomSlider.value = zoom.toFixed(2);
      const stats = renderer.getStats();
      perfHud.textContent = `FPS: ${Math.round(fps)} | Z${stats.detailLevel}/16 ${stats.view} · ${stats.routeMode}`;
      debugZoom.textContent = zoom.toFixed(2);
      debugLevel.textContent = `${stats.detailLevel}/16`;
      debugView.textContent = stats.view;
      debugCityArt.textContent = `${stats.loadedCityArt} loaded${stats.pendingCityArt ? ` / ${stats.pendingCityArt} pending` : ""}`;
      debugAccuracy.textContent = stats.accuracyDebug ? "On" : "Off";
      perfStats.textContent = `Performance: FPS ${Math.round(fps)} | Zoom ${zoom.toFixed(
        2
      )} | Detail ${stats.detailLevel}/16 ${stats.view} | Route ${stats.routeMode} | Train ${stats.trainMode} | Platforms ${stats.platformDetail} | Trains ${stats.trains} | Track sprites ${stats.trackSprites} | Landmarks ${
        stats.landmarks
      } | Quality ${qualitySelect.value}`;
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
