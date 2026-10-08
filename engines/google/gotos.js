import { GOTO_ORIGIN, GOTO_TIMEOUT_MS } from "./const/serp.js";
import { isExternal } from "./parse.js";

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
    results.map(async (result) =>
      result.url.startsWith(GOTO_ORIGIN)
        ? { ...result, url: await _followGoto(result.url, userAgent) }
        : result,
    ),
  );
  const seen = new Set();
  return resolved.filter((result) => {
    if (!result.url || seen.has(result.url)) return false;
    seen.add(result.url);
    return true;
  });
};
