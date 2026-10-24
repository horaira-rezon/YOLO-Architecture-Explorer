import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

import { beforeAll } from "vitest";
import { loadContent } from "./lib/content";

beforeAll(async () => {
  await loadContent();
});
