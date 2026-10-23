import { expect, it } from "vitest";
import { CORE_VERSION } from "../src";
it("exports a version", () => expect(CORE_VERSION).toBe("0.1.0"));
