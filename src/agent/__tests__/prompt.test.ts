import { describe, test, expect } from "bun:test";
import { buildSystemPrompt, systemPrompt, pickModelProfile, type PromptContext } from "../prompt.ts";
import type { InstructionBlock } from "../../context.ts";

// Normalize cwd, OS and date (they change across machine/day) for a snapshot that is
// stable over time AND portable across platforms — otherwise CI (linux) never matches a
// snapshot recorded on macOS (darwin), which kept the publish workflow permanently red.
function normalize(text: string): string {
  return text
    .replaceAll(process.cwd(), "<CWD>")
    .replace(/OS: \w+/, "OS: <OS>")
    .replace(/Date: \d{4}-\d{2}-\d{2}/, "Date: <TODAY>");
}

describe("buildSystemPrompt (iter 32, composable sections)", () => {
  test("snapshot build mode, without instructions/skills", () => {
    const ctx: PromptContext = { mode: "build" };
    expect(normalize(buildSystemPrompt(ctx))).toMatchSnapshot();
  });

  test("snapshot plan mode, without instructions/skills", () => {
    const ctx: PromptContext = { mode: "plan" };
    expect(normalize(buildSystemPrompt(ctx))).toMatchSnapshot();
  });

  test("snapshot build mode, with instructions and skills", () => {
    const instructions: InstructionBlock[] = [
      { source: "/repo/AGENTS.md", content: "Usa sempre TypeScript strict." },
    ];
    const ctx: PromptContext = {
      mode: "build",
      instructions,
      skills: "- `git-commit`: Conventional commits",
    };
    expect(normalize(buildSystemPrompt(ctx))).toMatchSnapshot();
  });

  test("empty sections don't leave orphan tags", () => {
    const out = buildSystemPrompt({ mode: "build" });
    expect(out).not.toContain("<instructions>");
    expect(out).not.toContain("<available_skills>");
  });

  test("instructions/skills present produce the corresponding tags", () => {
    const out = buildSystemPrompt({
      mode: "plan",
      instructions: [{ source: "/repo/AGENTS.md", content: "regola X" }],
      skills: "- `foo`: bar",
    });
    expect(out).toContain("<instructions>");
    expect(out).toContain("<available_skills>");
  });

  test("mode selects the right rules", () => {
    expect(buildSystemPrompt({ mode: "build" })).toContain("Use edit for small changes");
    expect(buildSystemPrompt({ mode: "plan" })).toContain("You are running in Plan mode");
  });

  test("systemPrompt() remains an equivalent wrapper for buildSystemPrompt", () => {
    // Without cachedInstructions/skillsSummary populated (module initial state),
    // systemPrompt(mode) must produce the same output as buildSystemPrompt({mode}).
    expect(systemPrompt("build")).toBe(buildSystemPrompt({ mode: "build", instructions: [] }));
    expect(systemPrompt("plan")).toBe(buildSystemPrompt({ mode: "plan", instructions: [] }));
  });

  test("verify section (iter 36): present only in build, absent in plan", () => {
    const build = buildSystemPrompt({ mode: "build" });
    const plan = buildSystemPrompt({ mode: "plan" });
    expect(build).toContain("run the real path");
    expect(build).toContain("Don't declare the task done without evidence");
    expect(plan).not.toContain("run the real path");
  });
});

describe("pickModelProfile (iter 33, model family prompts)", () => {
  test("Claude models → anthropic profile", () => {
    expect(pickModelProfile("claude-sonnet-5").id).toBe("anthropic");
    expect(pickModelProfile("claude-opus-4-8").id).toBe("anthropic");
    expect(pickModelProfile("CLAUDE-Sonnet-4-6").id).toBe("anthropic"); // case-insensitive
  });

  test("non-Claude models → default profile", () => {
    expect(pickModelProfile("deepseek-v4-pro").id).toBe("default");
    expect(pickModelProfile("gpt-5.5").id).toBe("default");
    expect(pickModelProfile("glm-5.2").id).toBe("default");
    expect(pickModelProfile("kimi-k2.7-code").id).toBe("default");
  });
});

describe("modelProfileSection in the assembled prompt (iter 33)", () => {
  test("snapshot anthropic × build", () => {
    expect(normalize(buildSystemPrompt({ mode: "build", model: "claude-opus-4-8" }))).toMatchSnapshot();
  });

  test("snapshot anthropic × plan", () => {
    expect(normalize(buildSystemPrompt({ mode: "plan", model: "claude-opus-4-8" }))).toMatchSnapshot();
  });

  test("snapshot default (deepseek) × build", () => {
    expect(normalize(buildSystemPrompt({ mode: "build", model: "deepseek-v4-pro" }))).toMatchSnapshot();
  });

  test("with a Claude model, the prompt includes the anthropic profile", () => {
    const out = buildSystemPrompt({ mode: "build", model: "claude-opus-4-8" });
    expect(out).toContain("Model note: you follow instructions very literally");
  });

  test("with a non-Claude model, no profile note (default is empty)", () => {
    const out = buildSystemPrompt({ mode: "build", model: "deepseek-v4-pro" });
    expect(out).not.toContain("Model note:");
  });

  test("without model in context, no profile (unchanged behavior)", () => {
    const out = buildSystemPrompt({ mode: "build" });
    expect(out).not.toContain("Model note:");
  });

  test("the rest of the prompt doesn't change in the presence of the profile (just one extra section)", () => {
    const withProfile = buildSystemPrompt({ mode: "build", model: "claude-opus-4-8" });
    const withoutProfile = buildSystemPrompt({ mode: "build" });
    expect(withProfile).toContain("Rules:");
    expect(withoutProfile).toContain("Rules:");
    expect(withProfile.length).toBeGreaterThan(withoutProfile.length);
  });
});
