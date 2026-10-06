const BASE = window.__DEGOOG_BASE_URL__ ?? "";
const ROUTE = `${BASE}/api/plugin/${__PLUGIN_ID__}`;
const ACTION_ID = `${__PLUGIN_ID__}-upload`;
const _t = (key, vars) => t(`image-search-command.script.${key}`, vars);
const ACTIVE_KEY = "image-search:active";
const FALLBACK_MAX_SIDE = 768;
const HF_RE = /^https:\/\/huggingface\.co\/[^/]+\/[^/]+\/resolve\/[^/]+\/(.+)$/;
const DROP_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.5-4.5L7 20"/></svg>';

const _images = new WeakMap();
let _clipPromise = null;
let _ranker = null;

const _el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

const _barFor = (node) => node?.closest?.(".degoog-search-bar") ?? null;

const _inputFor = (bar) =>
  bar?.querySelector("#search-input, #results-search-input") ?? null;

const _pageBar = () =>
  document.getElementById("results-search-bar") ??
  _barFor(document.getElementById("search-input"));

const _hasFiles = (dt) => !!dt && Array.from(dt.types ?? []).includes("Files");

const _firstImage = (list) =>
  Array.from(list ?? []).find((f) => f?.type?.startsWith("image/")) ?? null;

const _readActive = () => {
  try {
    return JSON.parse(sessionStorage.getItem(ACTIVE_KEY) ?? "null");
  } catch {
    return null;
  }
};

const _clearActive = () => {
  try {
    sessionStorage.removeItem(ACTIVE_KEY);
  } catch {}
};

const _toast = (message) => {
  const node = _el("div", "image-search-toast", message);
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3500);
};

let _configPromise = null;

const _config = () => {
  _configPromise ??= fetch(`${ROUTE}/config`).then((res) => {
    if (!res.ok) throw new Error(`config HTTP ${res.status}`);
    return res.json();
  });
  _configPromise.catch(() => {
    _configPromise = null;
  });
  return _configPromise;
};

const _prepare = async (file) => {
  const maxSide = await _config()
    .then((cfg) => cfg.uploadMaxSide)
    .catch(() => FALLBACK_MAX_SIDE);
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.88);
};

const _dropzone = (bar) => {
  let zone = bar.querySelector(".image-search-dropzone");
  if (zone) return zone;
  zone = _el("div", "image-search-dropzone");
  const icon = _el("div", "image-search-dropzone-icon");
  icon.innerHTML = DROP_ICON;
  zone.append(
    icon,
    _el("div", "image-search-dropzone-title", _t("dropTitle")),
    _el("div", "image-search-dropzone-hint", _t("dropHint")),
  );
  bar.appendChild(zone);
  return zone;
};

const _detach = (bar) => {
  if (!bar) return;
  const input = _inputFor(bar);
  bar.querySelector(".image-search-chip")?.remove();
  bar.classList.remove("image-search-has-image", "image-search-busy");
  _images.delete(bar);
  if (input && input.dataset.imageSearchPlaceholder != null) {
    input.placeholder = input.dataset.imageSearchPlaceholder;
    delete input.dataset.imageSearchPlaceholder;
  }
};

const _attach = (bar, dataUrl, { focus = true } = {}) => {
  const input = _inputFor(bar);
  if (!bar || !input) return;
  _detach(bar);
  const chip = _el("span", "image-search-chip");
  const img = _el("img");
  img.src = dataUrl;
  img.alt = "";
  const spinner = _el("span", "image-search-chip-spinner");
  const remove = _el("button", "image-search-chip-remove", "×");
  remove.type = "button";
  remove.title = _t("remove");
  remove.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    _detach(bar);
    if (bar.id === "results-search-bar") _stopRanker(true);
    input.focus();
  });
  chip.append(img, spinner, remove);
  input.before(chip);
  bar.classList.add("image-search-has-image");
  _images.set(bar, dataUrl);
  input.dataset.imageSearchPlaceholder = input.placeholder ?? "";
  input.placeholder = _t("refine");
  if (focus) input.focus();
};

const _attachFile = async (bar, file) => {
  if (!bar || !file) return;
  try {
    _attach(bar, await _prepare(file));
  } catch (err) {
    console.error("[image-search]", err);
    _toast(_t("readFailed"));
  }
};

const _pick = (bar) => {
  const picker = _el("input");
  picker.type = "file";
  picker.accept = "image/*";
  picker.addEventListener(
    "change",
    () => void _attachFile(bar, picker.files?.[0]),
  );
  picker.click();
};

let _dragTimer = 0;
const _endDrag = () => {
  document.body.classList.remove("image-search-dragging");
  document
    .querySelectorAll(".image-search-over")
    .forEach((b) => b.classList.remove("image-search-over"));
};

document.addEventListener(
  "dragover",
  (e) => {
    if (!_hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    document.querySelectorAll(".degoog-search-bar").forEach(_dropzone);
    document.body.classList.add("image-search-dragging");
    const over = _barFor(e.target);
    document
      .querySelectorAll(".degoog-search-bar")
      .forEach((b) => b.classList.toggle("image-search-over", b === over));
    clearTimeout(_dragTimer);
    _dragTimer = setTimeout(_endDrag, 180);
  },
  true,
);

document.addEventListener(
  "drop",
  (e) => {
    if (!_hasFiles(e.dataTransfer)) return;
    const bar = _barFor(e.target) ?? _pageBar();
    if (!bar) return;
    e.preventDefault();
    e.stopPropagation();
    _endDrag();
    const file = _firstImage(e.dataTransfer.files);
    if (!file) return _toast(_t("notImage"));
    void _attachFile(bar, file);
  },
  true,
);

document.addEventListener(
  "paste",
  (e) => {
    const bar = _barFor(e.target);
    if (!bar) return;
    const file = _firstImage(
      Array.from(e.clipboardData?.items ?? [])
        .map((i) => i.getAsFile?.())
        .filter(Boolean),
    );
    if (!file) return;
    e.preventDefault();
    void _attachFile(bar, file);
  },
  true,
);

window.addEventListener("search-bar-action", (e) => {
  if (e.detail?.actionId !== ACTION_ID) return;
  _pick(_barFor(e.detail.input) ?? _pageBar());
});

document.addEventListener("click", (e) => {
  if (!e.target?.closest?.(".image-search-command-pick")) return;
  _pick(_pageBar());
});

const OWN_BANGS = new Set(["!lens", "!imagesearch"]);

const _splitBangs = (raw) => {
  const tokens = String(raw ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const isBang = (t) => /^!\S+$/.test(t);
  const lead = [];
  const trail = [];
  while (tokens.length && isBang(tokens[0])) lead.push(tokens.shift());
  while (tokens.length && isBang(tokens[tokens.length - 1]))
    trail.unshift(tokens.pop());
  const keep = (list) => list.filter((t) => !OWN_BANGS.has(t.toLowerCase()));
  return { lead: keep(lead), words: tokens, trail: keep(trail) };
};

const _start = async (bar) => {
  const image = _images.get(bar);
  const input = _inputFor(bar);
  if (!image || !input || bar.classList.contains("image-search-busy")) return;
  const { lead, words, trail } = _splitBangs(input.value);
  const text = words.join(" ");
  bar.classList.add("image-search-busy");
  input.dataset.imageSearchBusyText = input.placeholder;
  input.placeholder = _t("reading");
  try {
    const res = await fetch(`${ROUTE}/describe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.query)
      throw new Error(
        body.code ? _t(`errors.${body.code}`) : body.error || `HTTP ${res.status}`,
      );
    const query = [...lead, body.query, ...trail].join(" ");
    sessionStorage.setItem(
      ACTIVE_KEY,
      JSON.stringify({ image, text, query, generated: body.query }),
    );
    const api = await _resultsApi();
    if (!api || !window.degoog?.search)
      throw new Error(_t("unsupported"));
    _stopRanker(false);
    window.degoog.search(query, "images");
    void _resume({ fresh: true });
  } catch (err) {
    console.error("[image-search]", err);
    _toast(err.message || _t("failed"));
    bar.classList.remove("image-search-busy");
    input.placeholder = input.dataset.imageSearchBusyText ?? input.placeholder;
  }
};

const _intercept = (e, input) => {
  const bar = _barFor(input);
  if (!bar || !_images.has(bar)) return;
  if (
    bar.id === "results-search-bar" &&
    _ranker &&
    input.value.trim() === _ranker.active.query
  ) {
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  e.preventDefault();
  e.stopImmediatePropagation();
  void _start(bar);
};

document.addEventListener(
  "keydown",
  (e) => {
    if (e.key !== "Enter") return;
    const el = e.target;
    if (!(el instanceof HTMLInputElement)) return;
    if (el.id !== "search-input" && el.id !== "results-search-input") return;
    _intercept(e, el);
  },
  true,
);

document.addEventListener(
  "click",
  (e) => {
    const btn = e.target?.closest?.("#results-search-btn, #btn-search");
    if (!btn) return;
    const input = document.getElementById(
      btn.id === "btn-search" ? "search-input" : "results-search-input",
    );
    if (input) _intercept(e, input);
  },
  true,
);

document.addEventListener(
  "submit",
  (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement) || form.id !== "search-form-home")
      return;
    const input = document.getElementById("search-input");
    if (input) _intercept(e, input);
  },
  true,
);

const _waitFor = (selector, timeout = 15000) =>
  new Promise((resolve) => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);
    const obs = new MutationObserver(() => {
      const node = document.querySelector(selector);
      if (!node) return;
      obs.disconnect();
      resolve(node);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
      obs.disconnect();
      resolve(document.querySelector(selector));
    }, timeout);
  });

const _loadClip = (cfg, onProgress) => {
  if (_clipPromise) return _clipPromise;
  _clipPromise = (async () => {
    const T = await import(`${ROUTE}/runtime?f=transformers.min.js`);
    T.env.allowLocalModels = false;
    T.env.useBrowserCache = true;
    T.env.backends.onnx.wasm.wasmPaths = `${window.location.origin}${ROUTE}/ort/`;
    T.env.backends.onnx.wasm.numThreads = 1;
    T.env.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      const match = HF_RE.exec(url);
      if (match)
        return fetch(`${ROUTE}/model?f=${encodeURIComponent(match[1])}`, init);
      const resolved = new URL(url, window.location.href);
      if (
        resolved.origin === window.location.origin ||
        resolved.protocol === "blob:" ||
        resolved.protocol === "data:"
      ) {
        return fetch(input, init);
      }
      return Promise.reject(
        new Error(`image-search blocked an external request to ${url}`),
      );
    };
    const progress = (p) => {
      if (p?.status === "progress" && p.file?.endsWith(".onnx"))
        onProgress?.(Math.round(p.progress ?? 0));
    };
    const opts = { revision: cfg.revision, progress_callback: progress };
    const processor = await T.AutoProcessor.from_pretrained(cfg.model, {
      revision: cfg.revision,
    });
    const load = async (device, dtype) => ({
      device,
      dtype,
      vision: await T.CLIPVisionModelWithProjection.from_pretrained(cfg.model, {
        ...opts,
        device,
        dtype,
      }),
    });
    let engine = null;
    const gpu =
      cfg.device !== "wasm" && navigator.gpu
        ? await navigator.gpu.requestAdapter().catch(() => null)
        : null;
    if (gpu) {
      try {
        engine = await load("webgpu", cfg.gpuDtype);
      } catch (err) {
        if (cfg.device === "webgpu") throw err;
        console.warn(
          "[image-search] WebGPU unavailable, using WebAssembly",
          err,
        );
      }
    } else if (cfg.device === "webgpu") {
      throw new Error("WebGPU is not available in this browser");
    }
    engine ??= await load("wasm", cfg.wasmDtype);
    let textModel = null;
    const text = async () => {
      textModel ??= (async () => ({
        tokenizer: await T.AutoTokenizer.from_pretrained(cfg.model, {
          revision: cfg.revision,
        }),
        model: await T.CLIPTextModelWithProjection.from_pretrained(cfg.model, {
          ...opts,
          device: engine.device,
          dtype: engine.dtype,
        }),
      }))();
      return textModel;
    };
    return { T, processor, ...engine, text };
  })();
  _clipPromise.catch(() => {
    _clipPromise = null;
  });
  return _clipPromise;
};

const _unit = (data, dim, index) => {
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += data[index * dim + i] ** 2;
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(dim);
  for (let i = 0; i < dim; i++) out[i] = data[index * dim + i] / norm;
  return out;
};

const _dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

const _embedImages = async (clip, images) => {
  const { image_embeds } = await clip.vision(await clip.processor(images));
  return images.map((_, i) =>
    _unit(image_embeds.data, image_embeds.dims[1], i),
  );
};

const _embedText = async (clip, text) => {
  const { tokenizer, model } = await clip.text();
  const { text_embeds } = await model(
    tokenizer([text], { padding: true, truncation: true }),
  );
  return _unit(text_embeds.data, text_embeds.dims[1], 0);
};

const RANKING_ID = __PLUGIN_ID__;
const RESULTS_EVENT = "degoog-results-ready";

const _resultsApi = (timeout = 10000) =>
  new Promise((resolve) => {
    if (window.degoog?.results) return resolve(window.degoog.results);
    const done = () => resolve(window.degoog?.results ?? null);
    window.addEventListener("degoog-results-api-ready", done, { once: true });
    setTimeout(done, timeout);
  });

const _stopRanker = (clear) => {
  if (!_ranker) return;
  _ranker.stopped = true;
  window.removeEventListener(RESULTS_EVENT, _ranker.onResults);
  _ranker.api.setRanking(RANKING_ID, null);
  _ranker.strip.remove();
  _detach(document.getElementById("results-search-bar"));
  if (clear) _clearActive();
  _ranker = null;
};

const _strip = (active, onToggle) => {
  const strip = _el("div", "image-search-strip");
  const thumb = _el("img", "image-search-strip-thumb");
  thumb.src = active.image;
  thumb.alt = "";
  const body = _el("div", "image-search-strip-body");
  const line = _el("div", "image-search-strip-line");
  const [before, after = ""] = _t("searchedFor").split("{query}");
  line.append(
    before,
    _el("code", "image-search-strip-query", active.query),
    after,
    active.text ? ` · ${_t("yourWords", { text: active.text })}` : "",
  );
  const status = _el("div", "image-search-strip-status", _t("preparing"));
  const toggle = _el("button", "image-search-strip-toggle");
  toggle.type = "button";
  toggle.hidden = true;
  toggle.addEventListener("click", onToggle);
  body.append(line, status);
  strip.append(thumb, body, toggle);
  return { strip, status, toggle };
};

const _pool = (items, limit, fn) => {
  const slots = items.map(() => {
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    return { promise, resolve };
  });
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      slots[i].resolve(await fn(items[i]).catch(() => null));
    }
  };
  for (let w = 0; w < Math.min(limit, items.length); w++) void worker();
  return slots.map((slot) => slot.promise);
};

const _isActiveSearch = (api, active) => {
  const { query, type } = api.current();
  return query.trim() === active.query && type === "images";
};

const _startRanker = async (active) => {
  const api = await _resultsApi();
  const list = await _waitFor("#results-list");
  if (!api || !list) return;
  const bar = document.getElementById("results-search-bar");
  if (bar) _attach(bar, active.image, { focus: false });

  let cfg;
  try {
    cfg = await _config();
  } catch {
    return;
  }

  const scores = new Map();
  const state = {
    api,
    active,
    scores,
    stopped: false,
    busy: false,
    again: false,
    settled: false,
    showHidden: false,
    device: "",
    strip: null,
    onResults: null,
  };
  const ui = _strip(active, () => {
    state.showHidden = !state.showHidden;
    api.refresh();
    status();
  });
  state.strip = ui.strip;
  list.before(ui.strip);
  _ranker = state;

  const thumbs = () => [
    ...new Set(
      api
        .list()
        .map((r) => r.thumbnail)
        .filter(Boolean),
    ),
  ];
  const scoreOf = (r) => (r.thumbnail ? scores.get(r.thumbnail) : undefined);
  const isWeak = (s) => s.sim < cfg.matchThreshold;
  const isSame = (s) => s.sim >= cfg.sameThreshold;
  const group = (r) => {
    const s = scoreOf(r);
    if (!s) return 1;
    return isWeak(s) ? 2 : 0;
  };

  api.setRanking(RANKING_ID, {
    compare: (a, b) => {
      if (!state.settled || cfg.weakMatches === "keep") return 0;
      return (
        group(a) - group(b) ||
        (scoreOf(b)?.score ?? 0) - (scoreOf(a)?.score ?? 0)
      );
    },
    hidden: (r) => {
      const s = scoreOf(r);
      return (
        cfg.weakMatches === "hide" && !state.showHidden && !!s && isWeak(s)
      );
    },
    badge: (r) => {
      const s = scoreOf(r);
      if (!s) return null;
      if (isSame(s)) return { text: _t("same"), tone: "strong" };
      return {
        text: `${Math.round(s.sim * 100)}%`,
        tone: isWeak(s) ? "weak" : undefined,
      };
    },
  });

  const deviceLabel = () =>
    state.device === "webgpu" ? "WebGPU" : "WebAssembly";

  const status = () => {
    const all = thumbs();
    const ranked = all.map((src) => scores.get(src)).filter(Boolean);
    const same = ranked.filter(isSame).length;
    const weak = ranked.filter(isWeak).length;
    const parts = [
      _t("ranked", { done: ranked.length, total: all.length, device: deviceLabel() }),
    ];
    if (same) parts.push(_t("copies", { count: same }));
    if (weak) {
      const kind =
        cfg.weakMatches === "hide"
          ? state.showHidden
            ? "shown"
            : "hidden"
          : cfg.weakMatches === "bottom"
            ? "moved"
            : "weak";
      parts.push(_t(kind, { count: weak }));
    }
    ui.status.textContent = parts.join(" · ");
    ui.toggle.hidden = !(cfg.weakMatches === "hide" && weak);
    ui.toggle.textContent = state.showHidden
      ? _t("hideWeak")
      : _t("showHidden", { count: weak });
  };

  let clip;
  let sourceVec;
  let textVec = null;

  const rank = async () => {
    if (state.stopped) return;
    if (state.busy) {
      state.again = true;
      return;
    }
    if (!_isActiveSearch(api, active)) {
      _stopRanker(true);
      return;
    }
    state.busy = true;
    try {
      if (!clip) {
        clip = await _loadClip(cfg, (pct) => {
          ui.status.textContent = _t("downloading", { pct });
        });
        state.device = clip.device;
        sourceVec = (
          await _embedImages(clip, [
            await clip.T.RawImage.fromURL(active.image),
          ])
        )[0];
        if (active.text && cfg.textWeight > 0)
          textVec = await _embedText(clip, active.text).catch(() => null);
      }
      const todo = thumbs().filter((src) => !scores.has(src));
      if (todo.length) state.settled = false;
      const pending = _pool(todo, cfg.fetchConcurrency, (src) =>
        clip.T.RawImage.fromURL(src),
      );
      for (let i = 0; i < todo.length && !state.stopped; i += cfg.batchSize) {
        const slice = todo.slice(i, i + cfg.batchSize);
        const loaded = await Promise.all(pending.slice(i, i + cfg.batchSize));
        const ok = slice.filter((_, k) => loaded[k]);
        if (ok.length) {
          const vecs = await _embedImages(clip, loaded.filter(Boolean));
          ok.forEach((src, k) => {
            const sim = _dot(vecs[k], sourceVec);
            scores.set(src, {
              sim,
              score:
                sim + (textVec ? cfg.textWeight * _dot(vecs[k], textVec) : 0),
            });
          });
        }
        for (const src of slice.filter((_, k) => !loaded[k]))
          scores.set(src, { sim: 0, score: -1 });
        api.refresh();
        ui.status.textContent = _t("ranking", {
          device: deviceLabel(),
          done: scores.size,
          total: thumbs().length,
        });
      }
      if (!state.stopped) {
        state.settled = true;
        api.refresh();
        status();
      }
    } catch (err) {
      console.error("[image-search]", err);
      ui.status.textContent = _t("rankFailed");
    } finally {
      state.busy = false;
      if (state.again && !state.stopped) {
        state.again = false;
        void rank();
      }
    }
  };

  state.onResults = () => {
    if (!_isActiveSearch(api, active)) {
      _stopRanker(true);
      return;
    }
    if (thumbs().some((src) => !scores.has(src))) void rank();
  };
  window.addEventListener(RESULTS_EVENT, state.onResults);
  if (thumbs().length) void rank();
};

const _waitForResults = (api, active, fresh, timeout = 20000) =>
  new Promise((resolve) => {
    const ready = () => _isActiveSearch(api, active) && api.list().length > 0;
    if (!fresh && ready()) return resolve(true);
    const onReady = () => {
      if (!ready()) return;
      window.removeEventListener(RESULTS_EVENT, onReady);
      resolve(true);
    };
    window.addEventListener(RESULTS_EVENT, onReady);
    setTimeout(() => {
      window.removeEventListener(RESULTS_EVENT, onReady);
      resolve(ready());
    }, timeout);
  });

const _resume = async ({ fresh = false } = {}) => {
  if (!/\/search\/?$/.test(window.location.pathname)) return;
  const active = _readActive();
  if (!active?.image || !active?.query) return;
  const api = await _resultsApi();
  if (!api || !(await _waitForResults(api, active, fresh))) {
    _clearActive();
    return;
  }
  if (!_ranker) void _startRanker(active);
};

void _resume();
