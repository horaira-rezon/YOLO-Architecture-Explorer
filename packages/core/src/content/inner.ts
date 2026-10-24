/** Content ids to try for a type seen inside a block (L2/L3), most specific first. */
export function innerContentCandidates(type: string): string[] {
  const viewLike = /^(view|flatten|reshape|permute|transpose)|·(view|reshape|permute|transpose|softmax)/;
  const alias: Record<string, string> = { "mean+max": "mean", mean: "mean" };
  const prim = alias[type] ?? (viewLike.test(type) ? "view" : type);
  return [`prim-${prim}`, type];
}
