type Decision = "allow" | "ask" | "deny";

export interface PermRule {
  tool?: string;
  pattern?: string;
  decision: Decision;
}

const DEFAULT_RULES: PermRule[] = [
  { pattern: "rm -rf*", decision: "deny" },
  { pattern: "rm -r *", decision: "deny" },
  { pattern: "rm -rf /*", decision: "deny" },
  { pattern: "sudo *", decision: "deny" },
  { pattern: "curl * | *sh*", decision: "deny" },
  { pattern: "wget * -O *|*sh*", decision: "deny" },
  { pattern: "git push --force*", decision: "deny" },
  { pattern: "git push -f*", decision: "deny" },
  { pattern: "> /dev/sda*", decision: "deny" },
  { pattern: "mkfs.*", decision: "deny" },
  { pattern: "dd if=*", decision: "deny" },
  { pattern: "chmod 777 *", decision: "deny" },
  { pattern: ":(){ :|:& };:*", decision: "deny" },
  { tool: "write", pattern: "*.env", decision: "deny" },
  { tool: "write", pattern: "**/*.env", decision: "deny" },
  { tool: "write", pattern: "*.pem", decision: "deny" },
  { tool: "write", pattern: "**/*.pem", decision: "deny" },
  { tool: "write", pattern: "*.key", decision: "deny" },
  { tool: "write", pattern: "**/*.key", decision: "deny" },
  { tool: "write", pattern: "secrets/**", decision: "deny" },
  { tool: "write", pattern: "**/secrets/**", decision: "deny" },
  { tool: "edit", pattern: "*.env", decision: "deny" },
  { tool: "edit", pattern: "**/*.env", decision: "deny" },
  { tool: "edit", pattern: "*.pem", decision: "deny" },
  { tool: "edit", pattern: "**/*.pem", decision: "deny" },
  { tool: "edit", pattern: "*.key", decision: "deny" },
  { tool: "edit", pattern: "**/*.key", decision: "deny" },
  { tool: "edit", pattern: "secrets/**", decision: "deny" },
  { tool: "edit", pattern: "**/secrets/**", decision: "deny" },
];

let rules: PermRule[] = [...DEFAULT_RULES];

export function setRules(newRules: PermRule[]) {
  rules = [...newRules, ...DEFAULT_RULES];
}

export function getRules(): PermRule[] {
  return rules;
}

export function resetRules() {
  rules = [...DEFAULT_RULES];
}

export function decide(toolName: string, subject: string): Decision {
  if (toolName === "read" || toolName === "ls" || toolName === "glob" || toolName === "grep" || toolName === "webfetch") {
    return "allow";
  }

  for (const rule of rules) {
    if (rule.tool && rule.tool !== toolName) continue;
    if (rule.pattern) {
      if (toolName === "bash") {
        if (matchBashPattern(rule.pattern, subject)) {
          return rule.decision;
        }
      } else {
        if (matchGlobPath(rule.pattern, subject)) {
          return rule.decision;
        }
      }
      continue;
    }
    return rule.decision;
  }

  return "allow";
}

function matchBashPattern(pattern: string, command: string): boolean {
  return globMatch(command, pattern, ".");
}

function matchGlobPath(glob: string, filePath: string): boolean {
  return globMatch(filePath, glob, "/");
}

function globMatch(str: string, glob: string, sep: string): boolean {
  const single = sep === "/" ? "[^/]*" : ".*";
  const any = sep === "/" ? ".*" : ".*";
  let p = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000GLOBSTAR\u0000")
    .replace(/\*/g, single)
    .replace(/\u0000GLOBSTAR\u0000/g, any)
    .replace(/\?/g, sep === "/" ? "[^/]" : ".");
  return new RegExp(`^${p}$`).test(str);
}

// Confirmation for `ask` actions. EVENT-DRIVEN model (no race with the stream):
// the CLI registers a handler with setConfirmHandler; `requestConfirmation` (invoked
// inside the tool's execute) calls it directly and awaits the response.
// If no handler is registered (e.g. in tests), the fallback
// answerConfirmation/needsConfirmation is used.

export type ConfirmHandler = (tool: string, preview: string) => Promise<boolean>;

let confirmHandler: ConfirmHandler | null = null;
let pendingResolver: ((answer: boolean) => void) | null = null;
let pending: { tool: string; preview: string } | null = null;

export function setConfirmHandler(handler: ConfirmHandler | null) {
  confirmHandler = handler;
}

export async function requestConfirmation(tool: string, preview: string): Promise<boolean> {
  if (confirmHandler) return confirmHandler(tool, preview);
  // Fallback without handler (tests): resolved by answerConfirmation.
  pending = { tool, preview };
  return new Promise<boolean>((resolve) => {
    pendingResolver = resolve;
  });
}

export function needsConfirmation(): { tool: string; preview: string } | null {
  return pending;
}

export function answerConfirmation(answer: boolean) {
  if (pendingResolver) {
    pendingResolver(answer);
    pendingResolver = null;
    pending = null;
  }
}
