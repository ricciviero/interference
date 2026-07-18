import { readFile, writeFile, mkdir } from "node:fs/promises";
import * as path from "node:path";
import packageJson from "../package.json" with { type: "json" };
import { interferenceDir } from "./paths.ts";

// A static JSON import works both from the published source package and from
// Bun's compiled binary, where import.meta.url no longer points at package.json.
export const CURRENT_VERSION: string = packageJson.version;

const PKG = "interference-agent";
const TTL = 24 * 60 * 60 * 1000; // 24h
const REGISTRY = `https://registry.npmjs.org/${PKG}/latest`;

function cachePath(): string {
  // Redirectable via INTERFERENCE_HOME (test isolation) — see paths.ts.
  return interferenceDir("update-check.json");
}

// Semver comparison "x.y.z" (with optional v prefix). true if `latest` > `current`.
export function isNewer(latest: string, current: string): boolean {
  const p = (v: string) => v.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const a = p(latest);
  const b = p(current);
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

// Checks npm for a newer version. Throttled (24h cache), non-blocking,
// silent offline. Returns the latest version if newer, otherwise null.
export async function checkForUpdate(): Promise<string | null> {
  if (process.env.INTERFERENCE_NO_UPDATE_CHECK) return null;
  const file = cachePath();
  try {
    let latest: string | null = null;

    // 1) fresh cache?
    try {
      const c = JSON.parse(await readFile(file, "utf8"));
      if (typeof c.ts === "number" && Date.now() - c.ts < TTL && typeof c.latest === "string") {
        latest = c.latest;
      }
    } catch {
      // no valid cache
    }

    // 2) otherwise query the registry (short timeout)
    if (!latest) {
      const res = await fetch(REGISTRY, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return null;
      const j = (await res.json()) as { version?: string };
      latest = j.version ?? null;
      if (latest) {
        try {
          await mkdir(path.dirname(file), { recursive: true });
          await writeFile(file, JSON.stringify({ ts: Date.now(), latest }));
        } catch {
          // cache best-effort
        }
      }
    }

    return latest && isNewer(latest, CURRENT_VERSION) ? latest : null;
  } catch {
    return null; // offline / errors → no alert
  }
}
