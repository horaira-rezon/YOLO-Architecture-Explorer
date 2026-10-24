import { getBlock, type Architecture, type ComputeResult, type PatchOp } from "@yolo-atlas/core";

/** One-line, human-readable title for a patch operation. */
export function describeOp(op: PatchOp, arch: Architecture, comp: ComputeResult | null): string {
  const layer = (id?: string) => {
    if (!id) return "?";
    const n = arch.nodes.find((x) => x.id === id);
    if (!n) return id;
    return `layer ${comp?.nodes[id]?.index ?? "?"} (${getBlock(n.module)?.displayName ?? n.module})`;
  };
  const block = (m?: string) => (m ? getBlock(m)?.displayName ?? m : "?");
  switch (op.op) {
    case "insertNode": return `Insert ${block(op.module)} after ${layer(op.after)}`;
    case "deleteNode": return `Remove ${layer(op.nodeId)}`;
    case "replaceNode": return `Replace ${layer(op.nodeId)} with ${block(op.module)}`;
    case "updateArgs": return `Change the settings of ${layer(op.nodeId)}`;
    case "rewire": return `Change the inputs of ${layer(op.nodeId)}`;
    case "addHeadLevel": return `Add a ${op.level} detection level`;
    case "removeHeadLevel": return `Remove the ${op.level} detection level`;
    case "changeLoss": return "Change the training losses";
    case "changeAssigner": return "Change the label assigner";
    case "changePostprocess": return "Change post-processing";
    case "changeScale": return `Change the model size to ${op.value ?? "?"}`;
    case "changeInputSize": return `Change the input size to ${op.value ?? "?"}`;
    case "changeNc": return `Set the number of classes to ${op.value ?? "?"}`;
    case "changeHead": return `Change the head to ${block(op.module)}`;
  }
}
