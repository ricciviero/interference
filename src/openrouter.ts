// OpenRouter model discovery. OpenRouter is an aggregator that exposes hundreds of models
// through a single OpenAI-compatible endpoint; its /models endpoint (public, no API key
// needed) is the authoritative "all models" list. We fetch it, cache it on disk with a TTL,
// and expose the list for the /model picker plus per-model context/pricing for cost and
// context estimates. No embedded snapshot: offline on first run just yields an empty list
// (the picker still shows the curated fallback entries from PROVIDERS), never a crash.
//
// Mirrors the fetch + on-disk cache pattern of catalog.ts (models.dev), but hits OpenRouter
// directly because models.dev does not carry OpenRouter's full aggregated catalog offline.

import { z } from "zod";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import * as path from "node:path";
import { interferenceDir } from "./paths.ts";

const MODELS_URL =
  process.env.INTERFERENCE_OPENROUTER_MODELS_URL ?? "https://openrouter.ai/api/v1/models";
const TTL_MS = 24 * 60 * 60 * 1000; // 24h: the model list changes rarely enough

export interface OpenRouterModel {
  id: string;
  name: string;
  /** Context window in tokens (0 if OpenRouter doesn't report it). */
  contextLimit: number;
  /** Price per 1M input tokens (USD). */
  inputPer1M: number;
  /** Price per 1M output tokens (USD). */
  outputPer1M: number;
  toolCall: boolean;
  reasoning: boolean;
}

// Defensive parse: only the fields we use (the real payload has ~30 fields per model).
// zod strips undeclared fields by default.
const modelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  context_length: z.number().nullish(),
  pricing: z
    .object({
      prompt: z.string().optional(),
      completion: z.string().optional(),
    })
    .optional(),
  supported_parameters: z.array(z.string()).optional(),
});

const responseSchema = z.object({ data: z.array(modelSchema) });

// OpenRouter prices are USD per token as strings ("0", "0.000003"); ×1e6 → per 1M tokens.
function per1M(price: string | undefined): number {
  const n = Number.parseFloat(price ?? "");
  return Number.isFinite(n) ? n * 1_000_000 : 0;
}

function toModel(m: z.infer<typeof modelSchema>): OpenRouterModel {
  const params = m.supported_parameters ?? [];
  return {
    id: m.id,
    name: m.name ?? m.id,
    contextLimit: m.context_length ?? 0,
    inputPer1M: per1M(m.pricing?.prompt),
    outputPer1M: per1M(m.pricing?.completion),
    toolCall: params.includes("tools"),
    reasoning: params.includes("reasoning") || params.includes("include_reasoning"),
  };
}

/** Parse the raw /models response into our model shape. Exported for tests (the mapping —
 *  price conversion, capability detection — is the part worth covering). Throws on a shape
 *  that doesn't match the schema; callers (fetchModels) catch. */
export function parseOpenRouterModels(raw: unknown): OpenRouterModel[] {
  return responseSchema.parse(raw).data.map(toModel);
}

function cachePath(): string {
  return interferenceDir("cache", "openrouter-models.json");
}

let inMemory: OpenRouterModel[] | null = null;

async function fetchModels(): Promise<OpenRouterModel[] | null> {
  try {
    const res = await fetch(MODELS_URL);
    if (!res.ok) return null;
    return parseOpenRouterModels(await res.json());
  } catch {
    return null;
  }
}

async function readDiskCache(): Promise<OpenRouterModel[] | null> {
  try {
    const raw = await readFile(cachePath(), "utf-8");
    const parsed = JSON.parse(raw) as { fetchedAt: number; models: OpenRouterModel[] };
    if (Date.now() - parsed.fetchedAt > TTL_MS) return null; // expired
    return parsed.models;
  } catch {
    return null;
  }
}

async function writeDiskCache(models: OpenRouterModel[]): Promise<void> {
  try {
    await mkdir(path.dirname(cachePath()), { recursive: true });
    await writeFile(cachePath(), JSON.stringify({ fetchedAt: Date.now(), models }));
  } catch {
    // Best-effort cache: if writing fails (read-only fs, permissions), nothing blocks.
  }
}

/** Full OpenRouter model list: in-memory -> fresh disk cache -> remote fetch (cached back)
 *  -> []. Never throws; offline on first run just returns [] and the picker falls back to
 *  the curated entries. */
export async function loadOpenRouterModels(): Promise<OpenRouterModel[]> {
  if (inMemory) return inMemory;

  const disk = await readDiskCache();
  if (disk) {
    inMemory = disk;
    return inMemory;
  }

  const fetched = await fetchModels();
  if (fetched) {
    inMemory = fetched;
    await writeDiskCache(fetched);
    return inMemory;
  }

  return [];
}

/** Metadata for one OpenRouter model from the already-loaded list (sync; call
 *  loadOpenRouterModels() first). Returns undefined if not loaded or unknown — callers
 *  (cost.ts/compaction.ts) fall back to their existing defaults. */
export function getOpenRouterModelInfo(id: string): OpenRouterModel | undefined {
  return inMemory?.find((m) => m.id === id);
}

/** Tests only: seed the in-memory list directly (avoids a network fetch in unit tests). */
export function _seedOpenRouterForTests(models: OpenRouterModel[]): void {
  inMemory = models;
}

/** Tests only: reset the in-memory cache so each test can force a fresh load. */
export function _resetOpenRouterForTests(): void {
  inMemory = null;
}
