const FETCH_TIMEOUT_MS = 30000;
const PROXY_TYPES = ["socks5", "socks4", "http", "https"];

export default class FourPlayTransport {
  isClientExposed = true;
  name = "lolcat-4play";
  displayName = "4play (lolcat)";
  description =
    "Fetches pages using a real Firefox session via the official [lolcat 4play](https://git.lolcat.ca/lolcat/4play) browser extension. Point the extension at this transport's WebSocket address instead of a separate server.";

  _password = "";
  _timeoutMs = 30000;
  _apiFetch = true;
  _useContainer = false;
  _proxyType = "none";
  _proxyHost = "";
  _proxyPort = 1080;
  _proxyUsername = "";
  _proxyPassword = "";
  _proxyDns = true;
  _session = null;

  get settingsSchema() {
    return [
      {
        key: "wsUrl",
        label: "WebSocket path",
        type: "info",
        default: `/ws/${this.name}`,
      },
      {
        key: "password",
        label: "Password",
        type: "password",
        default: "",
        description:
          "Acts as the WebSocket path segment (e.g. password 'cnc' -> ws://host:4444/ws/lolcat-4play-transport/cnc). Must match what you set in the extension popup.",
      },
      {
        key: "timeout",
        label: "Page load timeout (ms)",
        type: "number",
        placeholder: "30000",
        description:
          "Maximum time to wait for a page to fully load (5000-120000 ms).",
      },
      {
        key: "apiFetch",
        label: "API response forwarding",
        type: "toggle",
        default: "true",
        description:
          "When a page returns non-HTML content (e.g. a JSON API endpoint), the transport makes an additional browser XHR request to retrieve the raw response. Required for engines that target JSON APIs. Disable if you only use this transport for HTML pages.",
      },
      {
        key: "useContainer",
        label: "Container isolation",
        type: "toggle",
        default: "false",
        description:
          "Open each request in a fresh Firefox container and delete it afterwards. Enabled automatically when a proxy is configured.",
      },
      {
        key: "proxyType",
        label: "Proxy type",
        type: "select",
        options: ["none", "socks5", "socks4", "http", "https"],
        default: "none",
        description:
          "Proxy protocol to attach to the container. Enabling any proxy type turns on container isolation automatically.",
      },
      {
        key: "proxyHost",
        label: "Proxy host",
        type: "text",
        placeholder: "127.0.0.1",
        description: "Proxy server hostname or IP address.",
      },
      {
        key: "proxyPort",
        label: "Proxy port",
        type: "number",
        placeholder: "1080",
        description: "Proxy server port.",
      },
      {
        key: "proxyUsername",
        label: "Proxy username",
        type: "text",
        description: "Optional proxy username.",
      },
      {
        key: "proxyPassword",
        label: "Proxy password",
        type: "password",
        description: "Optional proxy password.",
      },
      {
        key: "proxyDns",
        label: "Proxy DNS",
        type: "toggle",
        default: "true",
        description:
          "Route DNS lookups through the proxy. Recommended for SOCKS to avoid DNS leaks.",
      },
    ];
  }

  wsHandler = {
    onUpgrade: (passwordPath) => passwordPath === `/${this._password}`,

    onOpen: () => {
      console.log("[lolcat-4play] browser extension connected");
    },

    onMessage: () => {},

    onClose: () => {
      console.log("[lolcat-4play] browser extension disconnected");
    },
  };

  bindWsSession(session) {
    this._session = session;
  }

  configure(settings) {
    this._timeoutMs = Math.max(
      5000,
      Math.min(120000, Number(settings.timeout) || 30000),
    );
    this._apiFetch = settings.apiFetch !== "false";
    this._useContainer = settings.useContainer === "true";
    this._proxyType = PROXY_TYPES.includes(settings.proxyType)
      ? settings.proxyType
      : "none";
    this._proxyHost = (settings.proxyHost || "").trim();
    this._proxyPort = parseInt(settings.proxyPort, 10) || 1080;
    this._proxyUsername = (settings.proxyUsername || "").trim();
    this._proxyPassword = (settings.proxyPassword || "").trim();
    this._proxyDns = settings.proxyDns !== "false";
    this._password =
      typeof settings.password === "string" ? settings.password : "";
  }

  available() {
    return this._session?.connected() === true;
  }

  _cmd(action, params = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    if (!this._session) {
      return Promise.reject(
        new Error("lolcat-4play: transport session not initialized"),
      );
    }
    return this._session.cmd(action, params, timeoutMs);
  }

  _awaitDom(tabid) {
    if (!this._session) {
      return Promise.reject(
        new Error("lolcat-4play: transport session not initialized"),
      );
    }
    return this._session.awaitDom(tabid, this._timeoutMs);
  }

  _buildProxy() {
    const proxy = {
      type: this._proxyType === "socks5" ? "socks" : this._proxyType,
      host: this._proxyHost,
      port: this._proxyPort,
      proxyDNS: this._proxyDns,
    };
    if (this._proxyUsername) proxy.username = this._proxyUsername;
    if (this._proxyPassword) proxy.password = this._proxyPassword;
    return proxy;
  }

  _injectText(injectResp) {
    const body = injectResp?.result?.[0]?.result ?? "";
    return typeof body === "string" ? body : String(body);
  }

  _isHtml(text) {
    const t = String(text ?? "").trimStart();
    return t.startsWith("<") || t.startsWith("<!");
  }

  _toResponse(text) {
    const trimmed = String(text ?? "").trimStart();
    const isJson =
      this._apiFetch &&
      (trimmed.startsWith("{") ||
        trimmed.startsWith("[") ||
        trimmed.startsWith(")]}'"));
    return new Response(String(text ?? ""), {
      status: 200,
      headers: {
        "Content-Type": isJson
          ? "application/json; charset=utf-8"
          : "text/html; charset=utf-8",
      },
    });
  }

  _primaryInjectJs() {
    if (!this._apiFetch) {
      return "(() => document.documentElement.outerHTML)()";
    }
    return `(async () => {
      const ct = document.contentType || "";
      if (ct && !ct.startsWith("text/html")) {
        const r = await fetch(location.href, { credentials: "include" });
        return await r.text();
      }
      return document.documentElement.outerHTML;
    })()`;
  }

  _originFetchJs(url) {
    return `(async () => {
      const r = await fetch(${JSON.stringify(url)}, { credentials: "include" });
      return await r.text();
    })()`;
  }

  async _originFetch(tabId, url) {
    const injectResp = await this._cmd("tab_inject_js", {
      tabid: tabId,
      js: this._originFetchJs(url),
      isolated: false,
    });
    if (injectResp?.status !== true) {
      throw new Error(
        `lolcat-4play: origin fallback inject failed - ${injectResp?.status ?? "unknown"}`,
      );
    }
    return this._injectText(injectResp);
  }

  async fetch(url) {
    const needsContainer = this._proxyType !== "none" || this._useContainer;
    let containerId = null;
    let tabId = null;

    const mkTabParams = (target) => {
      const params = { url: target };
      if (containerId) params.container = containerId;
      return params;
    };

    const closeTab = async (id) => {
      if (typeof id !== "number") return;
      await this._cmd("tab_close", { tabid: [id] }).catch((e) =>
        console.error("[lolcat-4play] tab_close failed:", e?.message ?? e),
      );
    };

    try {
      if (needsContainer) {
        const cr = await this._cmd("container_create");
        if (cr?.id) {
          containerId = cr.id;
          if (this._proxyType !== "none") {
            await this._cmd("container_attach_proxy", {
              id: containerId,
              proxy: this._buildProxy(),
            });
          }
        }
      }

      const tabResp = await this._cmd("tab_open", mkTabParams(url));
      tabId = tabResp?.data?.id;
      if (typeof tabId !== "number") {
        throw new Error("lolcat-4play: tab_open did not return a valid tab id");
      }

      await this._awaitDom(tabId);

      const injectResp = await this._cmd("tab_inject_js", {
        tabid: tabId,
        js: this._primaryInjectJs(),
        isolated: false,
      });

      const injectOk = injectResp?.status === true;
      const injectMsg = String(injectResp?.status ?? "");
      const permBlocked =
        !injectOk && injectMsg.includes("Missing host permission");

      if (!injectOk && !permBlocked) {
        throw new Error(
          `lolcat-4play: JS inject failed - ${injectMsg || "unknown error"}`,
        );
      }

      let browserText = "";
      let needsOriginFallback = permBlocked;

      if (injectOk) {
        browserText = this._injectText(injectResp);
        if (this._apiFetch && this._isHtml(browserText)) {
          needsOriginFallback = true;
        } else {
          return this._toResponse(browserText);
        }
      }

      if (!needsOriginFallback) {
        throw new Error("lolcat-4play: JS inject failed");
      }

      await closeTab(tabId);
      tabId = null;

      const origin = new URL(url).origin;
      const originResp = await this._cmd("tab_open", mkTabParams(`${origin}/`));
      tabId = originResp?.data?.id;
      if (typeof tabId !== "number") {
        throw new Error("lolcat-4play: origin fallback tab_open failed");
      }

      await this._awaitDom(tabId);
      const xhrText = await this._originFetch(tabId, url);
      return this._toResponse(xhrText);
    } finally {
      await closeTab(tabId);
      if (containerId) {
        await this._cmd("container_delete", { id: [containerId] }).catch((e) =>
          console.error(
            "[lolcat-4play] container_delete failed:",
            e?.message ?? e,
          ),
        );
      }
    }
  }
}
