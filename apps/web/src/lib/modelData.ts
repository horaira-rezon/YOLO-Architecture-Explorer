import { compileYaml, getVersion, type Architecture, type ModelData, type Task } from "@yolo-atlas/core";

const loaders = import.meta.glob<{ default: ModelData }>("../../../../packages/core/data/models/*.json");

const cache = new Map<string, Promise<ModelData>>();

export function loadModelData(version: string): Promise<ModelData> {
  let p = cache.get(version);
  if (!p) {
    const key = Object.keys(loaders).find((k) => k.endsWith(`/${version}.json`));
    if (!key) return Promise.reject(new Error(`No data for version ${version}`));
    p = loaders[key]!().then((m) => m.default);
    cache.set(version, p);
  }
  return p;
}

export async function loadArchitecture(version: string, task: Task, scale?: string): Promise<{ arch: Architecture; scale: string; scales: string[] }> {
  const data = await loadModelData(version);
  const t = data.tasks[task];
  if (!t) throw new Error(`${getVersion(version)?.label ?? version} has no ${task} model.`);
  const scales = Object.keys(t.variants);
  const info = getVersion(version);
  const order = info?.scales ?? scales;
  scales.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const chosen = scale && t.variants[scale] ? scale : scales.includes(info?.defaultScale ?? "") ? info!.defaultScale : scales[0]!;
  const v = t.variants[chosen]!;
  const hasScales = /^scales:/m.test(v.yamlText);
  const arch = compileYaml(v.yamlText, {
    version, task, scale: hasScales ? chosen : null, inputSize: v.inputSize,
    id: `${version}-${task}-${chosen}`,
    meta: {
      source: { ...v.source },
      confidence: info?.confidence ?? "draft",
      retrievedAt: v.retrievedAt,
      notes: [],
    },
  });
  return { arch, scale: chosen, scales };
}
