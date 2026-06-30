const FETCH_TIMEOUT_MS = 8000;
const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let _fetch = fetch;
let _geoCache = null;

const _esc = (s) => {
  if (typeof s !== "string") return "";

  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

const _cleanPlace = (s) => {
  return String(s || "")
    .trim()
    .replace(/^the\s+/i, "")
    .replace(/[?.,!]+$/, "")
    .trim();
};

const _cacheKey = (lang, place) => {
  return `geo:${String(lang || "en").toLowerCase()}:${place.toLowerCase().replace(/\s+/g, " ")}`;
};

const _titleCase = (s) => {
  return String(s || "").replace(/\b[\p{L}\p{N}']+\b/gu, (word) => {
    const [first, ...rest] = word;
    return `${first.toUpperCase()}${rest.join("")}`;
  });
};

const _validTimeZone = (timeZone) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const _resolveIanaTimeZone = (place) => {
  const raw = _cleanPlace(place);
  const normalized = raw.toLowerCase().replace(/\s+/g, "_");

  for (const candidate of [raw, normalized]) {
    if (_validTimeZone(candidate)) {
      return {
        timeZone: candidate,
        label: candidate.replace(/_/g, " "),
      };
    }
  }

  return null;
};

const _pickGeoResult = (results, query) => {
  if (!Array.isArray(results) || results.length === 0) return null;

  const key = query.toLowerCase().replace(/\s+/g, " ");
  const exact = results.filter((r) => String(r.name || "").toLowerCase() === key);
  const pool = exact.length ? exact : results;

  return [...pool].sort((a, b) => {
    const score = (r) => {
      let n = Number(r.population) || 0;
      if (r.feature_code === "PCLI") n += 1_000_000_000;
      if (r.feature_code === "PPLC") n += 100_000_000;
      return n;
    };
    return score(b) - score(a);
  })[0];
};

const _labelFromGeo = (query, geo) => {
  if (!geo) return _titleCase(query);
  if (geo.feature_code === "PCLI") return geo.country || geo.name || _titleCase(query);

  const name = geo.name || _titleCase(query);
  const country = geo.country || "";
  return country && country.toLowerCase() !== String(name).toLowerCase()
    ? `${name}, ${country}`
    : name;
};

const _fetchWithTimeout = async (fetchFn, url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetchFn(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const _resolveTimeZone = async (place, context = {}) => {
  const iana = _resolveIanaTimeZone(place);
  if (iana) return iana;

  const query = _cleanPlace(place);
  if (!query) return null;

  const lang = String(context.lang || "en").split("-")[0] || "en";
  const key = _cacheKey(lang, query);
  let geo = _geoCache ? await _geoCache.get(key) : null;

  if (!geo) {
    const fetchFn = context?.fetch || _fetch || fetch;
    const url = `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({
      name: query,
      count: "8",
      language: lang,
      format: "json",
    })}`;

    try {
      const res = await _fetchWithTimeout(fetchFn, url);
      if (!res.ok) return null;

      const data = await res.json();
      geo = _pickGeoResult(data?.results, query);
      if (geo?.timezone && _geoCache) {
        await _geoCache.set(key, geo, GEO_CACHE_TTL_MS);
      }
    } catch {
      return null;
    }
  }

  if (!geo?.timezone || !_validTimeZone(geo.timezone)) return null;

  return {
    timeZone: geo.timezone,
    label: _labelFromGeo(query, geo),
  };
};

const _formatOffset = (date, timeZone) => {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(date);
    return parts.find((part) => part.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
};

export default {
  isClientExposed: false,
  name: "Time",
  description: "Show current time for cities, countries, and timezones.",
  trigger: "time",
  aliases: ["tz", "clock"],
  naturalLanguagePhrases: [
    "what time is it in",
    "what's the time in",
    "what is the time in",
    "current time in",
    "time in",
  ],

  settingsSchema: [],

  init(ctx) {
    _fetch = ctx.fetch ?? fetch;
    if (typeof ctx.useCache === "function") {
      _geoCache = ctx.useCache("time-geocode", GEO_CACHE_TTL_MS);
    } else if (typeof ctx.createCache === "function") {
      _geoCache = ctx.createCache(GEO_CACHE_TTL_MS);
    }
  },

  async execute(args, context) {
    const place = _cleanPlace(args);
    if (!place) {
      return {
        title: "Time",
        html: `<div class="command-result"><p>Usage: <code>!time &lt;city, country, or timezone&gt;</code></p><p>Examples: <code>!time Tokyo</code>, <code>!time America/New_York</code>, or &quot;time in France&quot;</p></div>`,
      };
    }

    const resolved = await _resolveTimeZone(place, context);
    if (!resolved) {
      return {
        title: "Time",
        html: `<div class="command-result"><p>Unknown timezone or city: <strong>${_esc(place)}</strong></p></div>`,
      };
    }

    const now = new Date();
    const locale = context?.lang || "en-GB";
    const timeStr = now.toLocaleTimeString(locale, {
      timeZone: resolved.timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const dateStr = now.toLocaleDateString(locale, {
      timeZone: resolved.timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const offset = _formatOffset(now, resolved.timeZone);
    const detail = offset ? `${dateStr} (${offset})` : dateStr;

    return {
      title: `Time: ${resolved.label}`,
      html: `<div class="command-result time-result"><h3 class="time-place">Time in ${_esc(resolved.label)}</h3><p class="time-time">${_esc(timeStr)}</p><p class="time-date">${_esc(detail)}</p><p class="time-zone">${_esc(resolved.timeZone)}</p></div>`,
    };
  },
};
