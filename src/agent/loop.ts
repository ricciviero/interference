import { streamText, stepCountIs, type ModelMessage } from "ai";
import { resolveModel } from "../provider.ts";
import { currentProvider, currentMode, type AgentMode } from "../config.ts";
import { systemPrompt } from "./prompt.ts";
import { toolsForMode } from "../tools/index.ts";

export type Chunk =
  | { type: "text" | "reasoning"; text: string }
  | { type: "tool-call"; toolName: string; input: unknown }
  | { type: "tool-result"; toolName: string; output: string; isError: boolean };

export async function* runTurn(
  messages: ModelMessage[],
  signal?: AbortSignal,
  mode?: AgentMode,
  skillBodies?: string[],
  overrideSystem?: string,
): AsyncGenerator<Chunk> {
  const def = currentProvider();
  const effectiveMode = mode ?? currentMode();
  const tools = toolsForMode(effectiveMode);

  let system = overrideSystem ?? systemPrompt(effectiveMode);
  if (skillBodies && skillBodies.length > 0) {
    system += "\n\n<skill_context>\n" + skillBodies.join("\n\n---\n\n") + "\n</skill_context>";
  }

  const result = streamText({
    model: resolveModel(),
    system,
    messages,
    tools,
    stopWhen: stepCountIs(20),
    abortSignal: signal,
    onError: () => {},
    ...(def.providerOptions
      ? {
          providerOptions: def.providerOptions as Parameters<
            typeof streamText
          >[0]["providerOptions"],
        }
      : {}),
    ...(def.maxOutputTokens ? { maxOutputTokens: def.maxOutputTokens } : {}),
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-delta":
        yield { type: "text", text: part.text };
        break;

      case "reasoning-delta":
        yield { type: "reasoning", text: part.text };
        break;

      case "tool-call":
        yield { type: "tool-call", toolName: part.toolName, input: part.input };
        break;

      case "tool-result": {
        const tr = part as unknown as {
          toolName: string;
          output: unknown;
          error?: unknown;
        };
        const err = tr.error;
        const out = tr.output;
        yield {
          type: "tool-result",
          toolName: tr.toolName,
          output: err
            ? String(err)
            : typeof out === "string"
              ? out
              : JSON.stringify(out),
          isError: !!err,
        };
        break;
      }

      case "error":
        throw part.error;
    }
  }

  const response = await result.response;
  messages.push(...response.messages);
}
