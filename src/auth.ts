import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import * as path from "node:path";
import { interferenceDir } from "./paths.ts";

interface ProviderAuth {
  label: string;
  envKey: string;
}

// Risolti a runtime (non all'import) così INTERFERENCE_HOME isola i test.
const authDir = (): string => interferenceDir();
const authFile = (): string => path.join(authDir(), "auth.json");

export async function loadAuth(): Promise<Record<string, string>> {
  try {
    const raw = await readFile(authFile(), "utf-8");
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function saveAuth(auth: Record<string, string>): Promise<void> {
  await mkdir(authDir(), { recursive: true });
  await writeFile(authFile(), JSON.stringify(auth, null, 2));
  try { await chmod(authFile(), 0o600); } catch {}
}

export function applyAuthToEnv(auth: Record<string, string>, providers: Record<string, ProviderAuth>): void {
  for (const [pid, def] of Object.entries(providers)) {
    const key = auth[pid];
    if (key && !process.env[def.envKey]) {
      process.env[def.envKey] = key;
    }
  }
}

export async function setProviderKey(providerId: string, key: string): Promise<void> {
  const auth = await loadAuth();
  auth[providerId] = key;
  await saveAuth(auth);
}

export async function removeProviderKey(providerId: string): Promise<void> {
  const auth = await loadAuth();
  delete auth[providerId];
  await saveAuth(auth);
}
