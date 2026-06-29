import type { AgentMode, ThinkingLevel } from "../config.ts";
import { currentProvider, currentThinking, setThinking } from "../config.ts";
import { undo, redo } from "../session/snapshot.ts";
import { loadSkillBody, getCachedRegistry, type SkillInfo } from "../skills.ts";

export interface CommandInfo {
  name: string;
  description: string;
  delegate?: boolean;
  template?: string;
  isSkill?: boolean;
}

export type CommandHandler = (
  args: string,
  ctx: {
    setMode?: (m: AgentMode) => void;
    clearMessages?: () => void;
    doInit?: (args: string) => Promise<string>;
    doSkill?: (name: string, body: string) => Promise<string>;
    doSessions?: () => Promise<string>;
    doRename?: (name: string) => Promise<string>;
  },
) => string | void | Promise<string | void>;

const registry = new Map<string, CommandInfo>();
const handlers = new Map<string, CommandHandler>();

export function register(
  name: string,
  description: string,
  handler: CommandHandler,
  opts?: { delegate?: boolean; template?: string; isSkill?: boolean },
) {
  registry.set(name, { name, description, delegate: opts?.delegate, template: opts?.template });
  handlers.set(name, handler);
}

export function getCommand(name: string): CommandInfo | undefined {
  return registry.get(name);
}

export function listCommands(): CommandInfo[] {
  return [...registry.values()];
}

/** Comandi che matchano un filtro (nome o descrizione). Usato da CLI + autocomplete. */
export function matchCommands(filter: string): CommandInfo[] {
  const f = filter.toLowerCase();
  return listCommands().filter(
    (c) => c.name.includes(f) || c.description.toLowerCase().includes(f),
  );
}

export async function dispatch(
  input: string,
  ctx: Parameters<CommandHandler>[1],
): Promise<string | null> {
  const match = input.match(/^\/(\w+)(?:\s+(.*))?$/);
  if (!match) return null;

  const name = match[1]!;
  const args = match[2] ?? "";

  const handler = handlers.get(name);
  if (!handler) return `Unknown command: /${name}. Type /help for available commands.`;

  const result = await handler(args, ctx);
  return result ?? null;
}

export function isSlashCommand(input: string): boolean {
  return /^\//.test(input);
}

register("help", "Show available commands", () => {
  const lines = ["Available commands:"];
  for (const cmd of listCommands()) {
    lines.push(`  /${cmd.name.padEnd(8)} ${cmd.description}`);
  }
  return lines.join("\n");
});

register("clear", "Clear conversation history", (_args, ctx) => {
  ctx.clearMessages?.();
  return "Conversation cleared.";
});

register("plan", "Switch to Plan mode (read-only)", (_args, ctx) => {
  ctx.setMode?.("plan");
  return "Switched to Plan mode (read-only).";
});

register("build", "Switch to Build mode (full access)", (_args, ctx) => {
  ctx.setMode?.("build");
  return "Switched to Build mode (full access).";
});

register(
  "init",
  "Generate or update AGENTS.md for this project",
  (_args, ctx) => ctx.doInit?.(_args) ?? "Init command requires agent context.",
  { delegate: true },
);

register("model", "Change the model (usage: /model <model-id>)", (args, _ctx) => {
  if (!args.trim()) return "Usage: /model <model-id>\nCurrent model is set via INTERFERENCE_MODEL env var.";
  process.env.INTERFERENCE_MODEL = args.trim();
  return `Model set to '${args.trim()}' (effective on next turn).`;
});

register(
  "thinking",
  "Set reasoning/thinking level for the current model (usage: /thinking <level>)",
  (args) => {
    const p = currentProvider();
    const levels = p.thinkingLevels;
    const arg = args.trim().toLowerCase();
    if (!arg) {
      return (
        `Thinking: ${currentThinking()} · model: ${p.label}\n` +
        `Available levels: ${levels.join(", ")}\n` +
        `Usage: /thinking <level>`
      );
    }
    if (!levels.includes(arg as ThinkingLevel)) {
      return `Invalid level '${arg}' for ${p.label}. Available: ${levels.join(", ")}`;
    }
    setThinking(arg as ThinkingLevel);
    return `Thinking set to '${arg}' (effective next turn).`;
  },
);

register("undo", "Undo last file modifications", async () => {
  const files = await undo();
  if (files.length > 0) return `Undo: restored ${files.join(", ")}`;
  return "Nothing to undo.";
});

register("redo", "Redo previously undone file modifications", async () => {
  const files = await redo();
  if (files.length > 0) return `Redo: restored ${files.join(", ")}`;
  return "Nothing to redo.";
});

register("compact", "Compact conversation context to save tokens", () => {
  return "Compaction will run at the end of this turn if context is > 90% full.";
});

register("sessions", "List and resume previous sessions", (_args, ctx) => {
  if (ctx.doSessions) return ctx.doSessions();
  return "Session list not available in this context.";
});

register("rename", "Rename the current session (usage: /rename <new-name>)", (args, ctx) => {
  if (!args.trim()) return "Usage: /rename <new-name>";
  if (ctx.doRename) return ctx.doRename(args.trim());
  return `Session would be renamed to '${args.trim()}'.`;
});

export async function initSkillCommands(): Promise<void> {
  const skills = getCachedRegistry();
  for (const skill of skills) {
    register(
      skill.name,
      skill.description,
      async (args, ctx) => {
        const body = await loadSkillBody(skill.name);
        if (!body) return `Skill '${skill.name}' not found.`;
        if (ctx.doSkill) {
          return ctx.doSkill(skill.name, body);
        }
        return `Skill '${skill.name}' loaded.`;
      },
      { delegate: true, isSkill: true },
    );
  }
}
