import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { LandingPage } from "./pages/LandingPage";
import { VersionPickerPage } from "./pages/VersionPickerPage";
import { ExplorerPage } from "./pages/ExplorerPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ComparePage } from "./pages/ComparePage";
import { NotFoundPage } from "./pages/NotFoundPage";

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <NotFoundPage />,
    children: [
      { path: "/", element: <LandingPage /> },
      { path: "/versions/:task", element: <VersionPickerPage /> },
      { path: "/explore/:version/:task/:scale?", element: <ExplorerPage mode="explore" /> },
      { path: "/lab/:version/:task/:scale?", element: <ExplorerPage mode="lab" /> },
      { path: "/compare/:task?", element: <ComparePage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
