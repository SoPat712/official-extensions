import { GOTO_ORIGIN, GOTO_TIMEOUT_MS } from "./const/serp.js";
import { isExternal, ytThumbnail } from "./parse.js";

const _followGoto = async (url, userAgent) => {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": userAgent },
      signal: AbortSignal.timeout(GOTO_TIMEOUT_MS),
    });
    await response.body?.cancel();
    const location = response.headers.get("location") || "";
    return isExternal(location) ? location : "";
  } catch {
    return "";
  }
};

export const resolveGotos = async (results, userAgent) => {
  const resolved = await Promise.all(
    results.map(async (result) => {
      if (!result.url.startsWith(GOTO_ORIGIN)) return result;
      const url = await _followGoto(result.url, userAgent);
      return { ...result, url, thumbnail: ytThumbnail(url) };
    }),
  );
  const seen = new Set();
  return resolved.filter((result) => {
    if (!result.url || seen.has(result.url)) return false;
    seen.add(result.url);
    return true;
  });
};
