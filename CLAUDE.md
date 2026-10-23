# YOLO Atlas — working notes for Claude

Interactive website to learn, edit and AI-modify YOLO architectures (YOLOv8 → YOLO26).

## Commands
- Install: `pnpm install` (pnpm via corepack; binary at `~/.local/bin/pnpm`)
- Dev server: `pnpm dev` (http://localhost:5173)
- All checks before every commit: `pnpm check` (= typecheck + lint + test + content:qa)
- E2E: `pnpm e2e` (Playwright, uses MockProvider; run `pnpm --filter @yolo-atlas/web exec playwright install chromium` once)
- Ground truth: `.cache-tools/venv-ul/bin/python tools/extract_ground_truth.py --all` (see README)

## Layout
- `packages/core` — pure TypeScript domain logic. **No React / DOM imports** (lint enforces).
  - `src/schema/` Zod schemas (Architecture, Node, Operation, Patch). Types are `z.infer`.
  - `src/blocks/` block registry. Each block = `BlockDefinition` with a `build()` that emits primitives
    (Conv2d/BN/act/Linear/...) — params, FLOPs and the L2/L3 internals all come from that one description.
  - `src/compiler/` Ultralytics `parse_model` port (YAML → graph) and exporter (graph → YAML).
  - `src/engine/` shape/params/FLOPs inference + validation.
  - `src/ops/` Operation pipeline: apply → recompute → renumber → rewrite `from` → validate. Every edit
    (manual or AI) goes through it.
  - `src/ai/` providers, prompts (versioned files), patch loop.
  - `content/` explanation data (JSON). Never hard-code explanation text in components.
  - `fixtures/` ground-truth JSON exported from real Ultralytics models. Never hand-edit.
- `apps/web` — Vite + React 18 UI (React Flow canvas, Zustand store, Tailwind + Radix).
- `apps/proxy` — optional Hono AI proxy reading keys from `.env`.
- `tools/` — Python extraction script.

## Rules
- Never invent architecture facts. Data comes from fixtures/official YAML; unverifiable → `confidence: "draft"`.
- User-facing text: simple words; three reading levels (`eli5`, `simple`, `engineer`).
- Never claim measured accuracy gains; label speed/size numbers as estimates.
- No `any` without a comment. Do not loosen fixture tolerances (shapes exact, params ≤1%).
- Record every non-obvious choice in `DECISIONS.md`.
- Git repo root is this folder (the home dir is also a git repo — never commit there).
