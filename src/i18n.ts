import i18next from "i18next";

export type Lang = "en" | "ja";

const STORAGE_KEY = "shinasmr-lang";

const en = {
  app_title: "ASMR Shinkansen",
  subtitle: "Tokaido corridor / timetable-driven ambience",
  loading_title: "Preparing Tokyo Station",
  loading_data: "Loading timetable and station data",
  loading_renderer: "Loading WebGL renderer and audio engine",
  loading_scene: "Building Tokyo Station close view",
  loading_ready: "Ready",

  pause: "Pause",
  play: "Play",
  enable_sound: "Enable sound",
  disable_sound: "Sound on",
  clean_view: "Clean view",
  show_hud: "Show HUD",
  about: "About",
  fit: "Fit",

  active: "Active",
  flow: "Flow",
  on_time: "On-time",
  flow_calm: "Calm",
  flow_steady: "Steady",
  flow_busy: "Busy",
  phase_morning: "Morning",
  phase_day: "Daytime",
  phase_evening: "Evening",
  phase_night: "Night",

  focus_station: "Focus Station",
  tokaido_line: "Tokaido Shinkansen",
  quiet_mode: "Quiet mode",
  platforms: "Platforms",
  riders: "Riders",
  riders_value: "{{count}}/day (approx.)",
  from_tokyo: "From Tokyo",
  km_value: "{{km}} km",
  local_label: "Local",
  departures: "Departures",

  line: "Line",
  train: "Train",
  all_lines: "All lines",
  all_trains: "All trains",
  follow_train: "Follow train",
  reduced_motion: "Reduced motion",
  map_accuracy: "Map accuracy",
  view: "View",
  view_station: "Station",
  view_corridor: "Corridor",
  view_japan: "Japan",
  detail: "Detail",
  detail_high: "High",
  detail_medium: "Medium",
  detail_low: "Low",

  timetable: "Timetable",
  passenger_flow: "Passenger Flow",
  asmr_load: "ASMR load",
  track_n: "Track {{n}}",

  current_train: "Current Train",
  no_selection: "No selection",
  tap_hint: "Tap a train or station.",
  status: "Status",
  status_passing: "Passing",
  status_at_station: "At station",
  next_stop: "Next stop",
  terminal: "Terminal",
  speed: "Speed",
  progress: "Progress",
  trainset: "Trainset",
  ambience: "Ambience",
  platform_hush: "Platform hush",

  svc_standby: "Standby",
  svc_complete: "Complete",
  svc_boarding: "Boarding",
  svc_on_route: "On Route",

  line_legend: "Line Legend",
  legend_stations: "Station markers",
  legend_art: "Authored world art",
  map_of_japan: "Map of Japan",
  lod_debug: "LOD Debug",
  lod_zoom: "Zoom",
  lod_level: "Level",
  lod_view: "View",
  lod_city_art: "City art",
  lod_accuracy: "Accuracy",
  show: "Show",
  hide: "Hide",
  on: "On",
  off: "Off",

  notifications: "Notifications",
  service_alerts: "Service alerts: {{count}}",
  notif_active: "{{count}} active Shinkansen services in the corridor.",
  notif_ambience: "Track ambience responding to timetable density.",
  notif_tap: "Tap a train for close listening.",
  notif_selected: "{{name}} selected for close listening.",

  about_title: "About & Attribution",
  about_p1:
    "ASMR Shinkansen is a simulated railway ambience experience. Train positions are timetable-driven, not live tracking.",
  about_p2:
    "World art is an authored, generated isometric interpretation of the Tokaido corridor anchored to real station geography.",
  about_p3: "Schedules are synthetic; station facts use public real-world figures.",
  close: "Close"
};

const ja: typeof en = {
  app_title: "ASMR 新幹線",
  subtitle: "東海道コリドー／ダイヤ駆動アンビエンス",
  loading_title: "東京駅を準備中",
  loading_data: "時刻表と駅データを読み込み中",
  loading_renderer: "WebGLレンダラーと音声エンジンを読み込み中",
  loading_scene: "東京駅クローズビューを構築中",
  loading_ready: "準備完了",

  pause: "一時停止",
  play: "再生",
  enable_sound: "サウンドを有効化",
  disable_sound: "サウンド有効",
  clean_view: "クリーン表示",
  show_hud: "HUD表示",
  about: "情報",
  fit: "全体",

  active: "運行中",
  flow: "流動",
  on_time: "定時率",
  flow_calm: "穏やか",
  flow_steady: "安定",
  flow_busy: "混雑",
  phase_morning: "朝",
  phase_day: "日中",
  phase_evening: "夕方",
  phase_night: "夜",

  focus_station: "注目駅",
  tokaido_line: "東海道新幹線",
  quiet_mode: "静音モード",
  platforms: "ホーム",
  riders: "乗車人員",
  riders_value: "約{{count}}人/日",
  from_tokyo: "東京から",
  km_value: "{{km}} km",
  local_label: "現地名",
  departures: "発車",

  line: "路線",
  train: "列車",
  all_lines: "全路線",
  all_trains: "全列車",
  follow_train: "列車を追尾",
  reduced_motion: "モーション軽減",
  map_accuracy: "地図精度",
  view: "ビュー",
  view_station: "駅",
  view_corridor: "沿線",
  view_japan: "日本全体",
  detail: "画質",
  detail_high: "高",
  detail_medium: "中",
  detail_low: "低",

  timetable: "時刻表",
  passenger_flow: "旅客流動",
  asmr_load: "ASMR負荷",
  track_n: "{{n}}番線",

  current_train: "現在の列車",
  no_selection: "未選択",
  tap_hint: "列車か駅をタップしてください。",
  status: "状態",
  status_passing: "走行中",
  status_at_station: "停車中",
  next_stop: "次の停車駅",
  terminal: "終着",
  speed: "速度",
  progress: "進行率",
  trainset: "編成長",
  ambience: "アンビエンス",
  platform_hush: "ホームの静けさ",

  svc_standby: "待機",
  svc_complete: "運行終了",
  svc_boarding: "乗車中",
  svc_on_route: "走行中",

  line_legend: "凡例",
  legend_stations: "駅マーカー",
  legend_art: "手描き調ワールドアート",
  map_of_japan: "日本地図",
  lod_debug: "LODデバッグ",
  lod_zoom: "ズーム",
  lod_level: "レベル",
  lod_view: "ビュー",
  lod_city_art: "都市アート",
  lod_accuracy: "精度",
  show: "表示",
  hide: "隠す",
  on: "オン",
  off: "オフ",

  notifications: "お知らせ",
  service_alerts: "運行情報: {{count}}件",
  notif_active: "東海道で{{count}}本の新幹線が運行中。",
  notif_ambience: "ダイヤ密度に応じて走行音が変化します。",
  notif_tap: "列車をタップすると間近で聴けます。",
  notif_selected: "{{name}}を選択中。",

  about_title: "情報・出典",
  about_p1:
    "ASMR新幹線はダイヤ駆動の鉄道アンビエンス体験です。列車位置は時刻表に基づくもので、実際の運行情報ではありません。",
  about_p2: "ワールドアートは実在の駅位置に紐づけた、生成によるアイソメトリック表現です。",
  about_p3: "ダイヤは合成データ、駅情報は公開されている実数値の概数を使用しています。",
  close: "閉じる"
};

const detectLang = (): Lang => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "ja") return stored;
  } catch {
    // Storage unavailable (private mode); fall through to navigator.
  }
  return navigator.language?.toLowerCase().startsWith("ja") ? "ja" : "en";
};

export const initI18n = async () => {
  await i18next.init({
    lng: detectLang(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    resources: {
      en: { translation: en },
      ja: { translation: ja }
    }
  });
  document.documentElement.lang = i18next.language;
};

export const getLang = (): Lang => (i18next.language === "ja" ? "ja" : "en");

export const setLang = async (lang: Lang) => {
  await i18next.changeLanguage(lang);
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Best effort only.
  }
  document.documentElement.lang = lang;
};

export const t = (key: string, options?: Record<string, unknown>) =>
  i18next.t(key, options) as string;

/** Translate every element carrying a data-i18n attribute. */
export const applyStaticTranslations = (root: ParentNode = document) => {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  });
};

export const formatDate = (date: Date) =>
  new Intl.DateTimeFormat(getLang() === "ja" ? "ja-JP" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short"
  }).format(date);

export const formatNumber = (value: number) =>
  new Intl.NumberFormat(getLang() === "ja" ? "ja-JP" : "en-GB").format(value);
