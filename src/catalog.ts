// Model metadata catalog from models.dev (it. 37). Centralized external source for
// pricing/context/capabilities, instead of hardcoding them manually in cost.ts/compaction.ts.
// Fetch + on-disk cache with TTL + embedded snapshot for offline/first-run without network.

import { z } from "zod";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import * as path from "node:path";
import { interferenceDir } from "./paths.ts";
import { CATALOG_SNAPSHOT } from "./models-snapshot.ts";
import type { ProviderId } from "./config.ts";

const MODELS_URL = process.env.INTERFERENCE_MODELS_URL ?? "https://models.dev/api.json";
const TTL_MS = 24 * 60 * 60 * 1000; // 24h: pricing/context change rarely, less network traffic

// Mapping from interference provider id -> models.dev provider id (verified against real api.json).
const PROVIDER_MAP: Record<ProviderId, string> = {
  anthropic: "anthropic",
  deepseek: "deepseek",
  openai: "openai",
  glm: "zhipuai",
  kimi: "moonshotai",
  google: "google",
  groq: "groq",
  xai: "xai",
  mistral: "mistral",
  openrouter: "openrouter",
};

export interface ModelInfo {
  id: string;
  name: string;
  contextLimit: number;
  outputLimit?: number;
  cost?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  reasoning: boolean;
  toolCall: boolean;
  modalities?: string[];
}

// Defensive parse: only the fields we use; the rest of api.json (huge, ~150 providers)
// is ignored. zod strips undeclared fields by default, no need for .passthrough().
const modelEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  reasoning: z.boolean().optional().default(false),
  tool_call: z.boolean().optional().default(false),
  modalities: z.object({ input: z.array(z.string()).optional() }).optional(),
  limit: z.object({
    context: z.number(),
    output: z.number().optional(),
  }),
  cost: z
    .object({
      input: z.number(),
      output: z.number(),
      cache_read: z.number().optional(),
      cache_write: z.number().optional(),
    })
    .optional(),
});

const catalogSchema = z.record(
  z.string(),
  z.object({ models: z.record(z.string(), modelEntrySchema) }),
);

type Catalog = Record<string, { models: Record<string, z.infer<typeof modelEntrySchema>> }>;

function toModelInfo(entry: z.infer<typeof modelEntrySchema>): ModelInfo {
  return {
    id: entry.id,
    name: entry.name,
    contextLimit: entry.limit.context,
    outputLimit: entry.limit.output,
    cost: entry.cost
      ? {
          input: entry.cost.input,
          output: entry.cost.output,
          cacheRead: entry.cost.cache_read,
          cacheWrite: entry.cost.cache_write,
        }
      : undefined,
    reasoning: entry.reasoning,
    toolCall: entry.tool_call,
    modalities: entry.modalities?.input,
  };
}

function cachePath(): string {
  return interferenceDir("cache", "models.json");
}

let inMemoryCatalog: Catalog | null = null;

async function fetchCatalog(): Promise<Catalog | null> {
  try {
    const res = await fetch(MODELS_URL);
    if (!res.ok) return null;
    const json = await res.json();
    return catalogSchema.parse(json);
  } catch {
    return null;
  }
}

async function readDiskCache(): Promise<Catalog | null> {
  try {
    const raw = await readFile(cachePath(), "utf-8");
    const parsed = JSON.parse(raw) as { fetchedAt: number; catalog: unknown };
    if (Date.now() - parsed.fetchedAt > TTL_MS) return null; // expired
    return catalogSchema.parse(parsed.catalog);
  } catch {
    return null;
  }
}

async function writeDiskCache(catalog: Catalog): Promise<void> {
  try {
    await mkdir(path.dirname(cachePath()), { recursive: true });
    await writeFile(cachePath(), JSON.stringify({ fetchedAt: Date.now(), catalog }));
  } catch {
    // Best-effort cache: if writing fails (read-only fs, permissions), doesn't block anything.
  }
}

// The snapshot is `as const` (readonly) for write safety; it's validated with the
// same zod schema as the remote fetch (not a blind cast) so both paths
// produce the exact same type. Computed once (memoized).
let snapshotCatalog: Catalog | null = null;
function getSnapshotCatalog(): Catalog {
  if (!snapshotCatalog) snapshotCatalog = catalogSchema.parse(CATALOG_SNAPSHOT);
  return snapshotCatalog;
}

/** Loads the catalog: in-memory cache -> on-disk cache (if fresh) -> remote fetch (and
 *  writes it back) -> embedded snapshot. Never throws: in the worst case (offline on
 *  first run) it uses the static snapshot shipped with the package. */
export async function loadCatalog(): Promise<void> {
  if (inMemoryCatalog) return;

  const disk = await readDiskCache();
  if (disk) {
    inMemoryCatalog = disk;
    return;
  }

  const fetched = await fetchCatalog();
  if (fetched) {
    inMemoryCatalog = fetched;
    await writeDiskCache(fetched);
    return;
  }

  inMemoryCatalog = getSnapshotCatalog();
}

/** Metadata for a model from the already-loaded catalog (call `loadCatalog()` at startup).
 *  If not loaded yet, or the id is not in the catalog, returns `null` — callers
 *  (cost.ts/compaction.ts) fall back to existing hardcoded values. */
export function getModelInfo(providerId: ProviderId, modelId: string): ModelInfo | null {
  const catalog = inMemoryCatalog ?? getSnapshotCatalog();
  const providerKey = PROVIDER_MAP[providerId];
  const entry = catalog[providerKey]?.models[modelId];
  return entry ? toModelInfo(entry) : null;
}

/** Only for tests: resets the in-memory cache so each test can force a new
 *  `loadCatalog()` (otherwise module-level state would persist across tests/files
 *  in the same `bun test` process). */
export function _resetCatalogForTests(): void {
  inMemoryCatalog = null;
}
