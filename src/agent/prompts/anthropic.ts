/** Family profile for Claude models (it. 33) — tuned from the `claude-api` skill
 *  notes: modern Anthropic models follow the prompt very literally. */
export const ANTHROPIC_PROFILE = {
  id: "anthropic",
  text: "Model note: you follow instructions very literally. Be precise; don't over-trigger " +
    "tool calls for trivial requests; calibrate response length to task complexity (short for " +
    "simple questions, longer only when the task warrants it); prefer sensible defaults over asking.",
};
