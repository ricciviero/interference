import * as path from "node:path";

const WORKSPACE_ROOT = process.cwd();

export function resolveInWorkspace(p: string): string {
  const abs = path.resolve(WORKSPACE_ROOT, p);
  const sep = path.sep;
  if (!abs.startsWith(WORKSPACE_ROOT + sep) && abs !== WORKSPACE_ROOT) {
    throw new Error(`Path escapes workspace: ${p}`);
  }
  return abs;
}
