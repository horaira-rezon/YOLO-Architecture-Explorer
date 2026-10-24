import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

export function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Switch theme for this visit only: the site always opens in the light theme. */
export function setTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}


function subscribe(cb: () => void): () => void {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

/** Current theme, updating when the `dark` class changes. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => "light");
}
