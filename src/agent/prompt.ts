import { loadInstructions, formatInstructionBlock, type InstructionBlock } from "../context.ts";
import { loadSkillRegistry, bootstrapSkills } from "../skills.ts";
import { ANTHROPIC_PROFILE } from "./prompts/anthropic.ts";
import { DEFAULT_PROFILE } from "./prompts/default.ts";

let cachedInstructions: InstructionBlock[] | null = null;
let skillsSummary: string | null = null;

export async function initInstructions(): Promise<InstructionBlock[]> {
  cachedInstructions = await loadInstructions();
  const registry = await loadSkillRegistry();
  if (registry.length > 0) {
    skillsSummary = "Available skills (use /<name> or trigger by description):\n" +
      registry.map((s) => `- \`${s.name}\`: ${s.description}`).join("\n");
  }
  return cachedInstructions;
}

/** Context for assembling the system prompt. Extensible (agent/model, it. 33/34)
 *  without breaking the signature of `buildSystemPrompt`. */
export interface PromptContext {
  mode: "plan" | "build";
  instructions?: InstructionBlock[];
  skills?: string;
  /** Current model id — selects the family profile (it. 33). Absent → no profile. */
  model?: string;
}

export interface ModelProfile {
  id: string;
  text: string;
}

/** Model family detection (same logic as coding agents that use includes() on the id).
 *  Initial families: anthropic (Claude follows the prompt very literally,
 *  see skill claude-api) + default (fallback for deepseek/glm/kimi/openai). */
export function pickModelProfile(modelId: string): ModelProfile {
  const m = modelId.toLowerCase();
  if (m.includes("claude")) return ANTHROPIC_PROFILE;
  return DEFAULT_PROFILE;
}

function identitySection(): string {
  return "You are interference, an AI coding agent running in the user's terminal.";
}

function environmentSection(): string {
  return `<environment>
Working directory: ${process.cwd()}
OS: ${process.platform}
Date: ${new Date().toISOString().split("T")[0]}
</environment>`;
}

/** Includes leading/trailing newline to stay compatible with the assembly in `buildSystemPrompt`. */
function instructionsSection(ctx: PromptContext): string {
  const blocks = ctx.instructions ?? [];
  if (blocks.length === 0) return "";
  return "\n<instructions>\n" + blocks.map(formatInstructionBlock).join("\n\n") + "\n</instructions>\n";
}

function skillsSection(ctx: PromptContext): string {
  return ctx.skills ? "\n<available_skills>\n" + ctx.skills + "\n</available_skills>\n" : "";
}

function toolsNoteSection(): string {
  return `Your available tools are provided via the API's tool schemas (name, description,
parameters) — that is the source of truth for what each tool does and how to call it.`;
}

const BUILD_RULES = `Rules:
- Be concise and precise. Prefer short, direct answers; expand only when asked.
- Use edit for small changes, write only for new files or complete rewrites.
- Before using bash, explain what the command will do.
- After editing a file, the user may need to approve the change.
- When a task has multiple steps, keep working through them with your tools until it is fully done; do not stop midway to hand back a plan.
- When you are unsure, say so instead of guessing.
- Never use emojis in responses.
- Format code in fenced blocks with the right language tag.`;

const PLAN_RULES = `You are running in Plan mode (read-only). You cannot modify files or execute commands.
- Be concise and precise. Prefer short, direct answers; expand only when asked.
- When exploring the codebase: use ls/glob to map structure, grep to find code, read to inspect.
- Answer with specific file:line references.
- When you are unsure, say so instead of guessing.
- Never use emojis in responses.
- Format code in fenced blocks with the right language tag.`;

function rulesSection(ctx: PromptContext): string {
  return ctx.mode === "build" ? BUILD_RULES : PLAN_RULES;
}

// Cross-cutting discipline applied to every Build turn (not an isolated task → a section in the base
// prompt, not an agent, unlike `review` which is invocable on-demand). Distilled from
// verify + completeness pass (§6.8 of CLAUDE.md).
const VERIFY_TEXT = `After making changes: run the real path (test/build/run it), don't just read the code back.
Re-read the diff looking for bugs, security issues, and over-engineering.
Don't declare the task done without evidence (output/test), and say so if you couldn't verify.`;

/** Only in Build: the "verify before claiming done" discipline does not apply in
 *  Plan (read-only, no changes to verify). */
function verifySection(ctx: PromptContext): string {
  return ctx.mode === "build" ? VERIFY_TEXT : "";
}

/** Family profile text for the current model. Empty for `default` (no specific
 *  notes emerged) → no section added, no bloat for most providers. */
function modelProfileSection(ctx: PromptContext): string {
  return ctx.model ? pickModelProfile(ctx.model).text : "";
}

/** Assembles the system prompt from named sections. Adding/removing a section is
 *  a local change to this function (nothing else touches the final string). */
export function buildSystemPrompt(ctx: PromptContext): string {
  const verify = verifySection(ctx);
  const profile = modelProfileSection(ctx);
  return (
    identitySection() +
    "\n\n" +
    environmentSection() +
    instructionsSection(ctx) +
    skillsSection(ctx) +
    "\n" +
    toolsNoteSection() +
    "\n" +
    (profile ? profile + "\n" : "") +
    rulesSection(ctx) +
    (verify ? "\n\n" + verify : "")
  );
}

export function systemPrompt(
  mode: "plan" | "build",
  instructions?: InstructionBlock[],
  model?: string,
): string {
  return buildSystemPrompt({
    mode,
    instructions: instructions ?? cachedInstructions ?? [],
    skills: skillsSummary ?? undefined,
    model,
  });
}
