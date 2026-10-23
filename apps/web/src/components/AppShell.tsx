import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Moon, Settings, Sun } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ReadingLevelSwitch } from "./ReadingLevelSwitch";
import { currentTheme, setTheme, type Theme } from "../lib/theme";

export function AppShell() {
  const [theme, setThemeState] = useState<Theme>(() => currentTheme());
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };
  return (
    <Tooltip.Provider delayDuration={250}>
    <div className="flex h-full flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-border bg-surface px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <img src="/favicon.svg" alt="" className="h-6 w-6" />
          YOLO Atlas
        </Link>
        <div className="ml-auto hidden sm:block"><ReadingLevelSwitch compact /></div>
        <nav className="flex items-center gap-1 text-sm" aria-label="Main">
          <NavLink to="/" end className={({ isActive }) => `rounded px-2 py-1 ${isActive ? "bg-surface-2" : "hover:bg-surface-2"}`}>
            Tasks
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `flex items-center gap-1 rounded px-2 py-1 ${isActive ? "bg-surface-2" : "hover:bg-surface-2"}`}>
            <Settings size={16} aria-hidden /> Settings
          </NavLink>
          <button type="button" onClick={toggle} className="rounded p-2 hover:bg-surface-2" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </nav>
      </header>
      <main id="main" className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
    </Tooltip.Provider>
  );
}
