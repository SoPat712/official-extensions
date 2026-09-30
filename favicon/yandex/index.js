const YANDEX_SIZES = [16, 32, 120];
const HOST_PATTERN = /^[a-z0-9.-]+$/;
const MAX_HOST_LENGTH = 253;
const TIMEOUT_MS = 5000;
const MAX_BYTES = 64 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_MIN_HEADER = 24;
const MIN_REAL_ICON_SIDE = 2;
const PNG_CONTENT_TYPE = "image/png";

const _cleanHost = (host) => {
  if (typeof host !== "string") return "";
  const value = host.trim().toLowerCase();
  if (!value || value.length > MAX_HOST_LENGTH) return "";
  if (!HOST_PATTERN.test(value)) return "";
  if (value.startsWith(".") || value.endsWith(".") || value.includes("..")) return "";
  return value;
};

const _readCapped = async (res, limit) => {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
};

const _isRealPng = (bytes) => {
  if (!bytes || bytes.byteLength < PNG_MIN_HEADER) return false;
  if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width >= MIN_REAL_ICON_SIDE && height >= MIN_REAL_ICON_SIDE;
};

export default class YandexFaviconProvider {
  name = "Yandex Favicons";
  description = "Yandex's favicon service, 120px for most sites.";

  configure() {}

  async getFavicon(host, context) {
    const clean = _cleanHost(host);
    if (!clean) return null;
    const doFetch = context?.fetch ?? fetch;
    const wanted = Number(context?.size) || 32;
    const size = YANDEX_SIZES.find((s) => s >= wanted) ?? YANDEX_SIZES[YANDEX_SIZES.length - 1];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await doFetch(
        `https://favicon.yandex.net/favicon/v2/${clean}?size=${size}`,
        {
          signal: controller.signal,
          headers: context?.userAgent ? { "User-Agent": context.userAgent } : undefined,
        },
      );
      if (!res.ok) return null;
      const bytes = await _readCapped(res, MAX_BYTES);
      if (!_isRealPng(bytes)) return null;
      return { data: bytes, contentType: PNG_CONTENT_TYPE };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
