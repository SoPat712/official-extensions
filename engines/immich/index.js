import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ID_RE = /^[0-9a-f-]{36}$/i;
const SECRET = randomBytes(32);
const SIZES = ["thumbnail", "preview"];

const _trimUrl = (v) => String(v ?? "").trim().replace(/\/+$/, "");

const _sign = (id) => createHmac("sha256", SECRET).update(id).digest("hex").slice(0, 32);

const _validSig = (id, sig) => {
  const want = Buffer.from(_sign(id));
  const got = Buffer.from(String(sig ?? ""));
  return want.length === got.length && timingSafeEqual(want, got);
};

const _date = (iso) => {
  const d = new Date(iso ?? "");
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

const _place = (exif) => [exif?.city, exif?.country].filter(Boolean).join(", ");

const ID = "immich-engine";
const THUMB_LABELS = { thumbnail: "Small, loads faster", preview: "Preview, sharper" };

const _tr = (t, key, fallback) => {
  const value = t?.(`${ID}.${key}`);
  return typeof value === "string" && value !== `${ID}.${key}` ? value : fallback;
};

const _schema = (t) => [
  {
    key: "url",
    label: "Immich URL",
    type: "url",
    required: true,
    placeholder: "http://192.168.1.10:2283",
    description: "The address this server uses to reach Immich.",
  },
  {
    key: "apiKey",
    label: "API key",
    type: "password",
    secret: true,
    required: true,
    placeholder: "Immich API key",
    description:
      "Create one in Immich under Account Settings > API Keys, with the asset.read and asset.view permissions.",
  },
  {
    key: "publicUrl",
    label: "Public Immich URL",
    type: "url",
    placeholder: "https://photos.example.com",
    description:
      "Optional. Links that open a photo in Immich use this address. Leave it blank to use the Immich URL above.",
  },
  {
    key: "pageSize",
    label: "Results per page",
    type: "number",
    default: "30",
  },
  {
    key: "thumbSize",
    label: "Thumbnail size",
    type: "select",
    default: "thumbnail",
    options: SIZES,
    optionLabels: SIZES.map((s) => _tr(t, `options.thumbSize.${s}`, THUMB_LABELS[s])),
  },
];

export default class ImmichEngine {
  isClientExposed = false;
  name = "Immich";
  bangShortcut = "immich";
  immichUrl = "";
  publicUrl = "";
  apiKey = "";
  pageSize = 30;
  thumbSize = "thumbnail";

  get settingsSchema() {
    return _schema(this.t);
  }

  routes = [
    {
      method: "get",
      path: "/thumb",
      handler: (req) => this.serveThumb(req),
    },
  ];

  configure(settings) {
    this.immichUrl = _trimUrl(settings?.url);
    this.publicUrl = _trimUrl(settings?.publicUrl);
    this.apiKey = String(settings?.apiKey ?? "").trim();
    const size = Number.parseInt(String(settings?.pageSize ?? ""), 10);
    this.pageSize = Number.isFinite(size) && size > 0 ? Math.min(size, 250) : 30;
    this.thumbSize = SIZES.includes(settings?.thumbSize) ? settings.thumbSize : "thumbnail";
  }

  async serveThumb(req) {
    const params = new URL(req.url).searchParams;
    const id = params.get("id") ?? "";
    const size = SIZES.includes(params.get("size")) ? params.get("size") : this.thumbSize;
    if (!ID_RE.test(id) || !_validSig(id, params.get("sig"))) return new Response(null, { status: 403 });
    if (!this.immichUrl || !this.apiKey) return new Response(null, { status: 404 });
    try {
      const res = await fetch(`${this.immichUrl}/api/assets/${id}/thumbnail?size=${size}`, {
        headers: { "x-api-key": this.apiKey },
      });
      if (!res.ok) return new Response(null, { status: res.status === 404 ? 404 : 502 });
      const type = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
      if (!type.startsWith("image/")) return new Response(null, { status: 502 });
      return new Response(res.body, {
        status: 200,
        headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" },
      });
    } catch {
      return new Response(null, { status: 502 });
    }
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    if (!this.immichUrl || !this.apiKey || !context?.routeUrl) return [];
    const doFetch = context.fetch ?? fetch;
    const response = await doFetch(`${this.immichUrl}/api/search/smart`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "x-api-key": this.apiKey },
      body: JSON.stringify({ query, page, size: this.pageSize, withExif: true }),
    });
    context.sentinel?.(response, this.name);
    const data = await response.json();
    const items = Array.isArray(data?.assets?.items) ? data.assets.items : [];
    const base = this.publicUrl || this.immichUrl;
    return items
      .filter((asset) => ID_RE.test(String(asset?.id ?? "")))
      .map((asset) => {
        const id = String(asset.id);
        const sig = _sign(id);
        return {
          title: asset.originalFileName || _tr(this.t, "result.photo", "Photo"),
          url: `${base}/photos/${encodeURIComponent(id)}`,
          snippet: [_date(asset.localDateTime || asset.fileCreatedAt), _place(asset.exifInfo)].filter(Boolean).join(" · "),
          source: this.name,
          thumbnail: context.routeUrl(`/thumb?id=${id}&sig=${sig}`),
          imageUrl: context.routeUrl(`/thumb?id=${id}&sig=${sig}&size=preview`),
        };
      });
  }
}

export const type = "images";
