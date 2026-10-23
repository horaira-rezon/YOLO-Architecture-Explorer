import type { Task } from "./schema";

/** Per-version bundle generated from fixtures by scripts/build-model-data.ts. */
export interface ModelVariant {
  modelName: string;
  /** Official YAML text. Several scales can share one YAML (`scales:` block). */
  yamlText: string;
  yamlSha256: string;
  source: { repo: string; file: string; package: string; packageVersion: string; commit: string | null };
  retrievedAt: string;
  inputSize: number;
  /** Totals measured from the real PyTorch model. */
  measured: { params: number; gflops: number; layers: number };
}

export interface ModelData {
  version: string;
  tasks: Partial<Record<Task, { variants: Record<string, ModelVariant> }>>;
}
