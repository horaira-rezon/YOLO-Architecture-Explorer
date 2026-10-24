import type { Architecture, Operation } from "../schema";
import { applyOperation } from "../ops/apply";
import { computeArchitecture, type ComputeResult } from "../engine/compute";
import { validate } from "../engine/validate";
import type { AIProvider } from "./provider";
import type { PatchContext } from "./context";
import { PatchSchema, toOperation, type Patch } from "./schema";

export interface OpResult {
  index: number;
  ok: boolean;
  error?: string;
  operation?: Operation;
}

export interface DraftResult {
  draft: Architecture;
  comp: ComputeResult;
  ops: OpResult[];
  /** Graph errors after applying (plain language). */
  errors: string[];
}

/** Apply the chosen patch operations to a copy, op by op, collecting what failed and the graph errors. */
export function applyPatchDraft(arch: Architecture, patch: Patch, selected?: Set<number>, opIdPrefix = "ai"): DraftResult {
  let draft = arch;
  const ops: OpResult[] = [];
  patch.operations.forEach((p, i) => {
    if (selected && !selected.has(i)) return;
    try {
      const operation = toOperation(p);
      draft = applyOperation(draft, operation, { opId: `${opIdPrefix}.${i}`, summary: p.rationaleSimple });
      ops.push({ index: i, ok: true, operation });
    } catch (e) {
      ops.push({ index: i, ok: false, error: (e as Error).message });
    }
  });
  const comp = computeArchitecture(draft);
  const errors = validate(draft, comp).filter((x) => x.severity === "error").map((x) => (x.nodeId ? `node ${x.nodeId}: ${x.message}` : x.message));
  return { draft, comp, ops, errors };
}

export interface LoopResult {
  ok: boolean;
  patch: Patch | null;
  result: DraftResult | null;
  attempts: number;
  /** Problems of the best attempt when not ok. */
  problems: string[];
}

/** Ask for a patch, validate it (schema → apply → graph checks) and ask for repairs up to `maxRepairs` times. */
export async function runPatchLoop(provider: AIProvider, ctx: PatchContext, opts: { maxRepairs?: number; signal?: AbortSignal; onAttempt?(n: number): void } = {}): Promise<LoopResult> {
  const max = opts.maxRepairs ?? 3;
  let best: LoopResult = { ok: false, patch: null, result: null, attempts: 0, problems: ["No answer yet."] };
  let repair: PatchContext["repair"];
  for (let attempt = 1; attempt <= max + 1; attempt++) {
    opts.onAttempt?.(attempt);
    const raw = await provider.generatePatch({ ...ctx, repair }, opts.signal);
    const parsed = PatchSchema.safeParse(raw);
    let problems: string[];
    let current: LoopResult;
    if (!parsed.success) {
      problems = parsed.error.issues.slice(0, 12).map((i) => `${i.path.join(".") || "patch"}: ${i.message}`);
      current = { ok: false, patch: null, result: null, attempts: attempt, problems };
    } else {
      const result = applyPatchDraft(ctx.arch, parsed.data);
      problems = [...result.ops.filter((o) => !o.ok).map((o) => `operation ${o.index} (${parsed.data.operations[o.index]!.op}): ${o.error}`), ...result.errors];
      current = { ok: problems.length === 0, patch: parsed.data, result, attempts: attempt, problems };
    }
    if (current.ok) return current;
    if (!best.patch || (current.patch && current.problems.length < best.problems.length)) best = current;
    repair = { previousPatchJson: JSON.stringify(raw).slice(0, 12000), problems };
  }
  return { ...best, attempts: max + 1 };
}
