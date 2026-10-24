/**
 * Lab palette extras: well-known blocks from the literature that are not in the official YOLO configs.
 * Shapes and parameter counts follow the PyTorch stubs in `src/export/stubs.ts`; FLOPs follow thop's rules
 * where a module rule exists (deformable conv sampling is an estimate and labelled as such).
 */
import { Builder, type Ref, autopad } from "./builder";

/** Squeeze-and-Excitation: global pool → 1×1 (c → c/r) → ReLU → 1×1 (c/r → c) → sigmoid → scale. */
export function SE(b: Builder, name: string, x: Ref, r = 16): Ref {
  return b.group(name, "SE", [x], (m, [i]) => {
    const c = i!.shape[0]!;
    const h = Math.max(c / r, 8) | 0;
    const p = m.adaptiveAvgPool("pool", i!);
    const z = m.act("act", m.conv2d("fc1", p, { c2: h, k: 1, bias: true }), "ReLU");
    const g = m.act("gate", m.conv2d("fc2", z, { c2: c, k: 1, bias: true }), "Sigmoid");
    return m.elementwise("scale", "mul", [i!, g], i!.shape);
  }, { attrs: { r } });
}

/** ECA: global pool → 1-D conv across channels (kernel k) → sigmoid → scale. */
export function ECA(b: Builder, name: string, x: Ref, k = 3): Ref {
  return b.group(name, "ECA", [x], (m, [i]) => {
    const c = i!.shape[0]!;
    const p = m.adaptiveAvgPool("pool", i!);
    const conv = m.prim("conv", "Conv1d", [p], [c, 1, 1], k, c * k, { k });
    const g = m.act("gate", conv, "Sigmoid");
    return m.elementwise("scale", "mul", [i!, g], i!.shape);
  }, { attrs: { k } });
}

/** Ultralytics CBAM (conv.py): channel attention (pool → 1×1 → sigmoid) then spatial attention (7×7 on mean/max). */
export function CBAM(b: Builder, name: string, x: Ref, k = 7): Ref {
  return b.group(name, "CBAM", [x], (m, [i]) => {
    const c = i!.shape[0]!;
    const ca = m.group("channel_attention", "ChannelAttention", [i!], (q, [xi]) => {
      const g = q.act("act", q.conv2d("fc", q.adaptiveAvgPool("pool", xi!), { c2: c, k: 1, bias: true }), "Sigmoid");
      return q.elementwise("scale", "mul", [xi!, g], xi!.shape);
    });
    return m.group("spatial_attention", "SpatialAttention", [ca], (q, [xi]) => {
      const [, H, W] = xi!.shape as [number, number, number];
      const mm = q.reshape("mean·max", xi!, [2, H, W], "mean+max");
      const g = q.act("act", q.conv2d("cv1", mm, { c2: 1, k, p: k === 7 ? 3 : 1 }), "Sigmoid");
      return q.elementwise("scale", "mul", [xi!, g], xi!.shape);
    });
  }, { attrs: { k } });
}

/** Coordinate attention: pool along H and W separately, shared 1×1, then per-direction gates. */
export function CoordAtt(b: Builder, name: string, x: Ref, r = 32): Ref {
  return b.group(name, "CoordAtt", [x], (m, [i]) => {
    const [c, H, W] = i!.shape as [number, number, number];
    const mip = Math.max(8, Math.floor(c / r));
    const ph = m.prim("pool_h", "AdaptiveAvgPool2d", [i!], [c, H, 1], 0, c * H * W + c * H);
    const pw = m.prim("pool_w", "AdaptiveAvgPool2d", [i!], [c, 1, W], 0, c * H * W + c * W);
    const y = m.concat("cat", [ph, m.reshape("pool_w_t", pw, [c, W, 1], "permute")], 1);
    const z = m.act("act", m.bn("bn1", m.conv2d("conv1", y, { c2: mip, k: 1, bias: true })), "Hardswish");
    const [zh, zw] = m.split("split", z, [H, W], 1) as [Ref, Ref];
    const ah = m.act("sig_h", m.conv2d("conv_h", zh, { c2: c, k: 1, bias: true }), "Sigmoid");
    const aw = m.act("sig_w", m.conv2d("conv_w", m.reshape("zw_t", zw, [mip, 1, W], "permute"), { c2: c, k: 1, bias: true }), "Sigmoid");
    return m.elementwise("scale", "mul", [i!, ah, aw], i!.shape);
  }, { attrs: { r } });
}

/** SimAM: parameter-free attention from an energy function (all elementwise). */
export function SimAM(b: Builder, name: string, x: Ref): Ref {
  return b.group(name, "SimAM", [x], (m, [i]) => {
    const e = m.elementwise("energy", "energy", [i!], i!.shape);
    const g = m.act("act", e, "Sigmoid");
    return m.elementwise("scale", "mul", [i!, g], i!.shape);
  });
}

/** BiFPN-style fast normalised fusion: Σ w_i·x_i / (Σ w_i + ε), one learnable weight per input. */
export function WeightedAdd(b: Builder, name: string, xs: Ref[]): Ref {
  return b.group(name, "WeightedAdd", xs, (m, ins) => {
    m.param("w", ins.length);
    for (const v of ins.slice(1)) if (v.shape.join() !== ins[0]!.shape.join()) throw new Error(`cannot add ${ins[0]!.shape.join("×")} and ${v.shape.join("×")}`);
    return m.elementwise("weighted_sum", "weighted sum", ins, ins[0]!.shape);
  });
}

/** DCNv2-style deformable Conv: offset/mask conv + torchvision deform_conv2d + BN + SiLU. */
export function DeformConv(b: Builder, name: string, x: Ref, c2: number, k = 3, s = 1): Ref {
  return b.group(name, "DeformConv", [x], (m, [i]) => {
    const c1 = i!.shape[0]!;
    const p = autopad(k, null);
    const off = m.conv2d("offset", i!, { c2: 3 * k * k, k, s, p, bias: true });
    const [, oh, ow] = off.shape as [number, number, number];
    // sampling + weighted sum; counted like a dense k×k conv (estimate, torchvision op is functional)
    const d = m.prim("deform_conv2d", "deform_conv2d", [i!, off], [c2, oh, ow], c2 * c1 * k * k, oh * ow * c2 * c1 * k * k, { c1, c2, k, s, estimate: true });
    return m.act("act", m.bn("bn", d), "SiLU");
  }, { attrs: { c2, k, s } });
}

