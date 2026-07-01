import { describe, test, expect } from "bun:test";
import { isNewer, CURRENT_VERSION } from "../version.ts";
import { dispatch } from "../commands/index.ts";

describe("version / update (iter 28)", () => {
  test("isNewer compares semver correctly", () => {
    expect(isNewer("0.2.0", "0.1.0")).toBe(true);
    expect(isNewer("1.0.0", "0.9.9")).toBe(true);
    expect(isNewer("0.1.1", "0.1.0")).toBe(true);
    expect(isNewer("0.1.0", "0.1.0")).toBe(false);
    expect(isNewer("0.1.0", "0.2.0")).toBe(false);
    expect(isNewer("v0.3.0", "0.2.9")).toBe(true); // tolerates v prefix
  });

  test("CURRENT_VERSION matches package.json", async () => {
    const pkg = await Bun.file(new URL("../../package.json", import.meta.url)).json();
    expect(CURRENT_VERSION).toBe(pkg.version);
  });

  test("/version command returns the version", async () => {
    const out = await dispatch("/version", {});
    expect(out).toBe(`interference v${CURRENT_VERSION}`);
  });
});
