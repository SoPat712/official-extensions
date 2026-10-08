export const SETTINGS_SCHEMA = [
  {
    key: "outgoingTransport",
    label: "Outgoing HTTP client transport",
    type: "select",
    options: ["fetch", "curl", "curl-fallback"],
    default: "curl",
    advanced: true,
  },
  {
    key: "resultsFormat",
    label: "Results format",
    type: "select",
    options: ["lite", "html"],
    optionLabels: ["Lite results", "HTML results"],
    default: "lite",
    description: "Which Google page the results come from.",
  },
  {
    key: "liteFormatInfo",
    label: "Lite results",
    type: "info",
    description:
      "Lite results come from Google's old mobile page and work over any transport, but Google rate-limits them per IP. Use the [4play (lolcat)](https://github.com/degoog-org/official-extensions/tree/main/transports/lolcat-4play) transport if you can.",
    visibleWhen: { key: "resultsFormat", equals: "lite" },
  },
  {
    key: "htmlFormatInfo",
    label: "HTML results",
    type: "info",
    description:
      "HTML results fetch the full desktop page for better titles and snippets. They need the [4play (lolcat)](https://github.com/degoog-org/official-extensions/tree/main/transports/lolcat-4play) transport selected above.",
    visibleWhen: { key: "resultsFormat", equals: "html" },
  },
  {
    key: "safeSearch",
    label: "Safe search",
    type: "select",
    options: ["off", "on"],
    description: "Hides explicit content from search results.",
  },
];
