// Asset paths are written root-absolute ("/assets-generated/...") throughout
// the app. Vite rewrites the ones in index.html and CSS when `base` is set,
// but plain string literals in TS must be resolved at runtime so the app also
// works when hosted under a subpath (e.g. GitHub Pages project sites).
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export const withBase = (path: string): string =>
  path.startsWith("/") ? `${BASE}${path}` : path;
