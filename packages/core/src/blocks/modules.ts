/**
 * TypeScript mirrors of the Ultralytics PyTorch modules (ultralytics/nn/modules/*.py, v8.4.x).
 * Each function records the same sub-modules, in the same order and with the same names, as the Python
 * constructor + forward pass. Keep them literal: fixtures check params, FLOPs and shapes layer by layer.
 */
import { Builder, type Ref, autopad } from "./builder";

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

// ------------------------------------------------------------------ conv.py

export function Conv(
  b: Builder, name: string, x: Ref, c2: number,
  k = 1, s = 1, p: number | null = null, g = 1, d = 1, act: boolean | string = true,
): Ref {
  return b.group(name, "Conv", [x], (m, [i]) => {
    const c = m.conv2d("conv", i!, { c2, k, s, p: autopad(k, p, d), g, d });
    const n = m.bn("bn", c);
    return m.act("act", n, act === true ? "SiLU" : act === false ? "Identity" : act);
  }, { attrs: { c2, k, s, g } });
}

export function DWConv(b: Builder, name: string, x: Ref, c2: number, k = 1, s = 1, d = 1, act: boolean | string = true): Ref {
  const g = gcd(x.shape[0]!, c2);
  return b.group(name, "DWConv", [x], (m, [i]) => {
    const c = m.conv2d("conv", i!, { c2, k, s, p: autopad(k, null, d), g, d });
    const n = m.bn("bn", c);
    return m.act("act", n, act === true ? "SiLU" : act === false ? "Identity" : act);
  }, { attrs: { c2, k, s, g } });
}

export function GhostConv(b: Builder, name: string, x: Ref, c2: number, k = 1, s = 1, g = 1, act: boolean | string = true): Ref {
  return b.group(name, "GhostConv", [x], (m, [i]) => {
    const c_ = Math.floor(c2 / 2);
    const y = Conv(m, "cv1", i!, c_, k, s, null, g, 1, act);
    const z = Conv(m, "cv2", y, c_, 5, 1, null, c_, 1, act);
    return m.concat("cat", [y, z]);
  });
}

export function RepConv(b: Builder, name: string, x: Ref, c2: number, k = 3, s = 1, p = 1, g = 1, d = 1, act = true, bn = false): Ref {
  return b.group(name, "RepConv", [x], (m, [i]) => {
    const c1 = i!.shape[0]!;
    const id = bn && c2 === c1 && s === 1 ? m.bn("bn", i!) : null;
    const a = Conv(m, "conv1", i!, c2, k, s, p, g, d, false);
    const c = Conv(m, "conv2", i!, c2, 1, s, p - Math.floor(k / 2), g, d, false);
    let y = m.add("add", a, c);
    if (id) y = m.add("add_id", y, id);
    return m.act("act", y, act ? "SiLU" : "Identity");
  });
}

// ------------------------------------------------------------------ block.py

export function Bottleneck(b: Builder, name: string, x: Ref, c2: number, shortcut = true, g = 1, k: [number, number] = [3, 3], e = 0.5): Ref {
  return b.group(name, "Bottleneck", [x], (m, [i]) => {
    const c_ = Math.trunc(c2 * e);
    const y = Conv(m, "cv2", Conv(m, "cv1", i!, c_, k[0], 1), c2, k[1], 1, null, g);
    return shortcut && i!.shape[0] === c2 ? m.add("add", i!, y) : y;
  }, { attrs: { shortcut } });
}

export function RepBottleneck(b: Builder, name: string, x: Ref, c2: number, shortcut = true, g = 1, k: [number, number] = [3, 3], e = 0.5): Ref {
  return b.group(name, "RepBottleneck", [x], (m, [i]) => {
    const c_ = Math.trunc(c2 * e);
    const y = Conv(m, "cv2", RepConv(m, "cv1", i!, c_, k[0], 1), c2, k[1], 1, null, g);
    return shortcut && i!.shape[0] === c2 ? m.add("add", i!, y) : y;
  });
}

export function GhostBottleneck(b: Builder, name: string, x: Ref, c2: number, k = 3, s = 1): Ref {
  return b.group(name, "GhostBottleneck", [x], (m, [i]) => {
    const c_ = Math.floor(c2 / 2);
    const main = m.group("conv", "Sequential", [i!], (q, [xi]) => {
      let y = GhostConv(q, "0", xi!, c_, 1, 1);
      y = s === 2 ? DWConv(q, "1", y, c_, k, s, 1, false) : q.act("1", y, "Identity");
      return GhostConv(q, "2", y, c2, 1, 1, 1, false);
    });
    const short = s === 2
      ? m.group("shortcut", "Sequential", [i!], (q, [xi]) => Conv(q, "1", DWConv(q, "0", xi!, xi!.shape[0]!, k, s, 1, false), c2, 1, 1, null, 1, 1, false))
      : m.act("shortcut", i!, "Identity");
    return m.add("add", main, short);
  });
}

/** `nn.Sequential` of `n` copies built by `make(b, name, x)`. */
function seq(b: Builder, name: string, x: Ref, n: number, make: (q: Builder, nm: string, xi: Ref) => Ref, type = "Sequential"): Ref {
  return b.group(name, type, [x], (q, [xi]) => {
    let y = xi!;
    for (let j = 0; j < n; j++) y = make(q, String(j), y);
    return y;
  });
}

export function C2f(b: Builder, name: string, x: Ref, c2: number, n = 1, shortcut = false, g = 1, e = 0.5, type = "C2f",
  inner?: (q: Builder, nm: string, xi: Ref, c: number) => Ref): Ref {
  return b.group(name, type, [x], (m, [i]) => {
    const c = Math.trunc(c2 * e);
    const y0 = Conv(m, "cv1", i!, 2 * c, 1, 1);
    const ys = m.split("chunk", y0, [c, c]);
    // ModuleList: each bottleneck feeds the next, and every output also goes to the concat
    const outs = n > 0 ? m.groupN("m", "ModuleList", [ys[1]!], (q, [xi]) => {
      let y = xi!;
      const res: Ref[] = [];
      for (let j = 0; j < n; j++) {
        y = inner ? inner(q, String(j), y, c) : Bottleneck(q, String(j), y, c, shortcut, g, [3, 3], 1.0);
        res.push(y);
      }
      return res;
    }) : [];
    const cat = m.concat("cat", [ys[0]!, ys[1]!, ...outs]);
    return Conv(m, "cv2", cat, c2, 1);
  }, { attrs: { n, shortcut, e } });
}

export function C3(b: Builder, name: string, x: Ref, c2: number, n = 1, shortcut = true, g = 1, e = 0.5, type = "C3",
  inner?: (q: Builder, nm: string, xi: Ref, c: number) => Ref): Ref {
  return b.group(name, type, [x], (m, [i]) => {
    const c_ = Math.trunc(c2 * e);
    const a = Conv(m, "cv1", i!, c_, 1, 1);
    const bb = Conv(m, "cv2", i!, c_, 1, 1);
    const y = seq(m, "m", a, n, (q, nm, xi) => (inner ? inner(q, nm, xi, c_) : Bottleneck(q, nm, xi, c_, shortcut, g, [1, 1], 1.0)));
    return Conv(m, "cv3", m.concat("cat", [y, bb]), c2, 1);
  }, { attrs: { n, shortcut, e } });
}

export function C3k(b: Builder, name: string, x: Ref, c2: number, n = 1, shortcut = true, g = 1, e = 0.5, k = 3): Ref {
  return C3(b, name, x, c2, n, shortcut, g, e, "C3k", (q, nm, xi, c_) => Bottleneck(q, nm, xi, c_, shortcut, g, [k, k], 1.0));
}

export function C3k2(b: Builder, name: string, x: Ref, c2: number, n = 1, c3k = false, e = 0.5, attn = false, g = 1, shortcut = true): Ref {
  return C2f(b, name, x, c2, n, shortcut, g, e, "C3k2", (q, nm, xi, c) => {
    if (attn) {
      return q.group(nm, "Sequential", [xi], (s, [si]) =>
        PSABlock(s, "1", Bottleneck(s, "0", si!, c, shortcut, g), c, 0.5, Math.max(Math.floor(c / 64), 1)));
    }
    return c3k ? C3k(q, nm, xi, c, 2, shortcut, g) : Bottleneck(q, nm, xi, c, shortcut, g);
  });
}

export function C3Ghost(b: Builder, name: string, x: Ref, c2: number, n = 1, shortcut = true, g = 1, e = 0.5): Ref {
  return C3(b, name, x, c2, n, shortcut, g, e, "C3Ghost", (q, nm, xi, c_) => GhostBottleneck(q, nm, xi, c_));
}

export function RepCSP(b: Builder, name: string, x: Ref, c2: number, n = 1, shortcut = true, g = 1, e = 0.5): Ref {
  return C3(b, name, x, c2, n, shortcut, g, e, "RepCSP", (q, nm, xi, c_) => RepBottleneck(q, nm, xi, c_, shortcut, g, [3, 3], 1.0));
}

export function RepNCSPELAN4(b: Builder, name: string, x: Ref, c2: number, c3: number, c4: number, n = 1): Ref {
  return b.group(name, "RepNCSPELAN4", [x], (m, [i]) => {
    const c = Math.floor(c3 / 2);
    const ys = m.split("chunk", Conv(m, "cv1", i!, c3, 1, 1), [c, c]);
    const y2 = m.group("cv2", "Sequential", [ys[1]!], (q, [xi]) => Conv(q, "1", RepCSP(q, "0", xi!, c4, n), c4, 3, 1));
    const y3 = m.group("cv3", "Sequential", [y2], (q, [xi]) => Conv(q, "1", RepCSP(q, "0", xi!, c4, n), c4, 3, 1));
    return Conv(m, "cv4", m.concat("cat", [ys[0]!, ys[1]!, y2, y3]), c2, 1, 1);
  }, { attrs: { c3, c4, n } });
}

export function ELAN1(b: Builder, name: string, x: Ref, c2: number, c3: number, c4: number): Ref {
  return b.group(name, "ELAN1", [x], (m, [i]) => {
    const c = Math.floor(c3 / 2);
    const ys = m.split("chunk", Conv(m, "cv1", i!, c3, 1, 1), [c, c]);
    const y2 = Conv(m, "cv2", ys[1]!, c4, 3, 1);
    const y3 = Conv(m, "cv3", y2, c4, 3, 1);
    return Conv(m, "cv4", m.concat("cat", [ys[0]!, ys[1]!, y2, y3]), c2, 1, 1);
  });
}

export function AConv(b: Builder, name: string, x: Ref, c2: number): Ref {
  return b.group(name, "AConv", [x], (m, [i]) => Conv(m, "cv1", m.avgpool("avg_pool2d", i!, 2, 1, 0), c2, 3, 2, 1));
}

export function ADown(b: Builder, name: string, x: Ref, c2: number): Ref {
  return b.group(name, "ADown", [x], (m, [i]) => {
    const c = Math.floor(c2 / 2);
    const half = Math.floor(i!.shape[0]! / 2);
    const p = m.avgpool("avg_pool2d", i!, 2, 1, 0);
    const [x1, x2] = m.split("chunk", p, [half, i!.shape[0]! - half]) as [Ref, Ref];
    const a = Conv(m, "cv1", x1, c, 3, 2, 1);
    const mp = m.maxpool("max_pool2d", x2, 3, 2, 1, true);
    const bb = Conv(m, "cv2", mp, c, 1, 1, 0);
    return m.concat("cat", [a, bb]);
  });
}

export function SPP(b: Builder, name: string, x: Ref, c2: number, ks: number[] = [5, 9, 13]): Ref {
  return b.group(name, "SPP", [x], (m, [i]) => {
    const c_ = Math.floor(i!.shape[0]! / 2);
    const y = Conv(m, "cv1", i!, c_, 1, 1);
    const outs = m.groupN("m", "ModuleList", [y], (q, [yi]) => ks.map((k, j) => q.maxpool(String(j), yi!, k, 1, Math.floor(k / 2))));
    return Conv(m, "cv2", m.concat("cat", [y, ...outs]), c2, 1, 1);
  });
}

export function SPPF(b: Builder, name: string, x: Ref, c2: number, k = 5, n = 3, shortcut = false, legacyAct = false): Ref {
  return b.group(name, "SPPF", [x], (m, [i]) => {
    const c_ = Math.floor(i!.shape[0]! / 2);
    // YOLO26 SPPF: cv1 has no activation. Older YAML rows (<=3 args) keep the activated cv1 (see parse_model).
    const y0 = Conv(m, "cv1", i!, c_, 1, 1, null, 1, 1, legacyAct ? true : false);
    const ys = [y0];
    for (let j = 0; j < n; j++) ys.push(m.maxpool(j === 0 ? "m" : `m(${j + 1})`, ys[ys.length - 1]!, k, 1, Math.floor(k / 2)));
    const y = Conv(m, "cv2", m.concat("cat", ys), c2, 1, 1);
    return shortcut && i!.shape[0] === c2 ? m.add("add", y, i!) : y;
  }, { attrs: { k, n } });
}

export function SPPELAN(b: Builder, name: string, x: Ref, c2: number, c3: number, k = 5): Ref {
  return b.group(name, "SPPELAN", [x], (m, [i]) => {
    const ys = [Conv(m, "cv1", i!, c3, 1, 1)];
    for (const nm of ["cv2", "cv3", "cv4"]) ys.push(m.maxpool(nm, ys[ys.length - 1]!, k, 1, Math.floor(k / 2)));
    return Conv(m, "cv5", m.concat("cat", ys), c2, 1, 1);
  });
}

export function RepVGGDW(b: Builder, name: string, x: Ref, ed: number): Ref {
  return b.group(name, "RepVGGDW", [x], (m, [i]) => {
    const a = Conv(m, "conv", i!, ed, 7, 1, 3, ed, 1, false);
    const c = Conv(m, "conv1", i!, ed, 3, 1, 1, ed, 1, false);
    return m.act("act", m.add("add", a, c), "SiLU");
  });
}

export function CIB(b: Builder, name: string, x: Ref, c2: number, shortcut = true, e = 0.5, lk = false): Ref {
  return b.group(name, "CIB", [x], (m, [i]) => {
    const c1 = i!.shape[0]!;
    const c_ = Math.trunc(c2 * e);
    const y = m.group("cv1", "Sequential", [i!], (q, [xi]) => {
      let z = Conv(q, "0", xi!, c1, 3, 1, null, c1);
      z = Conv(q, "1", z, 2 * c_, 1);
      z = lk ? RepVGGDW(q, "2", z, 2 * c_) : Conv(q, "2", z, 2 * c_, 3, 1, null, 2 * c_);
      z = Conv(q, "3", z, c2, 1);
      return Conv(q, "4", z, c2, 3, 1, null, c2);
    });
    return shortcut && c1 === c2 ? m.add("add", i!, y) : y;
  }, { attrs: { lk } });
}

export function C2fCIB(b: Builder, name: string, x: Ref, c2: number, n = 1, shortcut = false, lk = false, g = 1, e = 0.5): Ref {
  return C2f(b, name, x, c2, n, shortcut, g, e, "C2fCIB", (q, nm, xi, c) => CIB(q, nm, xi, c, shortcut, 1.0, lk));
}

/** `Attention` (block.py) — multi-head self-attention over all H×W positions with a depthwise positional conv. */
export function Attention(b: Builder, name: string, x: Ref, dim: number, numHeads = 8, attnRatio = 0.5): Ref {
  return b.group(name, "Attention", [x], (m, [i]) => {
    const [, H, W] = i!.shape as [number, number, number];
    const N = H * W;
    const headDim = Math.floor(dim / numHeads);
    const keyDim = Math.trunc(headDim * attnRatio);
    const h = dim + keyDim * numHeads * 2;
    const qkv = Conv(m, "qkv", i!, h, 1, 1, null, 1, 1, false);
    const view = m.reshape("view", qkv, [numHeads, keyDim * 2 + headDim, N]);
    const [q, k, v] = m.split("split", view, [keyDim, keyDim, headDim], 1) as [Ref, Ref, Ref];
    const qk = m.matmul("q·k", q, k, [numHeads, N, N], keyDim);
    const attn = m.softmax("softmax", qk, -1);
    const av = m.matmul("v·attn", v, attn, [numHeads, headDim, N], N);
    const xo = m.reshape("view_out", av, [dim, H, W]);
    const vimg = m.reshape("v_img", v, [dim, H, W]);
    const pe = Conv(m, "pe", vimg, dim, 3, 1, null, dim, 1, false);
    return Conv(m, "proj", m.add("add_pe", xo, pe), dim, 1, 1, null, 1, 1, false);
  }, { attrs: { numHeads, keyDim: Math.trunc(Math.floor(dim / numHeads) * attnRatio) } });
}

export function PSABlock(b: Builder, name: string, x: Ref, c: number, attnRatio = 0.5, numHeads = 4, shortcut = true): Ref {
  return b.group(name, "PSABlock", [x], (m, [i]) => {
    const a = Attention(m, "attn", i!, c, numHeads, attnRatio);
    const y1 = shortcut ? m.add("add_attn", i!, a) : a;
    const f = m.group("ffn", "Sequential", [y1], (q, [xi]) => Conv(q, "1", Conv(q, "0", xi!, c * 2, 1), c, 1, 1, null, 1, 1, false));
    return shortcut ? m.add("add_ffn", y1, f) : f;
  });
}

export function PSA(b: Builder, name: string, x: Ref, c2: number, e = 0.5): Ref {
  return b.group(name, "PSA", [x], (m, [i]) => {
    const c1 = i!.shape[0]!;
    const c = Math.trunc(c1 * e);
    const [a, bb] = m.split("split", Conv(m, "cv1", i!, 2 * c, 1, 1), [c, c]) as [Ref, Ref];
    const at = Attention(m, "attn", bb, c, Math.max(Math.floor(c / 64), 1), 0.5);
    const y1 = m.add("add_attn", bb, at);
    const f = m.group("ffn", "Sequential", [y1], (q, [xi]) => Conv(q, "1", Conv(q, "0", xi!, c * 2, 1), c, 1, 1, null, 1, 1, false));
    const y2 = m.add("add_ffn", y1, f);
    return Conv(m, "cv2", m.concat("cat", [a, y2]), c1, 1);
  });
}

export function C2PSA(b: Builder, name: string, x: Ref, c2: number, n = 1, e = 0.5): Ref {
  return b.group(name, "C2PSA", [x], (m, [i]) => {
    const c1 = i!.shape[0]!;
    const c = Math.trunc(c1 * e);
    const [a, bb] = m.split("split", Conv(m, "cv1", i!, 2 * c, 1, 1), [c, c]) as [Ref, Ref];
    const y = seq(m, "m", bb, n, (q, nm, xi) => PSABlock(q, nm, xi, c, 0.5, Math.max(Math.floor(c / 64), 1)));
    return Conv(m, "cv2", m.concat("cat", [a, y]), c1, 1);
  }, { attrs: { n } });
}

export function C2fPSA(b: Builder, name: string, x: Ref, c2: number, n = 1, e = 0.5): Ref {
  return C2f(b, name, x, c2, n, false, 1, e, "C2fPSA", (q, nm, xi, c) => PSABlock(q, nm, xi, c, 0.5, Math.max(Math.floor(c / 64), 1)));
}

export function SCDown(b: Builder, name: string, x: Ref, c2: number, k: number, s: number): Ref {
  return b.group(name, "SCDown", [x], (m, [i]) => Conv(m, "cv2", Conv(m, "cv1", i!, c2, 1, 1), c2, k, s, null, c2, 1, false));
}

/** `AAttn` — area attention (YOLO12): attention inside `area` horizontal strips of the feature map. */
export function AAttn(b: Builder, name: string, x: Ref, dim: number, numHeads: number, area = 1): Ref {
  return b.group(name, "AAttn", [x], (m, [i]) => {
    const [, H, W] = i!.shape as [number, number, number];
    const headDim = Math.floor(dim / numHeads);
    const all = headDim * numHeads;
    const N = (H * W) / (area > 1 ? area : 1);
    const qkv = Conv(m, "qkv", i!, all * 3, 1, 1, null, 1, 1, false);
    const t = m.reshape("to_areas", qkv, [area, numHeads, headDim * 3, N], "flatten·reshape");
    const [q, k, v] = m.split("split", t, [headDim, headDim, headDim], 2) as [Ref, Ref, Ref];
    const qk = m.matmul("q·k", q, k, [area, numHeads, N, N], headDim);
    const at = m.softmax("softmax", qk, -1);
    const av = m.matmul("v·attn", v, at, [area, numHeads, headDim, N], N);
    const xo = m.reshape("to_image", av, [all, H, W], "reshape·permute");
    const vi = m.reshape("v_image", v, [all, H, W], "reshape·permute");
    const pe = Conv(m, "pe", vi, all, 7, 1, 3, all, 1, false);
    return Conv(m, "proj", m.add("add_pe", xo, pe), dim, 1, 1, null, 1, 1, false);
  }, { attrs: { numHeads, area } });
}

export function ABlock(b: Builder, name: string, x: Ref, dim: number, numHeads: number, mlpRatio = 1.2, area = 1): Ref {
  return b.group(name, "ABlock", [x], (m, [i]) => {
    const y1 = m.add("add_attn", i!, AAttn(m, "attn", i!, dim, numHeads, area));
    const hidden = Math.trunc(dim * mlpRatio);
    const f = m.group("mlp", "Sequential", [y1], (q, [xi]) => Conv(q, "1", Conv(q, "0", xi!, hidden, 1), dim, 1, 1, null, 1, 1, false));
    return m.add("add_mlp", y1, f);
  });
}

export function A2C2f(b: Builder, name: string, x: Ref, c2: number, n = 1, a2 = true, area = 1, residual = false, mlpRatio = 2.0, e = 0.5, g = 1, shortcut = true): Ref {
  return b.group(name, "A2C2f", [x], (m, [i]) => {
    const c_ = Math.trunc(c2 * e);
    if (a2 && c_ % 32 !== 0) throw new Error(`A2C2f hidden width ${c_} must be a multiple of 32`);
    const y0 = Conv(m, "cv1", i!, c_, 1, 1);
    const outs = m.groupN("m", "ModuleList", [y0], (q, [xi]) => {
      let y = xi!;
      const res: Ref[] = [];
      for (let j = 0; j < n; j++) {
        y = a2
          ? q.group(String(j), "Sequential", [y], (s, [si]) => ABlock(s, "1", ABlock(s, "0", si!, c_, Math.floor(c_ / 32), mlpRatio, area), c_, Math.floor(c_ / 32), mlpRatio, area))
          : C3k(q, String(j), y, c_, 2, shortcut, g);
        res.push(y);
      }
      return res;
    });
    const y = Conv(m, "cv2", m.concat("cat", [y0, ...outs]), c2, 1);
    if (a2 && residual) {
      m.param("gamma", c2);
      return m.add("residual", i!, m.elementwise("scale", "mul", [y]));
    }
    return y;
  }, { attrs: { n, a2, area, residual } });
}

// ------------------------------------------------------------------ head.py / block.py (heads)

export interface DetectOpts {
  nc: number;
  regMax: number;
  end2end: boolean;
  legacy: boolean;
  /** cv3 style: "legacy" (v8/v9), "dw" (11/12/26), "v10" (YOLOv10). */
  cv3Style?: "legacy" | "dw" | "v10";
}

function detectBranches(b: Builder, prefix: string, xs: Ref[], o: DetectOpts): { boxes: Ref[]; scores: Ref[] } {
  const ch0 = xs[0]!.shape[0]!;
  const c2 = Math.max(16, Math.floor(ch0 / 4), o.regMax * 4);
  const c3 = Math.max(ch0, Math.min(o.nc, 100));
  const style = o.cv3Style ?? (o.legacy ? "legacy" : "dw");
  const boxes = b.groupN(`${prefix}cv2`, "ModuleList", xs, (q, ins) =>
    ins.map((x, i) => q.group(String(i), "Sequential", [x], (s, [xi]) =>
      s.conv2d("2", Conv(s, "1", Conv(s, "0", xi!, c2, 3), c2, 3), { c2: 4 * o.regMax, k: 1, bias: true }))));
  const scores = b.groupN(`${prefix}cv3`, "ModuleList", xs, (q, ins) =>
    ins.map((x, i) => q.group(String(i), "Sequential", [x], (s, [xi]) => {
      const cx = xi!.shape[0]!;
      let y: Ref;
      if (style === "legacy") y = Conv(s, "1", Conv(s, "0", xi!, c3, 3), c3, 3);
      else if (style === "v10") {
        y = s.group("0", "Sequential", [xi!], (t, [ti]) => Conv(t, "1", Conv(t, "0", ti!, cx, 3, 1, null, cx), c3, 1));
        y = s.group("1", "Sequential", [y], (t, [ti]) => Conv(t, "1", Conv(t, "0", ti!, c3, 3, 1, null, c3), c3, 1));
      } else {
        y = s.group("0", "Sequential", [xi!], (t, [ti]) => Conv(t, "1", DWConv(t, "0", ti!, cx, 3), c3, 1));
        y = s.group("1", "Sequential", [y], (t, [ti]) => Conv(t, "1", DWConv(t, "0", ti!, c3, 3), c3, 1));
      }
      return s.conv2d("2", y, { c2: o.nc, k: 1, bias: true });
    })));
  return { boxes, scores };
}

/** Per-level extra branch (`cv4`): Conv3×3 → Conv3×3 → 1×1 Conv2d to `cOut` channels. */
export function extraBranch(b: Builder, name: string, xs: Ref[], c4: number, cOut: number | null): Ref[] {
  return b.groupN(name, "ModuleList", xs, (q, ins) =>
    ins.map((x, i) => q.group(String(i), "Sequential", [x], (s, [xi]) => {
      const y = Conv(s, "1", Conv(s, "0", xi!, c4, 3), c4, 3);
      return cOut == null ? y : s.conv2d("2", y, { c2: cOut, k: 1, bias: true });
    })));
}

export function flatCat(b: Builder, name: string, maps: Ref[]): Ref {
  const flat = maps.map((r, i) => b.reshape(`${name}_flat${i}`, r, [r.shape[0]!, r.shape[1]! * r.shape[2]!], "flatten"));
  return b.concat(name, flat, 1);
}

export interface HeadResult {
  /** Named prediction tensors shown on the diagram (boxes, scores, masks…). */
  outputs: Record<string, Ref>;
}

/** Detect head body shared by Detect / Segment / Pose / OBB (+26 variants) and v10Detect. */
export function detectCore(b: Builder, xs: Ref[], o: DetectOpts, extra?: (b: Builder, prefix: string, xs: Ref[]) => Partial<Record<string, Ref>>): HeadResult {
  const { boxes, scores } = detectBranches(b, "", xs, o);
  const outputs: Record<string, Ref> = {};
  const extraMany = extra?.(b, "", xs) ?? {};
  if (o.regMax > 1) {
    // DFL: a fixed 1×1 conv (16 weights) turning each side's 16-bin distribution into one distance
    const A = xs.reduce((a, x) => a + x.shape[1]! * x.shape[2]!, 0);
    const box = flatCat(b, "boxes_raw", boxes);
    const v = b.reshape("dfl_view", box, [o.regMax, 4, A], "view·transpose·softmax");
    b.group("dfl", "DFL", [v], (q, [vi]) => q.reshape("out", q.conv2d("conv", vi!, { c2: 1, k: 1 }), [4, A]));
  }
  outputs.boxes = flatCat(b, "boxes", boxes);
  outputs.scores = flatCat(b, "scores", scores);
  for (const [k, v] of Object.entries(extraMany)) if (v) outputs[k] = v;
  if (o.end2end) {
    // one-to-one copy (NMS-free branch). It runs at inference; the one-to-many copy trains it.
    const o2o = detectBranches(b, "one2one_", xs, o);
    extra?.(b, "one2one_", xs);
    outputs.boxes_o2o = flatCat(b, "boxes_o2o", o2o.boxes);
    outputs.scores_o2o = flatCat(b, "scores_o2o", o2o.scores);
  }
  return { outputs };
}

export function Proto(b: Builder, name: string, x: Ref, c_ = 256, c2 = 32): Ref {
  return b.group(name, "Proto", [x], (m, [i]) => {
    const y = Conv(m, "cv1", i!, c_, 3);
    const u = m.convTranspose2d("upsample", y, c_, 2, 2, true);
    return Conv(m, "cv3", Conv(m, "cv2", u, c_, 3), c2);
  });
}

export function Classify(b: Builder, name: string, xs: Ref[], c2: number, k = 1, s = 1, p: number | null = null, g = 1): Ref {
  return b.group(name, "Classify", xs, (m, ins) => {
    const x = ins.length > 1 ? m.concat("cat", ins) : ins[0]!;
    const y = Conv(m, "conv", x, 1280, k, s, p, g);
    const pl = m.adaptiveAvgPool("pool", y);
    const fl = m.reshape("flatten", pl, [1280], "flatten");
    const d = m.dropout("drop", fl, 0);
    return m.linear("linear", d, c2);
  });
}

// ------------------------------------------------------------------ YOLOv9-E dual-path blocks

/** `CBLinear`: one 1×1 conv whose output is split into several pieces sent to different places. */
export function CBLinear(b: Builder, name: string, x: Ref, c2s: number[], k = 1, s = 1, p: number | null = null, g = 1): Ref[] {
  return b.groupN(name, "CBLinear", [x], (m, [i]) => {
    const y = m.conv2d("conv", i!, { c2: c2s.reduce((a, v) => a + v, 0), k, s, p: autopad(k, p), g, bias: true });
    return m.split("split", y, c2s);
  });
}

/** `CBFuse`: resize the selected pieces to the last input's size (nearest) and add everything. */
export function CBFuse(b: Builder, name: string, xs: Ref[]): Ref {
  return b.group(name, "CBFuse", xs, (m, ins) => {
    const target = ins[ins.length - 1]!;
    const resized = ins.slice(0, -1).map((r, i) => m.upsample(`interpolate${i}`, r, target.shape[1]! / r.shape[1]!, "nearest", true));
    return m.elementwise("sum", "stack·sum", [...resized, target], target.shape);
  });
}

// ------------------------------------------------------------------ YOLO26 task heads

/** `Proto26`: fuses all head levels into the P3 map, then the usual Proto. A semantic-seg branch trains only. */
export function Proto26(b: Builder, name: string, xs: Ref[], c_ = 256, c2 = 32, nc = 80): Ref {
  return b.group(name, "Proto26", xs, (m, ins) => {
    const ch0 = ins[0]!.shape[0]!;
    const refined = m.groupN("feat_refine", "ModuleList", ins.slice(1), (q, rs) => rs.map((r, i) => Conv(q, String(i), r!, ch0, 1)));
    let feat = ins[0]!;
    refined.forEach((r, i) => {
      const up = m.upsample(`interpolate${i}`, r, 2 ** (i + 1), "nearest", true);
      feat = m.add(`add${i}`, feat, up);
    });
    const fused = Conv(m, "feat_fuse", feat, c_, 3);
    const y = Conv(m, "cv1", fused, c_, 3);
    const u = m.convTranspose2d("upsample", y, c_, 2, 2, true);
    const p = Conv(m, "cv3", Conv(m, "cv2", u, c_, 3), c2);
    m.group("semseg", "Sequential", [feat], (q, [f]) => q.conv2d("2", Conv(q, "1", Conv(q, "0", f!, c_, 3), c_, 3), { c2: nc, k: 1, bias: true }), { inactive: true });
    return p;
  });
}

/** `RealNVP`: a tiny normalising flow (6 coupling layers) used only by the RLE keypoint loss in training. */
export function RealNVP(b: Builder, name: string, x: Ref): Ref {
  return b.group(name, "RealNVP", [x], (m, [i]) => {
    const point = m.reshape("point", i!, [2], "view");
    const mlp = (q: Builder, nm: string, tanh: boolean) =>
      q.group(nm, "Sequential", [point], (s, [p]) => {
        let y = s.act("1", s.linear("0", p!, 64), "SiLU");
        y = s.act("3", s.linear("2", y, 64), "SiLU");
        y = s.linear("4", y, 2);
        return tanh ? s.act("5", y, "Tanh") : y;
      });
    m.group("s", "ModuleList", [point], (q) => Array.from({ length: 6 }, (_, k) => mlp(q, String(k), true)));
    m.group("t", "ModuleList", [point], (q) => Array.from({ length: 6 }, (_, k) => mlp(q, String(k), false)));
    return point;
  }, { inactive: true });
}

// ------------------------------------------------------------------ YOLOv13 (iMoonLab/yolov13, an Ultralytics fork)

/** `DSConv`: depthwise k×k conv + pointwise 1×1 conv + BN + SiLU (depthwise-separable). */
export function DSConv(b: Builder, name: string, x: Ref, c2: number, k = 3, s = 1, p: number | null = null, d = 1): Ref {
  return b.group(name, "DSConv", [x], (m, [i]) => {
    const c1 = i!.shape[0]!;
    const dw = m.conv2d("dw", i!, { c2: c1, k, s, p: p ?? Math.floor((d * (k - 1)) / 2), d, g: c1 });
    const pw = m.conv2d("pw", dw, { c2, k: 1 });
    return m.act("act", m.bn("bn", pw), "SiLU");
  }, { attrs: { c2, k, s } });
}

export function DSBottleneck(b: Builder, name: string, x: Ref, c2: number, shortcut = true, e = 0.5, k1 = 3, k2 = 5, d2 = 1): Ref {
  return b.group(name, "DSBottleneck", [x], (m, [i]) => {
    const c_ = Math.trunc(c2 * e);
    const y = DSConv(m, "cv2", DSConv(m, "cv1", i!, c_, k1, 1, null, 1), c2, k2, 1, null, d2);
    return shortcut && i!.shape[0] === c2 ? m.add("add", i!, y) : y;
  });
}

export function DSC3k(b: Builder, name: string, x: Ref, c2: number, n = 1, shortcut = true, g = 1, e = 0.5, k1 = 3, k2 = 5, d2 = 1): Ref {
  return C3(b, name, x, c2, n, shortcut, g, e, "DSC3k", (q, nm, xi, c_) => DSBottleneck(q, nm, xi, c_, shortcut, 1.0, k1, k2, d2));
}

export function DSC3k2(b: Builder, name: string, x: Ref, c2: number, n = 1, dsc3k = false, e = 0.5, g = 1, shortcut = true, k1 = 3, k2 = 7, d2 = 1): Ref {
  return C2f(b, name, x, c2, n, shortcut, g, e, "DSC3k2", (q, nm, xi, c) =>
    dsc3k ? DSC3k(q, nm, xi, c, 2, shortcut, g, 1.0, k1, k2, d2) : DSBottleneck(q, nm, xi, c, shortcut, 1.0, k1, k2, d2));
}

/** YOLOv13's `AAttn` (older area attention: separate q·k and v convs, 5×5 positional conv on v). */
export function AAttn13(b: Builder, name: string, x: Ref, dim: number, numHeads: number, area = 1): Ref {
  return b.group(name, "AAttn", [x], (m, [i]) => {
    const [, H, W] = i!.shape as [number, number, number];
    const headDim = Math.floor(dim / numHeads);
    const all = headDim * numHeads;
    const N = (H * W) / (area > 1 ? area : 1);
    const qk = Conv(m, "qk", i!, all * 2, 1, 1, null, 1, 1, false);
    const v = Conv(m, "v", i!, all, 1, 1, null, 1, 1, false);
    const pp = Conv(m, "pe", v, dim, 5, 1, 2, dim, 1, false);
    const t = m.reshape("to_areas", qk, [area, numHeads, headDim * 2, N], "flatten·reshape");
    const [q, k] = m.split("split", t, [headDim, headDim], 2) as [Ref, Ref];
    const vt = m.reshape("v_areas", v, [area, numHeads, headDim, N], "flatten·reshape");
    const qkm = m.matmul("q·k", q, k, [area, numHeads, N, N], headDim);
    const at = m.softmax("softmax", qkm, -1);
    const av = m.matmul("v·attn", vt, at, [area, numHeads, headDim, N], N);
    const xo = m.reshape("to_image", av, [all, H, W], "reshape·permute");
    return Conv(m, "proj", m.add("add_pe", xo, pp), dim, 1, 1, null, 1, 1, false);
  }, { attrs: { numHeads, area } });
}

function ABlock13(b: Builder, name: string, x: Ref, dim: number, numHeads: number, mlpRatio = 1.2, area = 1): Ref {
  return b.group(name, "ABlock", [x], (m, [i]) => {
    const y1 = m.add("add_attn", i!, AAttn13(m, "attn", i!, dim, numHeads, area));
    const hidden = Math.trunc(dim * mlpRatio);
    const f = m.group("mlp", "Sequential", [y1], (q, [xi]) => Conv(q, "1", Conv(q, "0", xi!, hidden, 1), dim, 1, 1, null, 1, 1, false));
    return m.add("add_mlp", y1, f);
  });
}

export function A2C2f13(b: Builder, name: string, x: Ref, c2: number, n = 1, a2 = true, area = 1, residual = false, mlpRatio = 2.0, e = 0.5, g = 1, shortcut = true): Ref {
  return b.group(name, "A2C2f", [x], (m, [i]) => {
    const c_ = Math.trunc(c2 * e);
    if (a2 && c_ % 32 !== 0) throw new Error(`A2C2f hidden width ${c_} must be a multiple of 32`);
    const y0 = Conv(m, "cv1", i!, c_, 1, 1);
    const outs = m.groupN("m", "ModuleList", [y0], (q, [xi]) => {
      let y = xi!;
      const res: Ref[] = [];
      for (let j = 0; j < n; j++) {
        y = a2
          ? q.group(String(j), "Sequential", [y], (s, [si]) => ABlock13(s, "1", ABlock13(s, "0", si!, c_, Math.floor(c_ / 32), mlpRatio, area), c_, Math.floor(c_ / 32), mlpRatio, area))
          : C3k(q, String(j), y, c_, 2, shortcut, g);
        res.push(y);
      }
      return res;
    });
    const y = Conv(m, "cv2", m.concat("cat", [y0, ...outs]), c2, 1);
    if (a2 && residual) {
      m.param("gamma", c2);
      return m.add("residual", i!, m.elementwise("scale", "mul", [y]));
    }
    return y;
  }, { attrs: { n, a2, area, residual } });
}

/** Learns hyperedges (groups of pixels) from the tokens and gives each pixel a soft membership in each group. */
function AdaHyperedgeGen(b: Builder, name: string, x: Ref, D: number, nh: number, heads: number): Ref {
  return b.group(name, "AdaHyperedgeGen", [x], (m, [X]) => {
    const N = X!.shape[0]!;
    const hd = Math.floor(D / heads);
    m.param("prototype_base", nh * D);
    const ctx = m.reshape("mean·max", X!, [2 * D], "mean+max");
    const offsets = m.linear("context_net", ctx, nh * D);
    const protos = m.elementwise("prototypes", "add", [offsets], [nh, D]);
    const proj = m.linear("pre_head_proj", X!, D);
    const heads3 = m.reshape("heads", proj, [heads, N, hd], "view·transpose");
    const logits = m.matmul("x·prototypes", heads3, protos, [heads, N, nh], hd);
    const mean = m.reshape("mean_heads", logits, [N, nh], "mean");
    const drop = m.dropout("dropout", mean, 0.1);
    return m.softmax("softmax", drop, 0);
  }, { attrs: { hyperedges: nh, heads } });
}

/** One round of hypergraph message passing: pixels → hyperedges → pixels, with a residual. */
function AdaHGConv(b: Builder, name: string, x: Ref, D: number, nh: number, heads: number): Ref {
  return b.group(name, "AdaHGConv", [x], (m, [X]) => {
    const N = X!.shape[0]!;
    const A = AdaHyperedgeGen(m, "edge_generator", X!, D, nh, heads);
    const He = m.matmul("Aᵀ·X", A, X!, [nh, D], N);
    const He2 = m.group("edge_proj", "Sequential", [He], (q, [h]) => q.act("1", q.linear("0", h!, D), "GELU"));
    const Xn = m.matmul("A·He", A, He2, [N, D], nh);
    const Xp = m.group("node_proj", "Sequential", [Xn], (q, [h]) => q.act("1", q.linear("0", h!, D), "GELU"));
    return m.add("residual", Xp, X!);
  });
}

function C3AH(b: Builder, name: string, x: Ref, c2: number, e = 1.0, nh = 8): Ref {
  return b.group(name, "C3AH", [x], (m, [i]) => {
    const c_ = Math.trunc(c2 * e);
    if (c_ % 16 !== 0) throw new Error(`C3AH width ${c_} must be a multiple of 16`);
    const a = Conv(m, "cv1", i!, c_, 1, 1);
    const bb = Conv(m, "cv2", i!, c_, 1, 1);
    const [, H, W] = a.shape as [number, number, number];
    const hg = m.group("m", "AdaHGComputation", [a], (q, [t]) => {
      const tokens = q.reshape("tokens", t!, [H * W, c_], "flatten·transpose");
      const y = AdaHGConv(q, "hgnn", tokens, c_, nh, Math.floor(c_ / 16));
      return q.reshape("to_image", y, [c_, H, W], "transpose·view");
    });
    return Conv(m, "cv3", m.concat("cat", [hg, bb]), c2, 1);
  });
}

function FuseModule(b: Builder, name: string, xs: Ref[], cIn: number, channelAdjust: boolean): Ref {
  return b.group(name, "FuseModule", xs, (m, ins) => {
    const ds = m.avgPoolModule("downsample", ins[0]!, 2);
    const up = m.upsample("upsample", ins[2]!, 2);
    return Conv(m, "conv_out", m.concat("cat", [ds, ins[1]!, up]), cIn, 1);
  }, { attrs: { channelAdjust } });
}

/** `HyperACE`: fuse P3/P4/P5 at P4 size, then a CSP-style block whose two side branches are hypergraph blocks. */
export function HyperACE(b: Builder, name: string, xs: Ref[], c2: number, n = 1, nh = 8, dsc3k = true, shortcut = false, e1 = 0.5, e2 = 1, channelAdjust = true): Ref {
  return b.group(name, "HyperACE", xs, (m, ins) => {
    const c1 = ins[1]!.shape[0]!;
    const c = Math.trunc(c2 * e1);
    const x = FuseModule(m, "fuse", ins, c1, channelAdjust);
    const [y0, y1, y2] = m.split("chunk", Conv(m, "cv1", x, 3 * c, 1, 1), [c, c, c]) as [Ref, Ref, Ref];
    const out1 = C3AH(m, "branch1", y1, c, e2, nh);
    const out2 = C3AH(m, "branch2", y1, c, e2, nh);
    const chain = n > 0 ? m.groupN("m", "ModuleList", [y2], (q, [xi]) => {
      let y = xi!;
      const res: Ref[] = [];
      for (let j = 0; j < n; j++) {
        y = dsc3k ? DSC3k(q, String(j), y, c, 2, shortcut, 1, 0.5, 3, 7) : DSBottleneck(q, String(j), y, c, shortcut);
        res.push(y);
      }
      return res;
    }) : [];
    return Conv(m, "cv2", m.concat("cat", [y0, out1, y2, ...chain, out2]), c2, 1);
  }, { attrs: { n, hyperedges: nh } });
}

export function DownsampleConv(b: Builder, name: string, x: Ref, channelAdjust = true): Ref {
  return b.group(name, "DownsampleConv", [x], (m, [i]) => {
    const d = m.avgPoolModule("downsample", i!, 2);
    return channelAdjust ? Conv(m, "channel_adjust", d, i!.shape[0]! * 2, 1) : m.act("channel_adjust", d, "Identity");
  });
}

/** `FullPAD_Tunnel`: out = x + gate · y, with one learned gate that starts at 0. */
export function FullPADTunnel(b: Builder, name: string, xs: Ref[]): Ref {
  return b.group(name, "FullPAD_Tunnel", xs, (m, [a, c]) => {
    m.param("gate", 1);
    return m.add("add", a!, m.elementwise("gate·y", "mul", [c!]));
  });
}
