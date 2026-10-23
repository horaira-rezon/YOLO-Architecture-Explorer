#!/usr/bin/env python3
"""Export ground-truth fixtures for YOLO Atlas from the official Ultralytics code.

For each (version, task, scale) this builds the real PyTorch model from the official YAML, runs one forward
pass on a blank image and records, for every YAML layer:
  index, from, repeats, module, YAML args, resolved constructor args, output shape (forward hooks),
  parameter count, FLOPs (thop per-layer info), and the full sub-module tree (types, conv settings,
  output shapes) so the website's zoomed-in views can be tested against reality.

Usage (from the repo root):
  .cache-tools/venv-ul/bin/python tools/extract_ground_truth.py --version v8
  .cache-tools/venv-ul/bin/python tools/extract_ground_truth.py --all
  # YOLOv13 lives in its own official repo (an Ultralytics fork):
  PYTHONPATH=.cache-tools/ext/yolov13 .cache-tools/venv-ul/bin/python tools/extract_ground_truth.py --version v13 \
      --source-repo https://github.com/iMoonLab/yolov13 --source-dir .cache-tools/ext/yolov13

Fixtures are written to packages/core/fixtures/<version>/<task>-<scale>.json. Never edit them by hand.
"""

from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import hashlib
import io
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "packages" / "core" / "fixtures"

# version -> task -> (yaml path relative to ultralytics/cfg/models, {scale: model name passed to YOLO()})
FIVE = ["n", "s", "m", "l", "x"]
TASK_SUFFIX = {"detect": "", "segment": "-seg", "pose": "-pose", "classify": "-cls", "obb": "-obb"}


def _scaled(folder: str, stem: str, scales: list[str], tasks: list[str]) -> dict:
    """Configs with a `scales:` block (one YAML, scale letter injected into the model name)."""
    out = {}
    for t in tasks:
        sfx = TASK_SUFFIX[t]
        out[t] = (f"{folder}/{stem}{sfx}.yaml", {s: f"{stem}{s}{sfx}.yaml" for s in scales})
    return out


VERSIONS: dict[str, dict] = {
    "v8": _scaled("v8", "yolov8", FIVE, list(TASK_SUFFIX)),
    "v9": {
        # YOLOv9 ships one YAML per size and no `scales:` block.
        "detect": ("v9", {s: f"yolov9{s}.yaml" for s in ["t", "s", "m", "c", "e"]}),
        "segment": ("v9", {s: f"yolov9{s}-seg.yaml" for s in ["c", "e"]}),
    },
    "v10": {"detect": ("v10", {s: f"yolov10{s}.yaml" for s in ["n", "s", "m", "b", "l", "x"]})},
    "11": _scaled("11", "yolo11", FIVE, list(TASK_SUFFIX)),
    "12": _scaled("12", "yolo12", FIVE, list(TASK_SUFFIX)),
    "13": _scaled("v13", "yolov13", ["n", "s", "l", "x"], ["detect"]),
    "26": _scaled("26", "yolo26", FIVE, list(TASK_SUFFIX)),
}


def shape_of(x):
    """Serialise an output (tensor / list / tuple / dict) to shapes without the batch dimension."""
    import torch

    if isinstance(x, torch.Tensor):
        return list(x.shape[1:])
    if isinstance(x, (list, tuple)):
        return [shape_of(v) for v in x]
    if isinstance(x, dict):
        return {str(k): shape_of(v) for k, v in x.items()}
    return None


def leaf_attrs(m) -> dict:
    import torch.nn as nn

    if isinstance(m, nn.Conv2d):
        return {
            "c1": m.in_channels, "c2": m.out_channels, "k": list(m.kernel_size), "s": list(m.stride),
            "p": list(m.padding) if not isinstance(m.padding, str) else m.padding, "g": m.groups,
            "d": list(m.dilation), "bias": m.bias is not None,
        }
    if isinstance(m, nn.ConvTranspose2d):
        return {"c1": m.in_channels, "c2": m.out_channels, "k": list(m.kernel_size), "s": list(m.stride), "bias": m.bias is not None}
    if isinstance(m, nn.BatchNorm2d):
        return {"c": m.num_features}
    if isinstance(m, nn.Linear):
        return {"c1": m.in_features, "c2": m.out_features, "bias": m.bias is not None}
    if isinstance(m, nn.MaxPool2d):
        return {"k": m.kernel_size, "s": m.stride, "p": m.padding}
    if isinstance(m, nn.Upsample):
        return {"scale": m.scale_factor, "mode": m.mode}
    if isinstance(m, (nn.AdaptiveAvgPool2d,)):
        return {"out": m.output_size}
    if isinstance(m, nn.Dropout):
        return {"p": m.p}
    return {}


def build_tree(m, name: str, rec: dict, shared: set[int]) -> dict:
    own = sum(p.numel() for p in m.parameters(recurse=False))
    node = {"name": name, "type": type(m).__name__}
    attrs = leaf_attrs(m)
    if attrs:
        node["attrs"] = attrs
    if own:
        node["ownParams"] = own
    r = rec.get(id(m))
    if id(m) in shared:
        # one module object reused in many places (e.g. the default SiLU): its shape is not per-position
        node["shared"] = True
    elif r:
        node["out"] = r["out"]
        if r["calls"] > 1:
            node["calls"] = r["calls"]
    kids = [build_tree(c, n, rec, shared) for n, c in m.named_children()]
    if kids:
        node["children"] = kids
    return node


def flatten_thop(info: dict | None) -> dict:
    """thop ret_layer_info -> {child_name: ops} for the top level."""
    return {k: v[0] for k, v in (info or {}).items()}


def extract_one(version: str, task: str, scale: str, model_name: str, yaml_rel: str, src: dict) -> dict:
    import torch
    import thop
    import ultralytics
    from ultralytics import YOLO
    from ultralytics.utils.torch_utils import get_flops

    imgsz = 224 if task == "classify" else 640
    with contextlib.redirect_stdout(io.StringIO()):
        yolo = YOLO(model_name, task=task)
    model = yolo.model
    model.eval()
    seq = model.model

    # ---- hooks on every module: first output shape + call count
    rec: dict[int, dict] = {}
    handles = []

    def hook(mod, _inp, out):
        r = rec.setdefault(id(mod), {"calls": 0, "out": None})
        if r["calls"] == 0:
            r["out"] = shape_of(out)
        r["calls"] += 1

    for mod in seq.modules():
        handles.append(mod.register_forward_hook(hook))
    im = torch.zeros(1, 3, imgsz, imgsz)
    with torch.no_grad():
        model(im)
    for h in handles:
        h.remove()

    # ---- raw (training-mode) head output, i.e. the per-level maps before decoding
    head = seq[-1]
    train_out = {}

    def head_hook(_m, _i, out):
        train_out["v"] = shape_of(out)

    h = head.register_forward_hook(head_hook)
    model.train()
    with torch.no_grad():
        model(im)
    model.eval()
    h.remove()

    # ---- FLOPs: thop per-layer at full size, plus Ultralytics' official total
    with contextlib.redirect_stdout(io.StringIO()):
        total_ops, _p, info = thop.profile(model, inputs=[torch.zeros(1, 3, imgsz, imgsz)], verbose=False, ret_layer_info=True)
    model_info = info.get("model", (0, 0, {}))[2] if "model" in info else {}
    per_layer_ops = flatten_thop(model_info)
    gflops = get_flops(model, imgsz)

    seen: dict[int, int] = {}
    for _n, mod in seq.named_modules(remove_duplicate=False):
        seen[id(mod)] = seen.get(id(mod), 0) + 1
    shared = {k for k, c in seen.items() if c > 1}

    yaml_cfg = model.yaml
    layers = []
    for m in seq:
        i = m.i
        raw = (yaml_cfg["backbone"] + yaml_cfg["head"])[i]
        layers.append({
            "index": i,
            "from": m.f,
            "repeats": raw[1],
            "module": raw[2],
            "yamlArgs": raw[3],
            "type": m.type,
            "outShape": rec.get(id(m), {}).get("out"),
            "params": sum(p.numel() for p in m.parameters()),
            "flops": 2 * per_layer_ops.get(str(i), 0.0),
            "tree": build_tree(m, str(i), rec, shared),
        })
    total_params = sum(p.numel() for p in model.parameters())
    yaml_text = src["yaml_text"]
    return {
        "schemaVersion": 1,
        "version": version,
        "task": task,
        "scale": scale,
        "modelName": model_name,
        "inputSize": imgsz,
        "source": {
            "package": "ultralytics",
            "packageVersion": ultralytics.__version__,
            "repo": src["repo"],
            "commit": src.get("commit"),
            "file": f"ultralytics/cfg/models/{yaml_rel}",
            "yamlSha256": hashlib.sha256(yaml_text.encode()).hexdigest(),
        },
        "retrievedAt": dt.date.today().isoformat(),
        "yamlText": yaml_text,
        "config": {
            "nc": yaml_cfg.get("nc"),
            "scale": yaml_cfg.get("scale"),
            "depthMultiple": yaml_cfg.get("depth_multiple"),
            "widthMultiple": yaml_cfg.get("width_multiple"),
            "scales": yaml_cfg.get("scales"),
            "regMax": yaml_cfg.get("reg_max"),
            "end2end": yaml_cfg.get("end2end"),
            "kptShape": yaml_cfg.get("kpt_shape"),
        },
        "stride": [float(s) for s in getattr(model, "stride", [])],
        "totals": {
            "params": total_params,
            "gflops": round(gflops, 4),
            "thopGflops": round(2 * total_ops / 1e9, 4),
            "layers": len(layers),
        },
        "headTrainOut": train_out.get("v"),
        "layers": layers,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", action="append", help="version key, e.g. v8, 11, 26 (repeatable)")
    ap.add_argument("--all", action="store_true", help="all mainline versions (not v13; run that separately)")
    ap.add_argument("--task", action="append")
    ap.add_argument("--scale", action="append")
    ap.add_argument("--source-repo", default="https://github.com/ultralytics/ultralytics")
    ap.add_argument("--source-dir", help="git checkout the configs come from (records the commit)")
    args = ap.parse_args()

    import ultralytics

    versions = [v for v in VERSIONS if v != "13"] if args.all else (args.version or [])
    if not versions:
        ap.error("pass --version or --all")
    cfg_root = Path(ultralytics.__file__).parent / "cfg" / "models"
    commit = None
    if args.source_dir:
        commit = subprocess.run(["git", "-C", args.source_dir, "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()

    failures = 0
    for v in versions:
        for task, (yaml_rel, scales) in VERSIONS[v].items():
            if args.task and task not in args.task:
                continue
            for scale, name in scales.items():
                if args.scale and scale not in args.scale:
                    continue
                rel = yaml_rel if yaml_rel.endswith(".yaml") else f"{yaml_rel}/{name}"
                yaml_text = (cfg_root / rel).read_text()
                try:
                    fx = extract_one(v, task, scale, name, rel, {"repo": args.source_repo, "commit": commit, "yaml_text": yaml_text})
                except Exception as e:  # report and continue; a missing fixture fails the TS tests loudly
                    failures += 1
                    print(f"FAIL {v} {task} {scale}: {type(e).__name__}: {e}", file=sys.stderr)
                    continue
                out = OUT_DIR / v / f"{task}-{scale}.json"
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_text(json.dumps(fx, separators=(",", ":")))
                t = fx["totals"]
                print(f"ok {v:>3} {task:<8} {scale}  layers={t['layers']:<3} params={t['params']:>11,}  GFLOPs={t['gflops']:.1f}  ({out.stat().st_size // 1024} KB)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
