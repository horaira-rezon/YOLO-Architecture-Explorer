import { useEffect } from "react";
import { useAtlas } from "../store/atlas";

function typing(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

/**
 * Explorer keys: arrows walk along connections (→/↓ next, ←/↑ previous), Enter looks inside,
 * Escape steps back out, "/" or Ctrl/Cmd-K opens search.
 */
export function useKeyboardNav(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useAtlas.getState();
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        st.setPaletteOpen(true);
        return;
      }
      if (typing(e.target) || st.paletteOpen) return;
      if (e.key === "/") {
        e.preventDefault();
        st.setPaletteOpen(true);
        return;
      }
      const { arch, computed, selectedId, inside } = st;
      if (!arch || !computed) return;
      if (e.key === "Escape") {
        if (inside?.selected) st.insideSelect(null);
        else if (inside?.path) st.enter(inside.nodeId, inside.path.split(".").slice(0, -1).join("."));
        else if (inside) st.exitInside();
        else if (st.walk.active) st.setWalk({ active: false, playing: false });
        else st.select(null);
        return;
      }
      if (inside) return;
      const live = arch.nodes.filter((n) => n.origin !== "removed-ghost");
      const cur = live.find((n) => n.id === selectedId);
      let next: string | undefined;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        if (!cur) next = live[0]?.id;
        else {
          const outs = (computed.consumers[cur.id] ?? []).slice().sort((a, b) => (computed.nodes[a]?.index ?? 0) - (computed.nodes[b]?.index ?? 0));
          next = outs[0];
        }
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        next = cur ? cur.from[0] : live[live.length - 1]?.id;
      } else if (e.key === "Enter" && cur) {
        e.preventDefault();
        st.enter(cur.id);
        return;
      } else return;
      e.preventDefault();
      if (next) {
        st.select(next);
        st.centerOn(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
