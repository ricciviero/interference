import { describe, test, expect } from "bun:test";
import { tokenizeLine, normalizeLang } from "../syntax.ts";

describe("syntax tokenizer (iter 22)", () => {
  test("classifies keyword / string / number / comment", () => {
    const toks = tokenizeLine('const x = "a" // c', "ts");
    const byColor = Object.fromEntries(toks.filter((t) => t.color).map((t) => [t.text, t.color]));
    expect(byColor["const"]).toBe("cyan");
    expect(byColor['"a"']).toBe("green");
    expect(byColor["// c"]).toBe("gray");
  });

  test("numbers are magenta", () => {
    const toks = tokenizeLine("const n = 42", "ts");
    expect(toks.find((t) => t.text === "42")?.color).toBe("magenta");
  });

  test("python uses # comments", () => {
    const toks = tokenizeLine("x = 1 # note", "py");
    expect(toks.find((t) => t.text === "# note")?.color).toBe("gray");
  });

  test("unknown lang → single plain token", () => {
    expect(tokenizeLine("anything here", "")).toEqual([{ text: "anything here" }]);
  });

  test("normalizeLang maps aliases", () => {
    expect(normalizeLang("typescript")).toBe("ts");
    expect(normalizeLang("PYTHON")).toBe("py");
    expect(normalizeLang("bash")).toBe("sh");
    expect(normalizeLang("rust")).toBe("");
  });
});
