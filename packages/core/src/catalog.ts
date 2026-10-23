import type { Confidence, Task } from "./schema";

/**
 * Version catalogue. Every statement here comes from an official page or paper listed in `sources`
 * (checked 2026-10-23). Plain-language summaries paraphrase those sources; numbers are never added here.
 */

export interface SourceLink {
  label: string;
  url: string;
}

export interface TaskSupport {
  supported: boolean;
  /** Shown on hover when the task is greyed out (or as a caveat when supported). */
  note?: string;
}

export interface VersionInfo {
  id: string;
  label: string;
  status: "released" | "announced";
  /** ISO date or month as stated by the source. */
  released: string;
  year: number;
  org: string;
  authors: string[];
  bigIdea: { eli5: string; simple: string; engineer: string };
  keyBlocks: string[];
  /** Training-only ideas that do not appear in the inference graph. */
  trainingOnly: string[];
  tasks: Record<Task, TaskSupport>;
  /** Scale letters per task, in display order. */
  scales: string[];
  defaultScale: string;
  confidence: Confidence;
  sources: SourceLink[];
  notes: string[];
}

const allTasks = (note?: string): Record<Task, TaskSupport> => ({
  detect: { supported: true },
  segment: { supported: true, note },
  pose: { supported: true, note },
  classify: { supported: true, note },
  obb: { supported: true, note },
});

const only = (supported: Task[], why: string): Record<Task, TaskSupport> => {
  const tasks = ["detect", "segment", "pose", "classify", "obb"] as Task[];
  return Object.fromEntries(tasks.map((t) => [t, supported.includes(t) ? { supported: true } : { supported: false, note: why }])) as Record<Task, TaskSupport>;
};

export const VERSIONS: VersionInfo[] = [
  {
    id: "v8",
    label: "YOLOv8",
    status: "released",
    released: "2023-01-10",
    year: 2023,
    org: "Ultralytics",
    authors: ["Glenn Jocher", "Ayush Chaurasia", "Jing Qiu"],
    bigIdea: {
      eli5: "One picture goes in, and the model looks at it at three sizes to find big, medium and small things. It guesses boxes without needing ready-made box shapes.",
      simple: "YOLOv8 uses C2f blocks in the backbone and neck and an anchor-free, split head: one branch finds where the box is, another says what it is.",
      engineer: "CSP-style backbone with C2f, SPPF, PAN-FPN neck, and a decoupled anchor-free head with DFL box regression; trained with TAL assignment and BCE + CIoU + DFL losses.",
    },
    keyBlocks: ["Conv", "C2f", "SPPF", "Upsample", "Concat", "Detect"],
    trainingOnly: ["TAL assigner", "BCE + CIoU + DFL losses"],
    tasks: allTasks(),
    scales: ["n", "s", "m", "l", "x"],
    defaultScale: "n",
    confidence: "verified",
    sources: [
      { label: "Ultralytics YOLOv8 docs", url: "https://docs.ultralytics.com/models/yolov8/" },
      { label: "ultralytics/cfg/models/v8", url: "https://github.com/ultralytics/ultralytics/tree/main/ultralytics/cfg/models/v8" },
    ],
    notes: ["Ultralytics has not published a formal paper for YOLOv8."],
  },
  {
    id: "v9",
    label: "YOLOv9",
    status: "released",
    released: "2024-02",
    year: 2024,
    org: "Academia Sinica (Wang, Yeh, Liao)",
    authors: ["Chien-Yao Wang", "I-Hau Yeh", "Hong-Yuan Mark Liao"],
    bigIdea: {
      eli5: "Deep networks can forget details as the picture passes through many steps. YOLOv9 adds helpers while learning so the important details are not lost.",
      simple: "YOLOv9 brings GELAN, a flexible way to stack and merge blocks, and PGI, extra guidance during training that keeps useful information from fading in deep layers.",
      engineer: "GELAN (RepNCSPELAN4 blocks, ADown downsampling, SPPELAN) for parameter-efficient aggregation; Programmable Gradient Information adds an auxiliary reversible branch to counter the information bottleneck.",
    },
    keyBlocks: ["RepNCSPELAN4", "ADown", "SPPELAN", "CBLinear", "CBFuse"],
    trainingOnly: ["PGI auxiliary supervision (as described in the paper)"],
    tasks: only(["detect", "segment"], "Ultralytics ships YOLOv9 configs only for detection and segmentation."),
    scales: ["t", "s", "m", "c", "e"],
    defaultScale: "t",
    confidence: "verified",
    sources: [
      { label: "Ultralytics YOLOv9 docs", url: "https://docs.ultralytics.com/models/yolov9/" },
      { label: "Paper (arXiv 2402.13616)", url: "https://arxiv.org/abs/2402.13616" },
    ],
    notes: [
      "Segmentation configs exist only for the c and e sizes.",
      "The YOLOv9-e config contains a second, linked backbone (CBLinear/CBFuse). It is part of the inference graph in the Ultralytics config.",
    ],
  },
  {
    id: "v10",
    label: "YOLOv10",
    status: "released",
    released: "2024-05",
    year: 2024,
    org: "Tsinghua University",
    authors: ["Ao Wang", "Hui Chen", "Lihao Liu", "Kai Chen", "Zijia Lin", "Jungong Han", "Guiguang Ding"],
    bigIdea: {
      eli5: "Older models make many guesses for the same thing and then throw extras away. YOLOv10 learns to make just one guess per thing, so that clean-up step is not needed.",
      simple: "YOLOv10 trains two copies of the head: one-to-many for strong learning and one-to-one for use at the end. Because each object gets one answer, NMS is not needed at inference.",
      engineer: "Consistent dual assignments (one-to-many + one-to-one heads) for NMS-free inference, plus efficiency/accuracy-driven design: lightweight classification head, spatial-channel decoupled downsampling (SCDown), rank-guided compact inverted blocks (C2fCIB), large-kernel convs and partial self-attention (PSA).",
    },
    keyBlocks: ["SCDown", "C2fCIB", "PSA", "v10Detect"],
    trainingOnly: ["One-to-many head (supervises training only)", "Consistent dual assignment"],
    tasks: only(["detect"], "YOLOv10 is an object-detection model; no other task configs exist."),
    scales: ["n", "s", "m", "b", "l", "x"],
    defaultScale: "n",
    confidence: "verified",
    sources: [
      { label: "Ultralytics YOLOv10 docs", url: "https://docs.ultralytics.com/models/yolov10/" },
      { label: "Paper (arXiv 2405.14458)", url: "https://arxiv.org/abs/2405.14458" },
    ],
    notes: ["Published at NeurIPS 2024."],
  },
  {
    id: "11",
    label: "YOLO11",
    status: "released",
    released: "2024-09-27",
    year: 2024,
    org: "Ultralytics",
    authors: [],
    bigIdea: {
      eli5: "YOLO11 keeps the same plan as YOLOv8 but uses smarter building blocks, so it does the same job with fewer pieces.",
      simple: "YOLO11 swaps C2f for the lighter C3k2 block, adds a C2PSA attention block at the end of the backbone, and uses depthwise convolutions in the class branch of the head.",
      engineer: "C3k2 (C2f with optional C3k inner blocks), C2PSA position-sensitive attention after SPPF, and a DWConv-based classification branch in the Detect head; same anchor-free DFL head and TAL training.",
    },
    keyBlocks: ["C3k2", "C2PSA", "SPPF", "Detect"],
    trainingOnly: ["TAL assigner", "BCE + CIoU + DFL losses"],
    tasks: allTasks(),
    scales: ["n", "s", "m", "l", "x"],
    defaultScale: "n",
    confidence: "verified",
    sources: [
      { label: "Ultralytics YOLO11 docs", url: "https://docs.ultralytics.com/models/yolo11/" },
      { label: "ultralytics/cfg/models/11", url: "https://github.com/ultralytics/ultralytics/tree/main/ultralytics/cfg/models/11" },
    ],
    notes: ["Ultralytics has not published a formal paper for YOLO11. Block names come from the official config files."],
  },
  {
    id: "12",
    label: "YOLO12",
    status: "released",
    released: "2025-02",
    year: 2025,
    org: "University at Buffalo & University of Chinese Academy of Sciences",
    authors: ["Yunjie Tian", "Qixiang Ye", "David Doermann"],
    bigIdea: {
      eli5: "YOLO12 lets each part of the picture look at other parts (attention), but only inside a few big strips, so it stays fast.",
      simple: "YOLO12 is built around attention. Area attention splits the feature map into a few equal regions and runs attention inside each, and R-ELAN blocks add scaled shortcuts for stable training.",
      engineer: "Attention-centric design: A2C2f blocks (R-ELAN with block-level scaled residuals) containing area attention (feature map split into l regions, default 4), a 7×7 depthwise 'position perceiver' instead of positional encoding, and MLP ratio 1.2–2.",
    },
    keyBlocks: ["A2C2f", "C3k2", "Detect"],
    trainingOnly: ["TAL assigner", "BCE + CIoU + DFL losses"],
    tasks: allTasks("Ultralytics provides config files for this task but no pretrained weights."),
    scales: ["n", "s", "m", "l", "x"],
    defaultScale: "n",
    confidence: "verified",
    sources: [
      { label: "Ultralytics YOLO12 docs", url: "https://docs.ultralytics.com/models/yolo12/" },
      { label: "Paper (arXiv 2502.12524)", url: "https://arxiv.org/abs/2502.12524" },
    ],
    notes: [
      "Ultralytics notes YOLO12 may show training instability, higher memory use and slower CPU speed, and recommends YOLO11 or YOLO26 for most production work.",
      "Published at NeurIPS 2025.",
    ],
  },
  {
    id: "13",
    label: "YOLOv13",
    status: "released",
    released: "2025-06-21",
    year: 2025,
    org: "iMoonLab",
    authors: ["Mengqi Lei", "Siqi Li", "Yihong Wu", "Han Hu", "You Zhou", "Xinhu Zheng", "Guiguang Ding", "Shaoyi Du", "Zongze Wu", "Yue Gao"],
    bigIdea: {
      eli5: "YOLOv13 lets groups of pixels from different sizes of the picture talk to each other at once, then hands that shared knowledge to every part of the model.",
      simple: "HyperACE links pixels from several feature maps through a hypergraph to find group relationships. FullPAD then sends the improved features through three 'tunnels' into the backbone-neck link, inside the neck, and into the head. Depthwise-separable blocks keep it light.",
      engineer: "Hypergraph-based Adaptive Correlation Enhancement (learnable hyperedges over multi-scale pixels, linear-complexity message passing), Full-Pipeline Aggregation-and-Distribution (three FullPAD tunnels), and DSConv / DS-C3k2 lightweight blocks.",
    },
    keyBlocks: ["HyperACE", "FullPAD_Tunnel", "DSC3k2", "DSConv", "A2C2f", "DownsampleConv"],
    trainingOnly: ["TAL assigner", "BCE + CIoU + DFL losses"],
    tasks: only(["detect"], "The official YOLOv13 repository only ships an object-detection config."),
    scales: ["n", "s", "l", "x"],
    defaultScale: "n",
    confidence: "verified",
    sources: [
      { label: "Official repo (iMoonLab/yolov13)", url: "https://github.com/iMoonLab/yolov13" },
      { label: "Paper (arXiv 2506.17733)", url: "https://arxiv.org/abs/2506.17733" },
    ],
    notes: ["Not part of the mainline Ultralytics package; the official code is an Ultralytics fork."],
  },
  {
    id: "26",
    label: "YOLO26",
    status: "released",
    released: "2026-01",
    year: 2026,
    org: "Ultralytics",
    authors: ["Glenn Jocher", "Jing Qiu", "Mengyu Liu", "Shuai Lyu", "Fatih Cagatay Akyon", "Muhammet Esat Kalfaoglu"],
    bigIdea: {
      eli5: "YOLO26 is built to run on small devices. It removes a tricky part of the box math and can give final answers directly, without a clean-up step.",
      simple: "YOLO26 drops DFL (simpler box outputs), can run end-to-end without NMS through a one-to-one head, and changes training with Progressive Loss, STAL (better labels for small objects) and the MuSGD optimizer.",
      engineer: "reg_max = 1 (DFL removed), dual one-to-many / one-to-one heads with native end-to-end inference, Progressive Loss shifting emphasis to the inference head, Small-Target-Aware Label Assignment, MuSGD (SGD + Muon); task-specific heads (multi-scale Proto26 with semantic loss, RLE pose, angle loss for OBB).",
    },
    keyBlocks: ["C3k2", "C2PSA", "SPPF", "Detect (no DFL, end-to-end)"],
    trainingOnly: ["One-to-many head", "Progressive Loss", "STAL", "MuSGD optimizer"],
    tasks: allTasks(),
    scales: ["n", "s", "m", "l", "x"],
    defaultScale: "n",
    confidence: "verified",
    sources: [
      { label: "Ultralytics YOLO26 docs", url: "https://docs.ultralytics.com/models/yolo26/" },
      { label: "ultralytics/cfg/models/26", url: "https://github.com/ultralytics/ultralytics/tree/main/ultralytics/cfg/models/26" },
    ],
    notes: [
      "Ultralytics docs: both heads are always trained; end-to-end inference uses the one-to-one head without NMS, and the one-to-many head with NMS is also available.",
      "YOLO26 also has semantic-segmentation and depth configs; this app covers the five classic tasks.",
    ],
  },
  {
    id: "27",
    label: "YOLO27",
    status: "announced",
    released: "announced 2026",
    year: 2026,
    org: "Ultralytics",
    authors: [],
    bigIdea: {
      eli5: "YOLO27 has been announced but not released. Nobody outside Ultralytics can see its plan yet.",
      simple: "Ultralytics announced YOLO27 at YOLO Vision 2026. Configs, weights and code are not public, so there is no architecture to show.",
      engineer: "Announced (four sizes, NMS-free per the preview page); no configs or code released, so nothing can be verified.",
    },
    keyBlocks: [],
    trainingOnly: [],
    tasks: only([], "YOLO27 is not released yet; there is no public architecture."),
    scales: [],
    defaultScale: "",
    confidence: "draft",
    sources: [{ label: "Ultralytics YOLO27 preview", url: "https://docs.ultralytics.com/models/yolo27/" }],
    notes: ["Shown for completeness only. It will become explorable when official configs are published."],
  },
];

export function getVersion(id: string): VersionInfo | undefined {
  return VERSIONS.find((v) => v.id === id);
}

export const TASKS: { id: Task; label: string; short: string }[] = [
  { id: "detect", label: "Object detection", short: "Draw a box around each thing and name it." },
  { id: "segment", label: "Instance segmentation", short: "Colour the exact pixels of each thing." },
  { id: "pose", label: "Pose / keypoints", short: "Find body points like elbows and knees." },
  { id: "classify", label: "Image classification", short: "Say what the whole picture shows." },
  { id: "obb", label: "Oriented boxes (OBB)", short: "Boxes that can turn, for things seen from above." },
];
