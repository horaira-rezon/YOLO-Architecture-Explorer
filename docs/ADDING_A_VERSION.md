# Adding a YOLO version

1. **Find the official configs.** Prefer the mainline `ultralytics` package. If the version lives in its own repository (as YOLOv13 does), clone that repo at a fixed commit. Never write layers from memory or from a figure.
2. **Extract ground truth.** Add the version to the `VERSIONS` table in `tools/extract_ground_truth.py` (YAML path per task, scale letters) and run it (see the README). This writes `packages/core/fixtures/<version>/<task>-<scale>.json`.
3. **Run the tests.** `pnpm --filter @yolo-atlas/core test`. New blocks show up as failures in `fixtures.test.ts` (shapes, params, FLOPs per layer) and `internals.test.ts` (sub-module tree).
4. **Model new blocks.** Read the module source, mirror it in `packages/core/src/blocks/modules.ts` and register it (see "A new block" in the README). If the version's code base changes `parse_model` rules (YOLOv13 does), add a `codebase` value and branch on it in `src/engine/compute.ts`; record why in `DECISIONS.md`.
5. **Build the data bundle.** `pnpm --filter @yolo-atlas/core data:build`.
6. **Catalogue entry.** Add the version to `packages/core/src/catalog.ts`: release date, authors/org, the big idea in three reading levels, key blocks, training-only parts, supported tasks (with a reason for each unsupported one), scales, sources and notes. Use only facts from the official docs/paper/repo, and cite them in `sources`.
7. **Content.** Write `content/blocks/<Id>.json` for every new block and inner part; `pnpm content:qa` lists what is missing. Training-only items (losses, assigners, extras) go in `content/items/`.
8. **Check links.** `pnpm --filter @yolo-atlas/core links:check`.
9. **If something cannot be verified** (no public config, code that does not run), set `confidence: "draft"` in the catalogue with a note explaining why. The UI then shows an "unverified" badge and banner. Do not guess layers.
