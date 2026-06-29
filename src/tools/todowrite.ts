import { tool } from "ai";
import { z } from "zod";

export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type TodoPriority = "high" | "medium" | "low";

export interface Todo {
  content: string;
  status: TodoStatus;
  priority?: TodoPriority;
}

// Stato osservabile della task list (RF-TOOL pattern: tool senza filesystem).
// La TUI/CLI si iscrive con subscribeTodos per renderizzare i progressi in tempo reale;
// la sessione lo persiste con getTodos()/setTodos().
let currentTodos: Todo[] = [];
const listeners = new Set<(todos: Todo[]) => void>();

export function getTodos(): Todo[] {
  return currentTodos;
}

export function setTodos(todos: Todo[]): void {
  currentTodos = todos;
  for (const cb of listeners) cb(currentTodos);
}

export function resetTodos(): void {
  setTodos([]);
}

export function subscribeTodos(cb: (todos: Todo[]) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const MARKER: Record<TodoStatus, string> = {
  pending: "[ ]",
  in_progress: "[~]",
  completed: "[x]",
  cancelled: "[-]",
};

function render(todos: Todo[]): string {
  if (todos.length === 0) return "Todo list cleared.";
  const lines = todos.map((t) => {
    const prio = t.priority && t.priority !== "medium" ? ` (${t.priority})` : "";
    return `${MARKER[t.status]} ${t.content}${prio}`;
  });
  const done = todos.filter((t) => t.status === "completed").length;
  return `Todos updated (${done}/${todos.length} done):\n${lines.join("\n")}`;
}

export const todowrite = tool({
  description:
    "Maintain a structured task list for the current work. Replaces the entire list on each call. " +
    "Use it for non-trivial work (3+ distinct steps): create the plan up front, then update statuses " +
    "in real time as you progress. Keep exactly ONE task 'in_progress' at a time; mark a task " +
    "'completed' immediately when it is done before starting the next. Skip it for trivial or single-step tasks.",
  inputSchema: z.object({
    todos: z
      .array(
        z.object({
          content: z.string().min(1).describe("Short imperative description of the task"),
          status: z
            .enum(["pending", "in_progress", "completed", "cancelled"])
            .describe("Current status of the task"),
          priority: z
            .enum(["high", "medium", "low"])
            .optional()
            .describe("Optional priority of the task"),
        }),
      )
      .describe("The full task list (replaces any previous list)"),
  }),
  execute: async ({ todos }) => {
    const inProgress = todos.filter((t) => t.status === "in_progress").length;
    if (inProgress > 1) {
      return `Error: only one task may be 'in_progress' at a time (got ${inProgress}). Set the others to 'pending'.`;
    }
    setTodos(todos);
    return render(todos);
  },
});
