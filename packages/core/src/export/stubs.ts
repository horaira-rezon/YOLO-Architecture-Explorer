/** PyTorch source for Lab extras that Ultralytics does not ship, and how to register each in parse_model. */

export interface Stub {
  /** Class source (empty when Ultralytics already has the class). */
  code: string;
  /** Which parse_model rule the block needs. */
  rule: "same-channels" | "base" | "weighted-add";
  /** Module Ultralytics already provides (no stub needed). */
  builtin?: string;
}

export const STUBS: Record<string, Stub> = {
  SE: {
    rule: "same-channels",
    code: `class SE(nn.Module):
    """Squeeze-and-Excitation (Hu et al., 2018). Output channels = input channels."""

    def __init__(self, c1, r=16):
        super().__init__()
        c_ = max(c1 // r, 8)
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.fc1 = nn.Conv2d(c1, c_, 1, bias=True)
        self.act = nn.ReLU(inplace=True)
        self.fc2 = nn.Conv2d(c_, c1, 1, bias=True)
        self.gate = nn.Sigmoid()

    def forward(self, x):
        return x * self.gate(self.fc2(self.act(self.fc1(self.pool(x)))))`,
  },
  ECA: {
    rule: "same-channels",
    code: `class ECA(nn.Module):
    """Efficient Channel Attention (Wang et al., 2020): 1-D conv across channels."""

    def __init__(self, c1, k=3):
        super().__init__()
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.conv = nn.Conv1d(1, 1, kernel_size=k, padding=k // 2, bias=False)
        self.gate = nn.Sigmoid()

    def forward(self, x):
        y = self.pool(x)  # B, C, 1, 1
        y = self.conv(y.squeeze(-1).transpose(-1, -2)).transpose(-1, -2).unsqueeze(-1)
        return x * self.gate(y)`,
  },
  CBAM: { rule: "same-channels", builtin: "CBAM", code: "" },
  CoordAtt: {
    rule: "same-channels",
    code: `class CoordAtt(nn.Module):
    """Coordinate Attention (Hou et al., 2021)."""

    def __init__(self, c1, r=32):
        super().__init__()
        mip = max(8, c1 // r)
        self.pool_h = nn.AdaptiveAvgPool2d((None, 1))
        self.pool_w = nn.AdaptiveAvgPool2d((1, None))
        self.conv1 = nn.Conv2d(c1, mip, 1, bias=True)
        self.bn1 = nn.BatchNorm2d(mip)
        self.act = nn.Hardswish()
        self.conv_h = nn.Conv2d(mip, c1, 1, bias=True)
        self.conv_w = nn.Conv2d(mip, c1, 1, bias=True)

    def forward(self, x):
        _, _, h, w = x.shape
        x_h = self.pool_h(x)
        x_w = self.pool_w(x).permute(0, 1, 3, 2)
        y = self.act(self.bn1(self.conv1(torch.cat([x_h, x_w], dim=2))))
        y_h, y_w = torch.split(y, [h, w], dim=2)
        a_h = self.conv_h(y_h).sigmoid()
        a_w = self.conv_w(y_w.permute(0, 1, 3, 2)).sigmoid()
        return x * a_h * a_w`,
  },
  SimAM: {
    rule: "same-channels",
    code: `class SimAM(nn.Module):
    """SimAM (Yang et al., 2021): parameter-free attention."""

    def __init__(self, c1=None, e_lambda=1e-4):
        super().__init__()
        self.e_lambda = e_lambda

    def forward(self, x):
        n = x.shape[2] * x.shape[3] - 1
        d = (x - x.mean(dim=[2, 3], keepdim=True)).pow(2)
        y = d / (4 * (d.sum(dim=[2, 3], keepdim=True) / n + self.e_lambda)) + 0.5
        return x * torch.sigmoid(y)`,
  },
  WeightedAdd: {
    rule: "weighted-add",
    code: `class WeightedAdd(nn.Module):
    """BiFPN fast normalised fusion (Tan et al., 2020). All inputs must have the same shape."""

    def __init__(self, n=2, eps=1e-4):
        super().__init__()
        self.w = nn.Parameter(torch.ones(n))
        self.eps = eps

    def forward(self, xs):
        w = torch.relu(self.w)
        w = w / (w.sum() + self.eps)
        return sum(wi * xi for wi, xi in zip(w, xs))`,
  },
  DeformConv: {
    rule: "base",
    code: `class DeformConv(nn.Module):
    """DCNv2-style deformable Conv + BN + SiLU (Zhu et al., 2019), using torchvision.ops.deform_conv2d."""

    def __init__(self, c1, c2, k=3, s=1):
        super().__init__()
        p = k // 2
        self.k, self.s, self.p = k, s, p
        self.offset = nn.Conv2d(c1, 3 * k * k, k, s, p, bias=True)  # 2·k² offsets + k² masks
        nn.init.zeros_(self.offset.weight)
        nn.init.zeros_(self.offset.bias)
        self.weight = nn.Parameter(torch.empty(c2, c1, k, k))
        nn.init.kaiming_uniform_(self.weight, a=5 ** 0.5)
        self.bn = nn.BatchNorm2d(c2)
        self.act = nn.SiLU()

    def forward(self, x):
        from torchvision.ops import deform_conv2d

        o1, o2, mask = torch.chunk(self.offset(x), 3, dim=1)
        offset, mask = torch.cat((o1, o2), dim=1), mask.sigmoid()
        y = deform_conv2d(x, offset, self.weight, stride=self.s, padding=self.p, mask=mask)
        return self.act(self.bn(y))`,
  },
};

/** Python lines to add inside Ultralytics `parse_model` for the given extras. */
export function parseModelEdits(ids: string[]): string {
  const same = ids.filter((i) => STUBS[i]?.rule === "same-channels");
  const base = ids.filter((i) => STUBS[i]?.rule === "base");
  const wadd = ids.filter((i) => STUBS[i]?.rule === "weighted-add");
  const out: string[] = [];
  if (base.length)
    out.push(`# 1) add to the 'base_modules' frozenset (channels are scaled by width like Conv):\n#    ${base.join(", ")}`);
  if (same.length || wadd.length) {
    out.push("# 2) add these branches next to the other `elif m is ...` cases:");
    if (same.length) out.push(`elif m in {${same.join(", ")}}:\n    c2 = ch[f]\n    args = [ch[f], *args]  # first arg = input channels`);
    if (wadd.length) out.push(`elif m is WeightedAdd:\n    c2 = ch[f[0]]  # all inputs must have the same shape\n    args = [len(f), *args]`);
  }
  return out.join("\n");
}
