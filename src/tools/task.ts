import { tool, type ModelMessage } from "ai";
import { z } from "zod";
import { getSubagent } from "../agent/subagent.ts";
import { runTurn } from "../agent/loop.ts";
import { currentMode } from "../config.ts";
import { decide } from "../permissions.ts";

export const task = tool({
  description:
    "Launch a new subagent to handle complex, multistep tasks autonomously. " +
    "Use this when you need to delegate research or code exploration to an isolated agent. " +
    "The subagent runs with its own context and returns a condensed result. " +
    "Available types: 'explore' (read-only) for searching and understanding code, " +
    "'general' (full access) for multi-step tasks.",
  inputSchema: z.object({
    description: z.string().describe("A short (3-5 words) description of the task"),
    prompt: z.string().describe("The task for the subagent to perform"),
    subagent_type: z.enum(["explore", "general"]).describe("The type of subagent to use"),
    task_id: z
      .string()
      .optional()
      .describe("Resume a previous subagent session by ID"),
  }),
  execute: async ({ description, prompt, subagent_type, task_id }) => {
    const def = getSubagent(subagent_type);
    if (!def) {
      return `<task type="${subagent_type}" state="error">Unknown subagent type: ${subagent_type}</task>`;
    }

    const permissionCheck = decide("task", subagent_type);
    if (permissionCheck === "deny") {
      return `<task type="${subagent_type}" state="error">Task denied by permission policy</task>`;
    }

    const mode = currentMode();
    if (mode === "plan" && subagent_type === "general") {
      return `<task type="${subagent_type}" state="error">Cannot run 'general' subagent in Plan mode. Switch to Build mode first.</task>`;
    }

    const messages: ModelMessage[] = [
      {
        role: "user",
        content: `Task: ${description}\n\n${prompt}`,
      },
    ];

    try {
      let output = "";
      const chunks = runTurn(messages, undefined, mode, undefined, def.systemPrompt);

      for await (const chunk of chunks) {
        if (chunk.type === "text") {
          output += chunk.text;
        }
      }

      const id = task_id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const result = output.slice(0, 4000);
      const truncated = output.length > 4000 ? " [truncated]" : "";

      return (
        `<task id="${id}" type="${subagent_type}" state="completed">\n` +
        `<task_result>${result}${truncated}</task_result>\n` +
        `</task>`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `<task type="${subagent_type}" state="error">${msg}</task>`;
    }
  },
});
