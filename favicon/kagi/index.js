const HOST_PATTERN = /^[a-z0-9.-]+$/;
const MAX_HOST_LENGTH = 253;
const QUALITY_OPTIONS = ["fast", "best"];
const DEFAULT_QUALITY = "fast";

const _cleanHost = (host) => {
  if (typeof host !== "string") return "";
  const value = host.trim().toLowerCase();
  if (!value || value.length > MAX_HOST_LENGTH) return "";
  if (!HOST_PATTERN.test(value)) return "";
  if (value.startsWith(".") || value.endsWith(".") || value.includes("..")) return "";
  return value;
};

export default class KagiFaviconProvider {
  name = "Kagi Favicons";
  description =
    "The favicon proxy behind Kagi News. It's undocumented, so keep another provider below it.";

  settingsSchema = [
    {
      key: "quality",
      label: "Quality",
      type: "select",
      options: QUALITY_OPTIONS,
      default: DEFAULT_QUALITY,
      description:
        "fast is quicker. best finds more icons, but some come back as SVG, which degoog refuses, and the next provider gets a turn.",
    },
  ];

  _quality = DEFAULT_QUALITY;

  configure(settings) {
    const quality = String(settings?.quality ?? "").trim();
    this._quality = QUALITY_OPTIONS.includes(quality) ? quality : DEFAULT_QUALITY;
  }

  async getFavicon(host) {
    const clean = _cleanHost(host);
    if (!clean) return null;
    return {
      url: `https://news.kagi.com/api/favicon-proxy?domain=${clean}&quality=${this._quality}`,
    };
  }
}
