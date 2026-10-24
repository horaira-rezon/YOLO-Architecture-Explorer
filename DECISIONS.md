# Decisions

Each entry: what we chose, and why. Newest at the bottom.

## D1 — Separate git repo in the project folder
The user's home directory is itself a git repository. We run `git init` inside the project so commits never land in the home-dir repo.

## D2 — pnpm via corepack, pinned
`pnpm` was not installed. Enabled with corepack (`pnpm@12.15.0`, pinned in `packageManager`). pnpm 12 enforces a minimum release age; we pin dependencies to versions older than the cutoff (e.g. immer 11.1.18 instead of a day-old 11.2.9) rather than excluding them from the policy.

## D3 — TypeScript 5.9, not 7
TypeScript 7 (native port) is the newest, but `typescript-eslint` supports `<6.1`. We use 5.9.3 for a working lint pipeline.

## D4 — Vite 8 / Vitest 5 / React 18.3
Spec asks for React 18. Vite 8 + `@vitejs/plugin-react` 6 support it. Vitest 5 shares Vite's config.

## D5 — Core consumed as TypeScript source
`@yolo-atlas/core` exports `src/index.ts` directly (no build step). Vite, Vitest and tsx all compile TS, so there is one source of truth and no stale `dist`.

## D6 — Ground truth from real packages
- Mainline versions (v8, v9, v10, 11, 12, 26) come from `ultralytics==8.4.184` installed in a project-local venv (`.cache-tools/venv-ul`, git-ignored, `--system-site-packages` to reuse the installed torch).
- YOLOv13 is not in mainline. Its official repo `iMoonLab/yolov13` is an Ultralytics fork; we clone it (commit recorded in fixtures) and run the same extractor with that repo on `PYTHONPATH`.

## D7 — Colour-blind-safe stage palette
Okabe–Ito hues: input grey, backbone blue, neck bluish-green, head orange, loss reddish-purple, post-processing vermillion. Every stage also has an icon and a band pattern so colour is never the only signal.

## D8 — Own command stack instead of zundo
Every edit is already an `Operation` with an inverse snapshot, so undo/redo is a stack of (forward ops, previous graph) entries. This gives grouped undo for AI patches for free; zundo would duplicate it.

## D9 — What the fixtures contain and how we compare
- One forward pass on a blank image: 640×640 for detect/segment/pose/obb, **224×224 for classify** (the size Ultralytics uses for its classification models and their published GFLOPs).
- Per layer: output shape (forward hook), parameters (`sum(p.numel())`, including the frozen DFL weights, like `model.info()`), FLOPs from `thop.profile(ret_layer_info=True)` at full size, and the PyTorch sub-module tree.
- thop counts functional matrix products (attention `q @ k`) globally, not per layer. The engine tracks them separately (`functionalFlops`): per-layer tests compare without them, the total compares with them.
- Tests are strict: shapes exact, **per-layer** params exact (stronger than the required 1% total), per-layer FLOPs exact, total GFLOPs within 1%.

## D10 — Edges are derived from `from`
A node's `from` list is the single source of truth for connections (exactly like the YAML). Edges for drawing are derived. This removes a whole class of "edge list and from list disagree" bugs.

## D11 — Engine mirrors module construction
Each block is a TypeScript function that mirrors the Ultralytics PyTorch module (same sub-module names and order). Shapes, params, FLOPs and the zoomed-in L2/L3 graphs all come from that one description, and the fixtures check it layer by layer.

## D12 — Licence of bundled configs
Model YAMLs are copied verbatim from Ultralytics (AGPL-3.0) and iMoonLab/yolov13 (AGPL-3.0, an Ultralytics fork) inside the fixtures, with source file, package version/commit and SHA-256 recorded. The project therefore ships under AGPL-3.0.

## D13 — Default diagram layout: "classic" rows by map size
A plain layered layout (ELK) draws YOLO as one very tall column, because the network is mostly a single chain. The default layout instead puts one row per feature-map size: the backbone runs down the first column, the neck's top-down (FPN) and bottom-up (PAN) passes get their own columns with each node in the row of its map size, heads sit to the right, then post-processing and a dashed training-only lane. This is the picture learners meet in papers. ELK (in a web worker, with stage partitions) remains as the "automatic flow" layout for unusual edited graphs.

## D14 — YOLO27 is listed, not modelled
Ultralytics announced YOLO27 (2026) but has not published configs, weights or code. It appears on the timeline as "announced, not released" with no explorable architecture, rather than being guessed.

## D15 — YOLO26 extra tasks
YOLO26 also ships semantic-segmentation and depth configs. The brief covers five tasks, so these are mentioned in the catalogue but not modelled.

## D16 — Block internals open as a drill-down view
L2/L3 (block parts, primitive operations) open as a separate canvas for the chosen layer, with breadcrumbs, instead of growing the block in place. Growing a block in the classic layout would push every row apart; a drill-down keeps both views readable and is how map apps handle "zoom into a place". Automatic semantic zoom: wheel/pinch far out → L0 stages; far in on a block → L2; far out of a block → L1. It only reacts to the user's own wheel/pinch and can be switched off ("auto").

## D17 — Playwright runs its own Vite server on port 5174
So E2E runs never collide with a dev server the user has open on 5173.

## D18 — "Codebase" for parse_model rules (YOLOv13)
The YOLOv13 fork's `parse_model` differs from mainline Ultralytics 8.4: A2C2f gets `mlp_ratio = 1.5` (mainline 1.2) for l/x, C3k2/DSC3k2 switch only for l/x, Detect has no reg_max/end2end args, and HyperACE/DownsampleConv/FullPAD_Tunnel have their own rules. `config.codebase` ("ultralytics" | "yolov13") selects the rules; it is inferred from fork-only modules when a YAML is imported. All four YOLOv13 fixtures match exactly.

## D19 — Training lane is version-specific and sourced from code
Loss names/gains come from `ultralytics/utils/loss.py` + `cfg/default.yaml` (8.4.x): BCE 0.5, CIoU 7.5, DFL 1.5 — or L1 1.5 when reg_max = 1 (YOLO26). YOLO26 adds RLE (pose), angle (OBB) and semantic (seg) losses, STAL in the assigner, Progressive Loss (o2m weight 0.8 → 0.1, `E2ELoss.decay`) and MuSGD. YOLOv9's PGI is shown as "paper only": the Ultralytics configs have no auxiliary branch.

## D20 — YOLO26 post-processing default
The YAML sets `end2end: True`, so the diagram shows the NMS-free one-to-one path. The catalogue note quotes the docs: both heads are trained and the one-to-many + NMS path is also available.

## D21 — Content QA covers everything a learner can click
Besides blocks in shipped YAMLs, QA builds every shipped model and requires content for every sub-block and operation that appears at L2/L3, and for every loss, assigner and training extra.

## D22 — Lab history is a snapshot stack
Each Lab action applies one or more Operations through the core pipeline and pushes the previous architecture onto the undo stack (max 500). A group of operations (an AI patch, a multi-delete) is one entry, so it undoes as one step. Autosave writes the current Lab model to IndexedDB (debounced); named snapshots live there too.

## D23 — Groups are visual; templates make them reusable
"Group" draws a named box around blocks without changing the exported YAML (Ultralytics has no notion of user composite modules without code). "Save as template" stores the selected blocks as a reusable snippet in IndexedDB that can be pasted into any model. Generating a real composite nn.Module from an arbitrary subgraph is left out on purpose: it would need custom parse_model rules per group.

## D24 — Lab extras export as stubs + parse_model edits
Extras not in Ultralytics (SE, ECA, CoordAtt, SimAM, WeightedAdd, DeformConv) export as `custom_blocks.py` (valid nn.Module code, checked in PyTorch) plus the exact `parse_model` lines. Attention extras keep channels, so their YAML rows have no channel argument and the edit prepends `ch[f]`. CBAM exists in Ultralytics and only needs the edit. RepConv is not offered in the palette because Ultralytics cannot build it from a YAML row.

## D25 — Speed is never estimated
The Lab shows parameters, GFLOPs and weight size (FP32/FP16), with deltas. It never shows FPS or latency: those depend on hardware, runtime and post-processing and must be measured.

## D26 — Flat patch schema
The AI returns operations in one flat object type (block args as a JSON string, other values in `value`), because structured-output modes reject deep/recursive schemas (Gemini docs: "very large or deeply nested schemas may be rejected"). `toOperation` converts each to a core Operation through the same Zod schema as manual edits, with error messages written so the model can repair them. Loop: Zod → apply to a draft → validate → send problems back, up to 3 repairs; the best partial result stays visible.

## D27 — Gemini default model
Checked https://ai.google.dev/gemini-api/docs/models and /pricing on 2026-10-24: `gemini-3.5-flash-lite` ("fastest, most cost-effective", free tier) is the default; `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.1-flash-lite`, `gemini-2.5-flash` are offered. The free tier's "Used to improve our products: Yes" is shown in Settings. The SDK (`@google/genai` 2.29, pinned older than the newest) is loaded only when a Gemini request is made; its install scripts are not allowed to run (not needed).

## D28 — Keys never in the bundle
Keys come only from the Settings form (localStorage, with a warning) or the proxy's `.env`. There is deliberately no `VITE_*` key variable, so a deployed build can never contain a key.

## D29 — MockProvider is honest about being a demo
The offline provider builds patches from keyword rules (nc from the goal, CBAM + P2 for tiny objects, GhostConv for edge devices) and labels itself "Offline demo (no AI)" everywhere. It powers tests and E2E and lets the whole flow work without a network.

## D30 — Goal explanations: three layers, cached, with staleness
The panel stacks (1) authored block content, (2) computed positional text and (3) AI goal context, and labels (3) "AI-generated · not verified". Goal context is cached in IndexedDB under hash(goal, reading level, provider/model, prompt version) per node, together with a signature of the node and its inputs/consumers (module, args, shapes). When the signature changes the explanation shows "out of date" with an Update button. Generation is lazy on click (node + up to 5 neighbours, so neighbours also get refreshed) or a background job over all layers in batches of 12 with progress and cancel; fresh entries are skipped.

## D31 — Band titles and edge labels never cover each other
Every stage band reserves a title strip at its top (no node sits in it, side lanes route below it), shows a short title on an opaque chip ("Inference only", "Training only"; full name in the tooltip and legend), and the input band is spaced away from the backbone band. Edge size labels are placed by a small search (beside vertical segments, above horizontal ones, several spots along the longest segments) that avoids nodes, titles and other labels. A link too short for any free spot gets no permanent label; it appears while the edge is highlighted, and the source card shows the same shape.

## D32 — AI Architect example preset
At the user's request the one-click example is "small road cracks and potholes in dashcam frames on a CPU-only Raspberry Pi 5, 3 classes" instead of weed detection from drones. It still exercises the same ideas (small objects, a low-power device, a custom class count).

## D33 — Logo
One SVG (`apps/web/public/favicon.svg`) is both the favicon and the header logo: detection-box corner brackets around a three-level feature pyramid, on the app's blue. It stays legible at 16 px.

## D34 — Portable response schema + plain-JSON fallback for Gemini
A real Gemini call returned 400 INVALID_ARGUMENT. The schema sent as `responseJsonSchema` contained keywords from Zod's JSON Schema export that structured-output validators reject, notably `maximum: 9007199254740991` on integers, plus `minLength`/`maxItems`/`additionalProperties`. The schema sent to providers now keeps only `type`, `properties`, `required`, `items`, `enum`, `description`; full validation still happens locally with Zod. If a model still answers 400 to a response schema, the Gemini client retries once in plain JSON mode with the schema in the system prompt, and keeps that mode for the session.

## D35 — GitHub Pages as a second address
Some networks cannot reach the Vercel server range that `*.vercel.app` currently resolves to (64.29.17.x / 216.198.79.x), while GitHub Pages is reachable. The app therefore also deploys to GitHub Pages from a workflow. Because Pages serves it under `/<repo>/`, the base path is configurable (`BASE_PATH` → Vite `base`, router `basename`, favicon via `%BASE_URL%`); `404.html` is a copy of `index.html` so deep links open the app.
