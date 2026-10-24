import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // "/" on Vercel; "/YOLO-Architecture-Explorer/" on GitHub Pages (set by the Pages workflow)
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), tailwindcss()],
  worker: { format: "es" },
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
  },
});
