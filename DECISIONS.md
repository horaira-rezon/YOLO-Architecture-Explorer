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
