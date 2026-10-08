import * as cheerio from "cheerio";
import { SETTINGS_SCHEMA } from "./settings.js";
import { buildHeaders, buildSearchUrl, gsaAgent } from "./request.js";
import { isInterstitial, parseDesktop, parseLite } from "./parse.js";
import { resolveGotos } from "./gotos.js";

export { regions } from "./const/regions.js";

export const type = "videos";

export default class GoogleVideosEngine {
  isClientExposed = false;
  name = "Google Videos";
  safeSearch = "off";
  resultsFormat = "lite";
  settingsSchema = SETTINGS_SCHEMA;

  configure(settings) {
    if (typeof settings.safeSearch === "string") this.safeSearch = settings.safeSearch;
    if (settings.resultsFormat === "lite" || settings.resultsFormat === "html")
      this.resultsFormat = settings.resultsFormat;
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    if (this.resultsFormat === "html") {
      return this._searchHtml(query, page, timeFilter, context);
    }
    return this._searchLite(query, page, timeFilter, context);
  }

  async _searchHtml(query, page, timeFilter, context) {
    const url = buildSearchUrl(query, page, timeFilter, this.safeSearch, context);
    const userAgent = context?.userAgent?.() || gsaAgent();
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(url, {
      headers: buildHeaders(userAgent, context),
      redirect: "follow",
    });

    context?.sentinel?.(response, this.name);
    const html = await response.text();

    if (isInterstitial(html)) {
      if (context?.engineError) {
        throw context.engineError(
          "interstitial",
          `${this.name} returned a JavaScript/consent interstitial`,
          { engine: this.name },
        );
      }
      throw new Error(`${this.name} returned a JavaScript/consent interstitial`);
    }

    return resolveGotos(parseDesktop(cheerio.load(html), this.name), userAgent);
  }

  async _searchLite(query, page = 1, timeFilter, context) {
    const url = buildSearchUrl(query, page, timeFilter, this.safeSearch, context);
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(url, {
      headers: buildHeaders(gsaAgent(), context),
      redirect: "follow",
    });

    context?.sentinel?.(response, this.name);
    return parseLite(cheerio.load(await response.text()), this.name);
  }
}
