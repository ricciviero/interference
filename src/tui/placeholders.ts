// Esempi rotanti per il placeholder dell'input (it. 25), per modalità.
export const PLACEHOLDERS: Record<"plan" | "build", string[]> = {
  build: [
    "Fix a TODO in the codebase",
    "Add a test for the parser",
    "Refactor this module",
    "Implement the next iteration",
  ],
  plan: [
    "How does the agent loop work?",
    "Where is resolveInWorkspace defined?",
    "Map the tool system",
    "What does this function return?",
  ],
};

export function placeholderFor(mode: string, idx: number): string {
  const list = mode === "plan" ? PLACEHOLDERS.plan : PLACEHOLDERS.build;
  const verb = mode === "plan" ? "Explore" : "Ask anything";
  const ex = list[((idx % list.length) + list.length) % list.length];
  return `${verb}… "${ex}"`;
}
