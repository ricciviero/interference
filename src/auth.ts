import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import * as path from "node:path";

const AUTH_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "/tmp",
  ".interference",
);

interface ProviderAuth {
  label: string;
  envKey: string;
}

const AUTH_FILE = path.join(AUTH_DIR, "auth.json");

export async function loadAuth(): Promise<Record<string, string>> {
  try {
    const raw = await readFile(AUTH_FILE, "utf-8");
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function saveAuth(auth: Record<string, string>): Promise<void> {
  await mkdir(AUTH_DIR, { recursive: true });
  await writeFile(AUTH_FILE, JSON.stringify(auth, null, 2));
  try { await chmod(AUTH_FILE, 0o600); } catch {}
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
