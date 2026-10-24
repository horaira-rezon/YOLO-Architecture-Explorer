import { Suspense, lazy, type ReactNode } from "react";
import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { LandingPage } from "./pages/LandingPage";
import { VersionPickerPage } from "./pages/VersionPickerPage";
import { NotFoundPage } from "./pages/NotFoundPage";

// heavy pages (diagram canvas, Lab, AI) load on demand so the landing page stays small
const ExplorerPage = lazy(() => import("./pages/ExplorerPage").then((m) => ({ default: m.ExplorerPage })));
const ComparePage = lazy(() => import("./pages/ComparePage").then((m) => ({ default: m.ComparePage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));

const page = (el: ReactNode) => (
  <Suspense fallback={<div className="flex h-full items-center justify-center text-muted" role="status">Loading…</div>}>{el}</Suspense>
);

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <NotFoundPage />,
    children: [
      { path: "/", element: <LandingPage /> },
      { path: "/versions/:task", element: <VersionPickerPage /> },
      { path: "/explore/:version/:task/:scale?", element: page(<ExplorerPage mode="explore" />) },
      { path: "/lab/:version/:task/:scale?", element: page(<ExplorerPage mode="lab" />) },
      { path: "/compare/:task?", element: page(<ComparePage />) },
      { path: "/settings", element: page(<SettingsPage />) },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
