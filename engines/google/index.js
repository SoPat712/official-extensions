import * as cheerio from "cheerio";
import { SETTINGS_SCHEMA } from "./settings.js";
import {
  LITE_SEARCH_URL,
  SEARCH_URL,
  SERP_READY_SELECTOR,
  SERP_SORRY_PATH,
} from "./const/serp.js";
import {
  acceptLanguage,
  buildHtmlParams,
  buildLiteParams,
  nokiaAgent,
} from "./request.js";
import { isInterstitial, parseDesktop, parseWml } from "./parse.js";
import { resolveGotos } from "./gotos.js";

export { regions } from "./const/regions.js";

export const description =
  "Google web search. Lite results come from Google's old mobile page and work over any transport, but Google rate-limits that page per IP and busy instances start hitting CAPTCHAs. The [4play (lolcat)](https://github.com/degoog-org/official-extensions/tree/main/transports/lolcat-4play) transport is still the recommended way to run this engine. It fetches through a real Firefox session, and HTML results only work with it. Install 4play from the Store tab and select it as this engine's transport. If you can't run 4play, use lite results or the Google CSE engine.";

export default class GoogleEngine {
  isClientExposed = false;
  name = "Google";
  bangShortcut = "g";
  safeSearch = "off";
  resultsFormat = "lite";
  settingsSchema = SETTINGS_SCHEMA;

  configure(settings) {
    if (typeof settings.safeSearch === "string")
      this.safeSearch = settings.safeSearch;
    if (settings.resultsFormat === "lite" || settings.resultsFormat === "html")
      this.resultsFormat = settings.resultsFormat;
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    if (this.resultsFormat === "html") {
      return this._searchHtml(query, page, timeFilter, context);
    }
    return this._searchLite(query, page, timeFilter, context);
  }

  _interstitialError(context) {
    const message = `${this.name} returned a JavaScript/consent interstitial`;
    if (context?.engineError) {
      return context.engineError("interstitial", message, { engine: this.name });
    }
    return new Error(message);
  }

  async _searchHtml(query, page, timeFilter, context) {
    const params = buildHtmlParams(query, page, timeFilter, this.safeSearch, context);
    const userAgent = context?.userAgent?.() || nokiaAgent();
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(`${SEARCH_URL}?${params.toString()}`, {
      headers: {
        "User-Agent": userAgent,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": acceptLanguage(context),
        Cookie: "CONSENT=YES+",
      },
      match: {
        domMatch: SERP_READY_SELECTOR,
        failUrlMatch: SERP_SORRY_PATH,
      },
      redirect: "follow",
    });

    context?.sentinel?.(response, this.name);
    const html = await response.text();
    if (isInterstitial(html)) throw this._interstitialError(context);

    return resolveGotos(parseDesktop(cheerio.load(html), this.name), userAgent);
  }

  async _searchLite(query, page = 1, timeFilter, context) {
    const params = buildLiteParams(query, page, timeFilter, this.safeSearch, context);
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(`${LITE_SEARCH_URL}?${params.toString()}`, {
      headers: {
        "User-Agent": nokiaAgent(),
        Accept: "*/*",
        "Accept-Language": acceptLanguage(context),
        Cookie: "CONSENT=YES+",
      },
      redirect: "follow",
    });

    if ((response.url || "").includes(SERP_SORRY_PATH)) {
      if (context?.engineError) {
        throw context.engineError(
          "captcha",
          `${this.name} returned a CAPTCHA page`,
          { httpStatus: response.status, engine: this.name },
        );
      }
      throw new Error(`${this.name} returned a CAPTCHA page`);
    }

    context?.sentinel?.(response, this.name);
    const html = await response.text();
    if (isInterstitial(html)) throw this._interstitialError(context);

    return parseWml(cheerio.load(html), this.name);
  }
}
