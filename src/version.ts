import { readFileSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import * as path from "node:path";
import { interferenceDir } from "./paths.ts";

// Versione corrente letta dal package.json del pacchetto (sync, funziona anche
// installato globalmente: version.ts sta in <pkg>/src, package.json in <pkg>/).
function readVersion(): string {
  try {
    const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    return (JSON.parse(raw).version as string) ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const CURRENT_VERSION: string = readVersion();

const PKG = "interference-agent";
const TTL = 24 * 60 * 60 * 1000; // 24h
const REGISTRY = `https://registry.npmjs.org/${PKG}/latest`;

function cachePath(): string {
  // Reindirizzabile via INTERFERENCE_HOME (isolamento test) — vedi paths.ts.
  return interferenceDir("update-check.json");
}

// Confronto semver "x.y.z" (con eventuale prefisso v). true se `latest` > `current`.
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

// Controlla npm per una versione più recente. Throttled (cache 24h), non bloccante,
// silenzioso offline. Ritorna la versione latest se più nuova, altrimenti null.
export async function checkForUpdate(): Promise<string | null> {
  if (process.env.INTERFERENCE_NO_UPDATE_CHECK) return null;
  const file = cachePath();
  try {
    let latest: string | null = null;

    // 1) cache fresca?
    try {
      const c = JSON.parse(await readFile(file, "utf8"));
      if (typeof c.ts === "number" && Date.now() - c.ts < TTL && typeof c.latest === "string") {
        latest = c.latest;
      }
    } catch {
      // niente cache valida
    }

    // 2) altrimenti interroga il registry (timeout breve)
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
    return null; // offline / errori → nessun avviso
  }
}
