let cachedBranch: string | null = null;

export async function getGitBranch(): Promise<string> {
  if (cachedBranch !== null) return cachedBranch;
  try {
    const proc = Bun.spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await proc.stdout.text();
    if (proc.exitCode === 0) {
      cachedBranch = out.trim();
      return cachedBranch;
    }
  } catch {}
  cachedBranch = "no-git";
  return cachedBranch;
}

export function invalidateGitCache() {
  cachedBranch = null;
}
