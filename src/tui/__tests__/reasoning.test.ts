import { describe, test, expect } from "bun:test";
import { reasoningSummary } from "../reasoning.ts";

describe("reasoningSummary (iter 23)", () => {
  test("prima frase breve", () => {
    expect(reasoningSummary("Devo controllare i file. Poi rispondo.")).toBe("Devo controllare i file.");
  });

  test("strip markdown iniziale e cap a 60", () => {
    const long = "## " + "x".repeat(80);
    const out = reasoningSummary(long);
    expect(out.startsWith("x")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(61); // 60 + …
    expect(out.endsWith("…")).toBe(true);
  });

  test("salta righe vuote, prende la prima significativa", () => {
    expect(reasoningSummary("\n\n- Analizzo il loop")).toBe("Analizzo il loop");
  });

  test("testo vuoto → stringa vuota", () => {
    expect(reasoningSummary("   \n  ")).toBe("");
  });
});
