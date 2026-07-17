import { describe, test, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import * as path from "node:path";
import { loadCatalog, getModelInfo, _resetCatalogForTests } from "../catalog.ts";

const TMP = path.join(process.cwd(), ".test-tmp-catalog");
const PREV_HOME = process.env.INTERFERENCE_HOME;
const originalFetch = globalThis.fetch;

// Reduced fixture, same raw format as models.dev (verified against a real fetch).
const FIXTURE = {
  anthropic: {
    models: {
      "claude-opus-4-8": {
        id: "claude-opus-4-8",
        name: "Claude Opus 4.8",
        reasoning: true,
        tool_call: true,
        modalities: { input: ["text", "image"] },
        limit: { context: 1_000_000, output: 128_000 },
        cost: { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
      },
    },
  },
};

function mockFetchOk(): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(FIXTURE), { status: 200 })) as unknown as typeof fetch;
}

function mockFetchFail(): void {
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
}

beforeEach(async () => {
  process.env.INTERFERENCE_HOME = TMP;
  await rm(TMP, { recursive: true, force: true });
  await mkdir(TMP, { recursive: true });
  _resetCatalogForTests();
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  await rm(TMP, { recursive: true, force: true });
});

afterAll(() => {
  if (PREV_HOME === undefined) delete process.env.INTERFERENCE_HOME;
  else process.env.INTERFERENCE_HOME = PREV_HOME;
});

describe("catalog.ts (iter 37, metadata from models.dev)", () => {
  test("online: getModelInfo returns correct metadata from the remote fetch", async () => {
    mockFetchOk();
    await loadCatalog();
    const info = getModelInfo("anthropic", "claude-opus-4-8");
    expect(info).not.toBeNull();
    expect(info!.contextLimit).toBe(1_000_000);
    expect(info!.cost).toEqual({ input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 });
    expect(info!.reasoning).toBe(true);
    expect(info!.toolCall).toBe(true);
  });

  test("unknown model returns null (fallback handled by callers)", async () => {
    mockFetchOk();
    await loadCatalog();
    expect(getModelInfo("anthropic", "nonexistent-model-xyz")).toBeNull();
  });

  test("unknown provider returns null", async () => {
    mockFetchOk();
    await loadCatalog();
    expect(getModelInfo("openai", "nonexistent-gpt")).toBeNull();
  });

  test("offline (fetch failed, no disk cache): uses embedded snapshot, no crash", async () => {
    mockFetchFail();
    await loadCatalog(); // must not throw
    // The embedded snapshot includes the current real models (verified via live fetch, 2026-07-01).
    const info = getModelInfo("anthropic", "claude-opus-4-8");
    expect(info).not.toBeNull();
    expect(info!.contextLimit).toBeGreaterThan(0);
  });

  test("offline snapshot includes every GPT-5.6 tier with current metadata", async () => {
    mockFetchFail();
    await loadCatalog();

    const expected = {
      "gpt-5.6": { input: 5, output: 30 },
      "gpt-5.6-sol": { input: 5, output: 30 },
      "gpt-5.6-terra": { input: 2.5, output: 15 },
      "gpt-5.6-luna": { input: 1, output: 6 },
    } as const;
    for (const [model, cost] of Object.entries(expected)) {
      const info = getModelInfo("openai", model);
      expect(info?.contextLimit).toBe(1_050_000);
      expect(info?.outputLimit).toBe(128_000);
      expect(info?.cost?.input).toBe(cost.input);
      expect(info?.cost?.output).toBe(cost.output);
    }
  });

  test("offline snapshot includes Kimi K3 launch metadata", async () => {
    mockFetchFail();
    await loadCatalog();

    const info = getModelInfo("kimi", "kimi-k3");
    expect(info).toMatchObject({
      id: "kimi-k3",
      name: "Kimi K3",
      contextLimit: 1_048_576,
      outputLimit: 131_072,
      reasoning: true,
      toolCall: true,
      modalities: ["text", "image", "video"],
      cost: { input: 3, output: 15, cacheRead: 0.3 },
    });
  });

  test("malformed JSON from fetch: does not crash, falls back to snapshot", async () => {
    globalThis.fetch = (async () => new Response("{not valid json", { status: 200 })) as unknown as typeof fetch;
    await loadCatalog();
    const info = getModelInfo("anthropic", "claude-opus-4-8");
    expect(info).not.toBeNull(); // snapshot, not the broken fetch
  });

  test("disk cache: written on fetch, read back without hitting the network again", async () => {
    mockFetchOk();
    await loadCatalog();
    expect(getModelInfo("anthropic", "claude-opus-4-8")!.contextLimit).toBe(1_000_000);

    _resetCatalogForTests(); // simulates a fresh process start
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("should not be called: the disk cache is fresh");
    }) as unknown as typeof fetch;

    await loadCatalog();
    expect(fetchCalled).toBe(false);
    expect(getModelInfo("anthropic", "claude-opus-4-8")!.contextLimit).toBe(1_000_000);
  });

  test("getModelInfo before loadCatalog() still uses the snapshot (never a system null)", () => {
    // No await loadCatalog() here: verifies lazy fallback to the snapshot.
    const info = getModelInfo("anthropic", "claude-opus-4-8");
    expect(info).not.toBeNull();
  });
});
