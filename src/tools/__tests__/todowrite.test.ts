import { describe, test, expect, afterEach } from "bun:test";
import { todowrite, getTodos, setTodos, resetTodos, subscribeTodos, type Todo } from "../todowrite.ts";

async function call(input: any): Promise<string> {
  return todowrite.execute!(input, {} as any) as Promise<string>;
}

afterEach(() => {
  resetTodos();
});

describe("todowrite tool", () => {
  test("happy path: sets todos and returns rendered summary", async () => {
    const todos: Todo[] = [
      { content: "Read spec", status: "completed" },
      { content: "Write code", status: "in_progress" },
      { content: "Add tests", status: "pending", priority: "high" },
    ];
    const out = await call({ todos });
    expect(getTodos()).toEqual(todos);
    expect(out).toContain("1/3 done");
    expect(out).toContain("[x] Read spec");
    expect(out).toContain("[~] Write code");
    expect(out).toContain("[ ] Add tests (high)");
  });

  test("rejects more than one in_progress without mutating state", async () => {
    setTodos([{ content: "existing", status: "pending" }]);
    const out = await call({
      todos: [
        { content: "a", status: "in_progress" },
        { content: "b", status: "in_progress" },
      ],
    });
    expect(out).toMatch(/only one task/i);
    // state unchanged
    expect(getTodos()).toEqual([{ content: "existing", status: "pending" }]);
  });

  test("empty list clears todos", async () => {
    setTodos([{ content: "x", status: "pending" }]);
    const out = await call({ todos: [] });
    expect(getTodos()).toEqual([]);
    expect(out).toContain("cleared");
  });

  test("subscribers are notified on update", async () => {
    let received: Todo[] | null = null;
    const unsub = subscribeTodos((t) => { received = t; });
    await call({ todos: [{ content: "ping", status: "pending" }] });
    expect(received).not.toBeNull();
    expect(received!).toHaveLength(1);
    unsub();
    await call({ todos: [{ content: "after-unsub", status: "pending" }] });
    expect(received!).toHaveLength(1); // no longer notified
  });
});
