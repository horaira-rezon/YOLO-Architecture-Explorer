# YOLO Atlas

An interactive website to **learn, edit and AI-modify YOLO architectures** — YOLOv8, YOLOv9, YOLOv10, YOLO11, YOLO12, YOLOv13 and YOLO26 — in simple words.

- **Explore** any version and task as a diagram: stages, numbered layers (same numbers as the Ultralytics YAML), feature-map sizes on every arrow. Zoom from stages (L0) to layers (L1), block parts (L2), single operations (L3) and code/math (L4). Click anything for an explanation at three reading levels: *Like I'm 5*, *Simple*, *Engineer*.
- **Lab**: add, delete, rewire and replace blocks, add a P2 small-object level, change the head, losses or post-processing — with live validation, parameter/GFLOP counts, undo, snapshots, a change view, YAML import and export (YAML, JSON, PNG/SVG, Markdown change report, PyTorch stubs, training script).
- **AI Architect**: describe your goal (for example "detect small road cracks in dashcam frames, must run on a Raspberry Pi, 3 classes") and get a *patch* — a short list of changes, each with a plain-language reason, the trade-off and the risk. Accept or reject each change. Afterwards every block explains how it helps your goal.

Nothing about the architectures is written from memory: every model comes from the official config files and is checked layer by layer against the real PyTorch model (see [Ground truth](#ground-truth)).

## Quick start

Requirements: Node 20+ and pnpm (via corepack).

```bash
corepack enable
pnpm install
pnpm dev            # http://localhost:5173
```

| Command | What it does |
|---|---|
| `pnpm dev` | Web app with hot reload |
| `pnpm build` | Production build in `apps/web/dist` |
| `pnpm check` | Typecheck + lint + unit tests + content QA (run before every commit) |
| `pnpm e2e` | Playwright end-to-end tests (first time: `pnpm --filter @yolo-atlas/web exec playwright install chromium`) |
| `pnpm content:qa` | Checks every explanation: three reading levels, length limits, no jargon in "Like I'm 5", content for every block/operation/loss |
| `pnpm --filter @yolo-atlas/core links:check` | Checks every source link (needs network) |
| `pnpm --filter @yolo-atlas/core data:build` | Rebuilds `packages/core/data/models/*.json` from the fixtures |
| `pnpm --filter @yolo-atlas/proxy start` | Optional AI proxy (reads keys from `.env`) |

## Project layout

```
apps/web         React 18 + Vite + Tailwind + Radix; React Flow canvas; Zustand store
apps/proxy       Optional Hono server that adds AI keys from .env (keys never reach the browser)
packages/core    Pure TypeScript (no React): schemas, block registry, parse_model port, engine,
                 operations, validation, diff, AI providers/prompts/patch loop, exports
  content/       All explanation text as JSON (blocks, items, glossary, templates, stages, tour)
  fixtures/      Ground truth exported from the real PyTorch models (never edit by hand)
  data/models/   Small per-version bundles generated from the fixtures (official YAML + provenance)
tools/           extract_ground_truth.py
docs/            ADDING_A_VERSION.md
```

Design decisions and the reasons for them are in [DECISIONS.md](DECISIONS.md).

## Ground truth

`tools/extract_ground_truth.py` builds every official model with the real Ultralytics code, runs one forward pass and records, per layer: output shape (forward hooks), parameters, FLOPs (thop, the counter Ultralytics uses) and the full PyTorch sub-module tree. Tests then require the TypeScript engine to reproduce **every layer's shape, parameter count and FLOPs exactly**, and every block's internal parts (path, type, parameters) to match the PyTorch module tree.

```bash
python3 -m venv --system-site-packages .cache-tools/venv-ul      # reuses an installed torch
.cache-tools/venv-ul/bin/pip install "ultralytics==8.4.184"
.cache-tools/venv-ul/bin/python tools/extract_ground_truth.py --all

# YOLOv13 lives in its official repository (an Ultralytics fork):
git clone https://github.com/iMoonLab/yolov13 .cache-tools/ext/yolov13
PYTHONPATH=.cache-tools/ext/yolov13 .cache-tools/venv-ul/bin/python tools/extract_ground_truth.py \
  --version 13 --source-repo https://github.com/iMoonLab/yolov13 --source-dir .cache-tools/ext/yolov13

pnpm --filter @yolo-atlas/core data:build
pnpm test
```

Detection, segmentation, pose and OBB are measured at 640×640; classification at 224×224 (Ultralytics' default for classifiers).

## Adding things

- **A new YOLO version**: see [docs/ADDING_A_VERSION.md](docs/ADDING_A_VERSION.md).
- **A new block**:
  1. Mirror the PyTorch module in `packages/core/src/blocks/modules.ts` (or `extras.ts` for Lab-only blocks) using the `Builder` calls, with the same sub-module names as PyTorch.
  2. Register it in `packages/core/src/blocks/registry.ts` with its `parse` rule (how `parse_model` computes channels) and its YAML argument list.
  3. Write `packages/core/content/blocks/<Id>.json` (three reading levels; Lab extras also need a `costNote`).
  4. For Lab extras, add the PyTorch class and parse rule to `packages/core/src/export/stubs.ts` and check it in PyTorch.
  5. `pnpm check` — content QA fails until every level and section is written.
- **A new AI provider**: implement `LLMClient` (`complete({ system, user, json })`) in `packages/core/src/ai/clients.ts`, wrap it in `LLMProvider` (prompts, JSON parsing and the patch loop are shared), and add it to `apps/web/src/lib/ai.ts` and the Settings page. Prompts are versioned files in `packages/core/src/ai/prompts/`; bump the version when you change one (it is part of the cache key).

## AI providers and privacy

Settings → AI provider: *Offline demo* (default, rule-based, no network), **Google Gemini** with your own key (default model `gemini-3.5-flash-lite`; model names checked against Google's docs on 2026-10-24), any **OpenAI-compatible** server (OpenRouter, Groq, local Ollama), the **proxy**, or **Anthropic** (experimental).

- Only text is sent: the architecture table, your goal and your questions. Images and datasets are never uploaded.
- On Google's free tier, content may be used to improve Google's products (paid tier: not used). Check the provider's current terms.
- Keys typed into Settings stay in this browser's localStorage. For a deployed site use the proxy: copy `.env.example` to `.env`, fill the keys, run `pnpm --filter @yolo-atlas/proxy start`, and choose *Your own proxy* in Settings. There is deliberately no build-time key variable, so a key can never end up in the bundle.
- Every AI suggestion is labelled a **hypothesis**. The app never claims accuracy gains; it suggests an ablation order instead.

## Deploy

The web app is static. Build with `pnpm build` and serve `apps/web/dist` with a single-page-app fallback to `index.html`:

- **Netlify**: `netlify.toml` is included.
- **Vercel**: `vercel.json` is included.
- **GitHub Pages / any static host**: copy `dist/index.html` to `dist/404.html` after the build (the router handles the URL).

The optional proxy is a small Node server (`apps/proxy`); run it next to the site and set `PROXY_ALLOWED_ORIGINS` to the site's origin.

## What is verified

| Version | Tasks | Sizes | Status |
|---|---|---|---|
| YOLOv8 | detect, segment, pose, classify, OBB | n s m l x | verified (Ultralytics 8.4.184) |
| YOLOv9 | detect (t s m c e), segment (c e) | | verified |
| YOLOv10 | detect | n s m b l x | verified |
| YOLO11 | detect, segment, pose, classify, OBB | n s m l x | verified |
| YOLO12 | detect, segment, pose, classify, OBB | n s m l x | verified (configs; Ultralytics publishes weights for detect only) |
| YOLOv13 | detect | n s l x | verified (official repo iMoonLab/yolov13 @ 73289949) |
| YOLO26 | detect, segment, pose, classify, OBB | n s m l x | verified |
| YOLO27 | — | — | announced, not released: listed, nothing to explore |

"Verified" means all 117 models reproduce the real PyTorch model layer by layer (shapes, parameters, FLOPs, sub-modules).

## Licence

AGPL-3.0 — the bundled model configs come from Ultralytics and iMoonLab/yolov13, both AGPL-3.0.
