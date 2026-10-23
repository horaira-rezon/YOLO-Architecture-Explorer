export function ExplorerPage({ mode }: { mode: "explore" | "lab" }) {
  return <div className="p-4"><h1 className="text-xl font-semibold">{mode === "lab" ? "Lab" : "Explorer"}</h1></div>;
}
