import { useEffect, useRef, useState } from "react";
import type { Architecture } from "@yolo-atlas/core";
import { useAtlas } from "../store/atlas";
import { replaceArch } from "../store/lab";
import { persist } from "./persist";

interface Saved {
  savedAt: string;
  arch: Architecture;
}

/** Lab autosave to IndexedDB, and an offer to continue saved work when the Lab opens. */
export function useAutosave(enabled: boolean, modelKey: string): { savedAt: string; restore(): void; discard(): void } | null {
  const arch = useAtlas((s) => s.arch);
  const pastLen = useAtlas((s) => s.past.length);
  const [offer, setOffer] = useState<Saved | null>(null);
  const checked = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || checked.current === modelKey) return;
    checked.current = modelKey;
    void persist.get<Saved>(`lab:${modelKey}`).then((s) => {
      const cur = useAtlas.getState().arch;
      if (s && cur && JSON.stringify(s.arch.nodes) !== JSON.stringify(cur.nodes)) setOffer(s);
    });
  }, [enabled, modelKey]);

  useEffect(() => {
    if (!enabled || !arch || pastLen === 0) return;
    const t = setTimeout(() => void persist.set(`lab:${modelKey}`, { savedAt: new Date().toISOString(), arch }), 600);
    return () => clearTimeout(t);
  }, [enabled, arch, pastLen, modelKey]);

  if (!offer) return null;
  return {
    savedAt: offer.savedAt,
    restore: () => {
      replaceArch(offer.arch, "Continue saved Lab work");
      setOffer(null);
    },
    discard: () => {
      void persist.del(`lab:${modelKey}`);
      setOffer(null);
    },
  };
}
