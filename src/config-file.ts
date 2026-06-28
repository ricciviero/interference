import * as path from "node:path";
import { readFile } from "node:fs/promises";
import { setRules, type PermRule } from "./permissions.ts";
import { setMode, type AgentMode } from "./config.ts";
import type { InstructionBlock } from "./context.ts";

interface InterferenceConfig {
  model?: string;
  mode?: "plan" | "build";
  permissions?: Record<string, string | Record<string, string>>;
  instructions?: string[];
}

let loadedConfig: InterferenceConfig | null = null;

export function getLoadedConfig(): InterferenceConfig | null {
  return loadedConfig;
}

export async function loadConfig(): Promise<InterferenceConfig | null> {
  const filePath = findConfigFile();
  if (!filePath) return null;

  try {
    const raw = await readFile(filePath, "utf-8");
    const config = JSON.parse(raw) as InterferenceConfig;
    loadedConfig = config;
    return config;
  } catch {
    return null;
  }
}

function findConfigFile(): string | null {
  let dir = process.cwd();
  const root = path.parse(dir).root;

  while (dir !== root) {
    const fp = path.join(dir, "interference.json");
    try {
      const stat = Bun.file(fp);
      if (stat.size > 0) return fp;
    } catch {}
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function applyConfig(config: InterferenceConfig): void {
  // Model override (env INTERFERENCE_MODEL still wins in config.ts)
  if (config.model && !process.env.INTERFERENCE_MODEL) {
    process.env.INTERFERENCE_MODEL = config.model;
  }

  // Mode
  if (config.mode) {
    setMode(config.mode as AgentMode);
  }

  // Permissions: merge user rules with defaults
  if (config.permissions) {
    const rules = parsePermissionRules(config.permissions);
    setRules(rules);
  }
}

function parsePermissionRules(
  permissions: Record<string, string | Record<string, string>>,
): PermRule[] {
  const rules: PermRule[] = [];

  for (const [tool, value] of Object.entries(permissions)) {
    if (typeof value === "string") {
      rules.push({
        tool,
        decision: value as "allow" | "ask" | "deny",
      });
    } else {
      for (const [pattern, decision] of Object.entries(value)) {
        rules.push({
          tool,
          pattern,
          decision: decision as "allow" | "ask" | "deny",
        });
      }
    }
  }

  return rules;
}

export async function loadConfigInstructions(
  config: InterferenceConfig,
): Promise<InstructionBlock[]> {
  const blocks: InstructionBlock[] = [];
  if (!config.instructions) return blocks;

  for (const filePath of config.instructions) {
    const abs = path.resolve(process.cwd(), filePath);
    try {
      const content = await readFile(abs, "utf-8");
      blocks.push({ source: abs, content });
    } catch {}
  }

  return blocks;
}
