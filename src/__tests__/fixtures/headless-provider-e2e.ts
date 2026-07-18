import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { runHeadless } from "../../cli-headless.ts";
import { PROVIDERS } from "../../config.ts";

const requests: Array<Record<string, unknown>> = [];
function streamResponse(chunks: unknown[]): Response {
  const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    requests.push(await request.json() as Record<string, unknown>);
    const turn = requests.length;
    const base = { id: `headless-${turn}`, object: "chat.completion.chunk", created: 1, model: "kimi-k2.5" };
    if (turn === 1) {
      return streamResponse([
        { ...base, choices: [{ index: 0, delta: { role: "assistant", reasoning_content: "private reasoning must never reach the trajectory" }, finish_reason: null }] },
        { ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call-write-1", type: "function", function: { name: "write", arguments: JSON.stringify({ path: "result.txt", content: "headless works\n" }) } }] }, finish_reason: null }] },
        { ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } },
      ]);
    }
    return streamResponse([
      { ...base, choices: [{ index: 0, delta: { role: "assistant", reasoning_content: "another private thought" }, finish_reason: null }] },
      { ...base, choices: [{ index: 0, delta: { content: "Created and verified result.txt." }, finish_reason: null }] },
      { ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 120, completion_tokens: 20, total_tokens: 140 } },
    ]);
  },
});

const originalBaseURL = PROVIDERS.kimi.baseURL;
PROVIDERS.kimi.baseURL = `${server.url.origin}/v1`;
process.env.KIMI_API_KEY = "fixture-key";

try {
  const trajectory = await runHeadless({
    outputJson: path.join(process.cwd(), "trajectory.json"),
    treatment: "legacy",
    provider: "kimi",
    model: "kimi-k2.5",
    thinking: "max",
    maxCostUsd: 1,
    maxOutputTokens: 16_000,
    timeoutMs: 10_000,
    runId: "provider-e2e",
    taskId: "provider-e2e",
  }, "Create result.txt containing exactly 'headless works' followed by a newline.");
  const result = await readFile("result.txt", "utf8").catch(() => null);
  process.stdout.write(JSON.stringify({ trajectory, result, requestCount: requests.length }));
} finally {
  PROVIDERS.kimi.baseURL = originalBaseURL;
  server.stop(true);
}
