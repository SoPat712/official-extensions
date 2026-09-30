import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

const HOST_PATTERN = /^[a-z0-9.-]+$/;
const MAX_HOST_LENGTH = 253;
const PNG_CONTENT_TYPE = "image/png";
const ICON_SIZE = 64;
const GRID = 5;
const CELL = 12;
const OFFSET = (ICON_SIZE - GRID * CELL) / 2;
const HALF_COLUMNS = Math.ceil(GRID / 2);
const CHANNELS = 4;
const STYLE_SQUARES = "squares";
const STYLE_DOTS = "dots";
const STYLES = [STYLE_SQUARES, STYLE_DOTS];
const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_BIT_DEPTH = 8;
const PNG_COLOR_TYPE_RGBA = 6;
const PNG_FILTER_NONE = 0;
const MIN_FILLED_CELLS = 4;
const DOT_INSET = 0.8;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const _cleanHost = (host) => {
  if (typeof host !== "string") return "";
  const value = host.trim().toLowerCase();
  if (!value || value.length > MAX_HOST_LENGTH) return "";
  if (!HOST_PATTERN.test(value)) return "";
  if (value.startsWith(".") || value.endsWith(".") || value.includes("..")) return "";
  return value;
};

const _crc32 = (bytes) => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const _chunk = (type, data) => {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, _crc32(out.subarray(4, 8 + data.length)));
  return out;
};

const _encodePng = (pixels, width, height) => {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = PNG_BIT_DEPTH;
  header[9] = PNG_COLOR_TYPE_RGBA;
  const stride = width * CHANNELS;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = PNG_FILTER_NONE;
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const parts = [
    PNG_SIGNATURE,
    _chunk("IHDR", header),
    _chunk("IDAT", new Uint8Array(deflateSync(raw))),
    _chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const _hslToRgb = (h, s, l) => {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
};

const _colourFrom = (hash) => {
  const hue = ((hash[0] << 8) | hash[1]) % 360;
  const saturation = 0.55 + (hash[2] / 255) * 0.2;
  const lightness = 0.45 + (hash[3] / 255) * 0.15;
  return _hslToRgb(hue, saturation, lightness);
};

const _cellsFrom = (hash) => {
  const cells = [];
  for (let row = 0; row < GRID; row++) {
    const line = [];
    for (let col = 0; col < HALF_COLUMNS; col++) {
      const index = row * HALF_COLUMNS + col;
      line.push((hash[4 + index] & 1) === 1);
    }
    cells.push([...line, ...line.slice(0, GRID - HALF_COLUMNS).reverse()]);
  }
  const filled = cells.flat().filter(Boolean).length;
  if (filled < MIN_FILLED_CELLS) {
    cells[2] = cells[2].map(() => true);
    cells[1][2] = true;
    cells[3][2] = true;
  }
  return cells;
};

const _insideDot = (x, y) => {
  const centre = (CELL - 1) / 2;
  const radius = CELL / 2 - DOT_INSET;
  return (x - centre) ** 2 + (y - centre) ** 2 <= radius * radius;
};

const _render = (host, style) => {
  const hash = createHash("sha256").update(host).digest();
  const [r, g, b] = _colourFrom(hash);
  const cells = _cellsFrom(hash);
  const pixels = new Uint8Array(ICON_SIZE * ICON_SIZE * CHANNELS);
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      if (!cells[row][col]) continue;
      for (let dy = 0; dy < CELL; dy++) {
        for (let dx = 0; dx < CELL; dx++) {
          if (style === STYLE_DOTS && !_insideDot(dx, dy)) continue;
          const x = OFFSET + col * CELL + dx;
          const y = OFFSET + row * CELL + dy;
          const i = (y * ICON_SIZE + x) * CHANNELS;
          pixels[i] = r;
          pixels[i + 1] = g;
          pixels[i + 2] = b;
          pixels[i + 3] = 255;
        }
      }
    }
  }
  return _encodePng(pixels, ICON_SIZE, ICON_SIZE);
};

export default class IdenticonFaviconProvider {
  name = "Identicon (offline)";
  description =
    "A pattern drawn from the domain name. No network requests.";

  settingsSchema = [
    {
      key: "style",
      label: "Style",
      type: "select",
      options: STYLES,
      default: STYLE_SQUARES,
      description: "squares for blocks, dots for round cells.",
    },
  ];

  _style = STYLE_SQUARES;

  configure(settings) {
    const style = String(settings?.style ?? "").trim();
    this._style = STYLES.includes(style) ? style : STYLE_SQUARES;
  }

  async getFavicon(host) {
    const clean = _cleanHost(host);
    if (!clean) return null;
    return { data: _render(clean, this._style), contentType: PNG_CONTENT_TYPE };
  }
}
