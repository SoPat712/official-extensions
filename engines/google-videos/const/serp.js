export const SEARCH_URL = "https://www.google.com/search";

export const TBS_MAP = { hour: "qdr:h", day: "qdr:d", week: "qdr:w", month: "qdr:m", year: "qdr:y" };

export const DURATION_RE = /^\d{1,3}:\d{2}$|^\d{1,3}:\d{2}:\d{2}$/;

export const MUTANT_SIGNATURES = [
  "/httpservice/retry/enablejs",
  'Please click <a href="/httpservice',
  "unusual traffic from your computer network",
  "/sorry/index?continue=",
];

export const GOTO_PREFIX = "/goto?";
export const GOTO_ORIGIN = "https://www.google.com";
export const GOTO_TIMEOUT_MS = 5000;
