import { describe, test, expect, afterEach } from "bun:test";
import { getAgent, listAgents, loadCustomAgents, resolveAgentModelOverride } from "../registry.ts";
import { setProvider, cheapModelFor, currentProviderId } from "../../config.ts";

afterEach(() => {
  loadCustomAgents(undefined);
  setProvider("deepseek");
});

describe("registry built-in (iter 34)", () => {
  test("explore: read-only, cheap model, thinking low", () => {
    const def = getAgent("explore");
    expect(def).not.toBeNull();
    expect(def!.mutating).toBe(false);
    expect(def!.model).toBe("cheap");
    expect(def!.thinking).toBe("low");
    expect(def!.tools.write).toBeUndefined();
    expect(def!.tools.bash).toBeUndefined();
    expect(def!.tools.todowrite).toBeUndefined();
    expect(def!.tools.question).toBeUndefined();
  });

  test("general: full tools, no model override", () => {
    const def = getAgent("general");
    expect(def).not.toBeNull();
    expect(def!.mutating).toBe(true);
    expect(def!.model).toBeUndefined();
    expect(def!.tools.write).toBeDefined();
    expect(def!.tools.bash).toBeDefined();
    // anti-recursion: subagents don't have the task tool
    expect((def!.tools as Record<string, unknown>).task).toBeUndefined();
  });

  test("review (iter 36): read-only, cheap model, thinking low, distilled prompt bug/security/simplicity", () => {
    const def = getAgent("review");
    expect(def).not.toBeNull();
    expect(def!.mutating).toBe(false);
    expect(def!.model).toBe("cheap");
    expect(def!.thinking).toBe("low");
    expect(def!.tools.write).toBeUndefined();
    expect(def!.tools.bash).toBeUndefined();
    expect(def!.tools.edit).toBeUndefined();
    expect(def!.tools.read).toBeDefined();
    expect(def!.tools.grep).toBeDefined();
    expect(def!.systemPrompt).toContain("Bug");
    expect(def!.systemPrompt).toContain("Security");
    expect(def!.systemPrompt).toContain("Simplicity");
    expect(def!.systemPrompt).toContain("READ-ONLY");
  });

  test("unknown agent returns null", () => {
    expect(getAgent("nonexistent")).toBeNull();
  });

  test("listAgents includes built-ins", () => {
    const names = listAgents().map((a) => a.name);
    expect(names).toContain("explore");
    expect(names).toContain("review");
    expect(names).toContain("general");
  });
});

describe("resolveAgentModelOverride (iter 34, declarative from AgentDef)", () => {
  test("explore resolves the ACTIVE provider's cheapModel", () => {
    setProvider("anthropic");
    const def = getAgent("explore")!;
    const override = resolveAgentModelOverride(def);
    expect(override).toEqual({
      provider: "anthropic",
      model: cheapModelFor("anthropic"),
      thinkingLevel: "low",
    });
  });

  test("general has no override (stays on the main model)", () => {
    const def = getAgent("general")!;
    expect(resolveAgentModelOverride(def)).toBeUndefined();
  });
});

describe("custom agents from interference.json#agents (iter 34)", () => {
  test("a custom is callable by name after loadCustomAgents", () => {
    loadCustomAgents([
      {
        name: "reviewer",
        description: "Reviews the diff for bugs and simplification opportunities",
        prompt: "You are a code reviewer. Report findings as file:line — issue — severity.",
        tools: "readonly",
        model: "cheap",
      },
    ]);

    const def = getAgent("reviewer");
    expect(def).not.toBeNull();
    expect(def!.mutating).toBe(false);
    expect(def!.model).toBe("cheap");
    expect(def!.systemPrompt).toContain("code reviewer");
    expect(def!.tools.write).toBeUndefined();

    const override = resolveAgentModelOverride(def!);
    expect(override).toEqual({
      provider: currentProviderId(),
      model: cheapModelFor(currentProviderId()),
      thinkingLevel: undefined,
    });
  });

  test("a custom can override a built-in by name", () => {
    loadCustomAgents([
      {
        name: "explore",
        description: "Explore custom override",
        prompt: "custom explore prompt",
        tools: "all",
      },
    ]);

    const def = getAgent("explore")!;
    expect(def.systemPrompt).toBe("custom explore prompt");
    expect(def.mutating).toBe(true); // "all" → mutating, different from the original built-in
  });

  test("loadCustomAgents(undefined) clears previous custom agents", () => {
    loadCustomAgents([{ name: "temp", description: "d", prompt: "p" }]);
    expect(getAgent("temp")).not.toBeNull();

    loadCustomAgents(undefined);
    expect(getAgent("temp")).toBeNull();
    // Built-ins remain intact.
    expect(getAgent("explore")).not.toBeNull();
  });
});
