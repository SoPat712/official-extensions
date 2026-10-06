# Image search

Search with a picture. Drop, paste or pick one in the search bar, type a few words next to it if you like, and press Enter.

## How it works

The browser sends the picture to this server, and the server hands it to your vision model. The model writes one short search query. The server keeps no copy of the picture and never sends it to a search engine.

degoog then runs that query as a normal Images search, so your engines, POST search, language, image filters, cache and indexer all apply.

Once results arrive, the visitor's browser compares each one with the picture using a CLIP model. Results that don't look like it move to the end. You can hide them instead, or leave degoog's order alone. Exact copies get a "Same image" badge, and results that load as you scroll get ranked too.

## Where your data goes

| Data                     | Path                                                                      | Kept                                                    |
| ------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| The picture              | browser, then this server, then the vision model URL in settings          | In the visitor's tab, in `sessionStorage`, until it closes |
| The generated query      | browser, then degoog search, then your engines                            | Like any other search                                   |
| Result thumbnails        | engines, then degoog's image proxy, then the browser                      | Like any other search                                   |
| Ranking model and runtime | this server downloads them once, browsers load them from this instance    | In `data/cache/image-search/`                           |

If the vision model URL points at a hosted provider, that provider gets the picture.

The server downloads two things, once:

- `@huggingface/transformers` and `onnxruntime-web`, from the runtime download host. That's `cdn.jsdelivr.net/npm` unless you change it. The server checks each file in Runtime checksums against its SHA-256 and refuses any that don't match.
- The ranking model, from the model download host, at the revision you set. Hugging Face by default.

Browsers never contact either host. Every time you save settings, the server logs the model, revision and runtime versions it picked.

## Settings

Every setting has a default, and most people only change the vision model URL and model. Advanced settings stay hidden until you show them.

### Vision model

This is the model that turns the picture into a query.

| Setting                            | Default                  | What it does                                                                                  |
| ---------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| Vision model URL                   | `http://localhost:11434` | Ollama, llama.cpp, LM Studio, vLLM or any OpenAI-compatible server.                           |
| Provider                           | Detect automatically     | Leave it on detect, or pick one.                                                              |
| Model                              | `qwen3.5:4b`             | Any model that takes images. Fetch models lists what the server has.                          |
| API key                            | None                     | Only if your server wants one.                                                                |
| Prompt                             | Built in                 | Advanced. Goes out with every picture. Keep the sentence asking for a JSON `query` field.     |
| Prompt when the visitor adds words | Built in                 | Advanced. Added when someone types words next to the picture. `{text}` becomes those words.   |
| Timeout in seconds                 | 60                       | Advanced.                                                                                     |
| Largest image accepted, in MB      | 6                        | Advanced.                                                                                     |
| Resize uploads to this many pixels | 768                      | Advanced. The browser shrinks the longest side to this before sending.                        |
| Images described at once           | 2                        | Advanced. Past this, the server tells new uploads to try again.                               |

### Ranking

Ranking runs in the visitor's browser.

| Setting                                | Default                                  | What it does                                                                                    |
| -------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Ranking model                          | `Xenova/clip-vit-base-patch32`           | Any CLIP model in transformers.js ONNX format. Find models searches the model download host.    |
| Ranking model revision                 | A pinned commit of the default model     | A branch, tag or commit. Leave it blank, or change the model, to get the latest commit on `main`. |
| Results that don't look like the image | Move to the end                          | Move them to the end, hide them or leave them where they are.                                   |
| Match threshold, in percent            | 75                                       | Below this similarity a result counts as not matching.                                          |
| Same image threshold, in percent       | 95                                       | Advanced. From this similarity up, a result gets the "Same image" badge.                        |
| Weight of typed words                  | 2                                        | Advanced. How much the typed words count when ordering. 0 ignores them.                         |
| Run on                                 | WebGPU if available, otherwise WebAssembly | Advanced. Or force one.                                                                       |
| WebGPU precision                       | fp16                                     | Advanced. The model needs the matching file, such as `onnx/vision_model_fp16.onnx`.             |
| WebAssembly precision                  | q8                                       | Advanced. For example `onnx/vision_model_quantized.onnx`.                                       |
| Images ranked per batch                | 8                                        | Advanced.                                                                                       |
| Thumbnails fetched at once             | 12                                       | Advanced.                                                                                       |
| Ranking model download host            | `https://huggingface.co`                 | Advanced. Any host with the Hugging Face layout, a mirror for example.                          |

### Ranking runtime

All advanced.

| Setting                 | Default                        | What it does                                                         |
| ----------------------- | ------------------------------ | -------------------------------------------------------------------- |
| Runtime download host   | `https://cdn.jsdelivr.net/npm` | Any npm CDN that serves `package@version/path`, `unpkg.com` too.     |
| transformers.js version | `4.3.0`                        |                                                                      |
| onnxruntime-web version | Blank                          | Blank means the version transformers.js depends on.                  |
| Runtime checksums       | SHA-256 of the default files   | One `file sha256` per line. Update or clear them when versions change. |

The ranking model uses WebGPU when the browser has it and WebAssembly when it doesn't. The first search downloads the model from this server, about 170 MB for the default one, and the browser caches it after that. The results page starts loading the model as soon as it opens, while the search is still running, and shows each step until ranking starts.

## Translations

The plugin ships English and Italian in `locales/`. To add a language, copy `locales/en.json` to `locales/<code>.json` and translate the values. Keep the keys and anything in curly braces, like `{count}`, as they are.
