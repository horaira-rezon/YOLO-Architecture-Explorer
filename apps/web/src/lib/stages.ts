import { Boxes, Cpu, Filter, GraduationCap, Image, Network, type LucideIcon } from "lucide-react";
import type { Stage } from "@yolo-atlas/core";
import stagesContent from "@yolo-atlas/core/content/stages.json";

export interface StageStyle {
  color: string;
  icon: LucideIcon;
  /** Band fill pattern so stages differ without colour. */
  pattern: "none" | "dots" | "lines" | "cross" | "dash";
}

export const STAGE_STYLE: Record<Stage, StageStyle> = {
  input: { color: "var(--stage-input)", icon: Image, pattern: "none" },
  backbone: { color: "var(--stage-backbone)", icon: Cpu, pattern: "dots" },
  neck: { color: "var(--stage-neck)", icon: Network, pattern: "lines" },
  head: { color: "var(--stage-head)", icon: Boxes, pattern: "cross" },
  postprocess: { color: "var(--stage-postprocess)", icon: Filter, pattern: "none" },
  loss: { color: "var(--stage-loss)", icon: GraduationCap, pattern: "dash" },
};

export type StageContent = { title: string; summary: { eli5: string; simple: string; engineer: string } };
export const STAGE_CONTENT = stagesContent as Record<Stage, StageContent>;

