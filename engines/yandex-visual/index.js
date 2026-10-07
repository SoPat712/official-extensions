import * as cheerio from "cheerio";

const ID = "yandex-visual-engine";
const NAME = "Yandex Visual Search";
const FALLBACK_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
const DESCRIPTION =
  "Yandex Visual Search allows you to search for images by uploading an image or by typing a description of the image you are looking for. Please read the privacy note above the configuration options before using it.";
const DOMAINS = ["yandex.com", "yandex.ru", "yandex.com.tr", "yandex.kz"];
const UPLOAD_BLOCKS = JSON.stringify({
  blocks: [{ block: "b-page_type_search-by-image__link" }],
});
const CAPTCHA_RE = /showcaptcha|smartcaptcha/i;
const MAX_TEXT = 200;

const Include = Object.freeze({
  Both: "both",
  Pages: "pages",
  Similar: "similar",
});

const INCLUDE_LABELS = {
  [Include.Both]: "Pages and similar images",
  [Include.Pages]: "Pages that contain the image",
  [Include.Similar]: "Similar images",
};

const _tr = (t, key, fallback) => {
  const value = t?.(`${ID}.${key}`);
  return typeof value === "string" && value !== `${ID}.${key}`
    ? value
    : fallback;
};

const _abs = (url, host) => {
  if (typeof url !== "string" || !url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${host}${url}`;
  return url;
};

const _multipart = (field, filename, mime, bytes) => {
  const boundary = `----degoog${crypto.randomUUID().replaceAll("-", "")}`;
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  return { body, type: `multipart/form-data; boundary=${boundary}` };
};

const _extension = (mime) =>
  ({ "image/png": "png", "image/webp": "webp" })[mime] ?? "jpg";

const _initialState = (html) => {
  const $ = cheerio.load(html);
  let found = null;
  $("[data-state]").each((_, el) => {
    if (found) return;
    const raw = $(el).attr("data-state") ?? "";
    if (!raw.includes("cbirSites") && !raw.includes("cbirSimilar")) return;
    try {
      found = JSON.parse(raw).initialState ?? null;
    } catch {}
  });
  return found;
};

const _pages = (state, host) =>
  (state?.cbirSites?.sites ?? [])
    .filter(
      (site) => typeof site?.url === "string" && site.url.startsWith("http"),
    )
    .map((site) => ({
      title: site.title || site.domain || "",
      url: site.url,
      snippet: site.description || "",
      source: NAME,
      thumbnail:
        _abs(site.thumb?.url, host) || _abs(site.originalImage?.url, host),
      imageUrl: _abs(site.originalImage?.url, host) || undefined,
    }));

const _imgUrlOf = (link) => {
  try {
    return (
      new URL(link, "https://yandex.com").searchParams.get("img_url") ?? ""
    );
  } catch {
    return "";
  }
};

const _similar = (state, host) =>
  (state?.cbirSimilar?.thumbs ?? [])
    .filter((thumb) => typeof thumb?.imageUrl === "string")
    .map((thumb) => {
      const original = _imgUrlOf(thumb.linkUrl);
      return {
        title: thumb.title || "",
        url: original || _abs(thumb.linkUrl, host),
        snippet: "",
        source: NAME,
        thumbnail: _abs(thumb.imageUrl, host),
        imageUrl: original || undefined,
      };
    });

const _schema = (t) => [
  {
    key: "privacy",
    label: "Where the image goes",
    type: "info",
    description:
      "This engine uploads every image searched with it to Yandex, a third party, together with any words typed next to it. Yandex sees this server's IP address, not the visitor's, and keeps the image under its own terms.",
  },
  {
    key: "domain",
    label: "Yandex domain",
    type: "select",
    options: DOMAINS,
    default: DOMAINS[0],
  },
  {
    key: "include",
    label: "Results",
    type: "select",
    options: Object.values(Include),
    optionLabels: Object.values(Include).map((id) =>
      _tr(t, `options.include.${id}`, INCLUDE_LABELS[id]),
    ),
    default: Include.Both,
    description:
      "Pages that contain the image, images that look like it, or both. Pages come first.",
  },
];

export default class YandexVisualEngine {
  name = NAME;
  domain = DOMAINS[0];
  include = Include.Both;
  description = DESCRIPTION;

  get settingsSchema() {
    return _schema(this.t);
  }

  configure(settings) {
    if (DOMAINS.includes(settings?.domain)) this.domain = settings.domain;
    if (Object.values(Include).includes(settings?.include))
      this.include = settings.include;
  }

  _headers(context, extra = {}) {
    return {
      "User-Agent": context?.userAgent?.() ?? FALLBACK_UA,
      "Accept-Language": context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
      Referer: `https://${this.domain}/images/`,
      ...extra,
    };
  }

  _blocked(context, where) {
    return (
      context?.engineError?.(
        "captcha",
        `${NAME} asked for a captcha ${where}`,
        {
          engine: NAME,
        },
      ) ?? new Error(`${NAME} asked for a captcha ${where}`)
    );
  }

  async _upload(image, context) {
    const host = `https://${this.domain}`;
    const { body, type } = _multipart(
      "upfile",
      `image.${_extension(image.mime)}`,
      image.mime,
      image.bytes,
    );
    const res = await context.fetch(
      `${host}/images/search?rpt=imageview&format=json&request=${encodeURIComponent(UPLOAD_BLOCKS)}`,
      {
        method: "POST",
        headers: this._headers(context, {
          Accept: "application/json",
          "Content-Type": type,
        }),
        body,
      },
    );
    context.sentinel?.(res, NAME);
    const text = await res.text();
    if (CAPTCHA_RE.test(res.url ?? "") || CAPTCHA_RE.test(text))
      throw this._blocked(context, "on upload");
    let cbirId = "";
    try {
      cbirId = JSON.parse(text)?.blocks?.[0]?.params?.cbirId ?? "";
    } catch {}
    if (!cbirId) throw new Error(`${NAME} didn't accept the image`);
    return cbirId;
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    const image = context?.image;
    if (!image || page > 1) return [];
    const host = `https://${this.domain}`;
    const cbirId = await this._upload(image, context);
    const params = new URLSearchParams({
      rpt: "imageview",
      cbir_id: cbirId,
      cbir_page: this.include === Include.Similar ? "similar" : "sites",
    });
    const text = String(query ?? "")
      .trim()
      .slice(0, MAX_TEXT);
    if (text) params.set("text", text);
    const res = await context.fetch(`${host}/images/search?${params}`, {
      headers: this._headers(context, {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      }),
      redirect: "follow",
    });
    context.sentinel?.(res, NAME);
    const html = await res.text();
    const state = _initialState(html);
    if (!state) {
      if (CAPTCHA_RE.test(res.url ?? "") || CAPTCHA_RE.test(html))
        throw this._blocked(context, "on the results page");
      throw new Error(`${NAME} changed its results page`);
    }
    const results = [
      ...(this.include === Include.Similar ? [] : _pages(state, host)),
      ...(this.include === Include.Pages ? [] : _similar(state, host)),
    ];
    const seen = new Set();
    return results.filter((r) => {
      if (!r.thumbnail || seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });
  }
}

export const type = "images";
export const input = "image";
