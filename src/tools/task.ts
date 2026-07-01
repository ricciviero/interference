import { tool, type ModelMessage } from "ai";
import { z } from "zod";
import { getAgent, resolveAgentModelOverride } from "../agent/registry.ts";
import { runTurn } from "../agent/loop.ts";
import { currentMode } from "../config.ts";
import { decide } from "../permissions.ts";

export const task = tool({
  description:
    "Launch a new subagent to handle complex, multistep tasks autonomously. " +
    "Use this when you need to delegate research or code exploration to an isolated agent. " +
    "The subagent runs with its own context and returns a condensed result. " +
    "For independent work, invoke multiple tasks in the SAME turn (not one after another) " +
    "so they run concurrently and finish faster — e.g. exploring 3 unrelated modules. " +
    "Built-in types: 'explore' (read-only) for searching and understanding code, " +
    "'general' (full access) for multi-step tasks. Custom agents defined in " +
    "interference.json (`agents`) are also available by name.",
  inputSchema: z.object({
    description: z.string().describe("A short (3-5 words) description of the task"),
    prompt: z.string().describe("The task for the subagent to perform"),
    subagent_type: z.string().describe("The agent to use: 'explore', 'general', or a custom agent name"),
    task_id: z
      .string()
      .optional()
      .describe("Resume a previous subagent session by ID"),
  }),
  execute: async ({ description, prompt, subagent_type, task_id }) => {
    const def = getAgent(subagent_type);
    if (!def) {
      return `<task type="${subagent_type}" state="error">Unknown subagent type: ${subagent_type}</task>`;
    }

    const permissionCheck = decide("task", subagent_type);
    if (permissionCheck === "deny") {
      return `<task type="${subagent_type}" state="error">Task denied by permission policy</task>`;
    }

    const mode = currentMode();
    if (mode === "plan" && def.mutating) {
      return `<task type="${subagent_type}" state="error">Cannot run a mutating agent ('${subagent_type}') in Plan mode. Switch to Build mode first.</task>`;
    }

    const messages: ModelMessage[] = [
      {
        role: "user",
        content: `Task: ${description}\n\n${prompt}`,
      },
    ];

    // Model/thinking declared in AgentDef (registry, it. 34) instead of an if
    // hardcoded by name: any agent with model:"cheap" runs on the active
    // provider's cheapModel, without mutating global state (it. 31).
    const modelOverride = resolveAgentModelOverride(def);

    try {
      let output = "";
      // def.tools (not toolsForMode(mode)) enforces the agent's toolset in code:
      // without it, a read-only agent (explore/review) would still receive write/edit/bash
      // if the main thread is in Build (real bug found in E2E, it. 36).
      const chunks = runTurn(messages, undefined, mode, undefined, def.systemPrompt, modelOverride, def.tools);

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
