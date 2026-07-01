import { describe, test, expect } from "bun:test";
import { addToolCall, applyToolResult, type ToolEntry } from "../App.tsx";
import type { Chunk } from "../../agent/loop.ts";

function toolCall(toolCallId: string, toolName: string, input: unknown = {}): Extract<Chunk, { type: "tool-call" }> {
  return { type: "tool-call", toolCallId, toolName, input };
}

function toolResult(toolCallId: string, toolName: string, output: string, isError = false): Extract<Chunk, { type: "tool-result" }> {
  return { type: "tool-result", toolCallId, toolName, output, isError };
}

describe("addToolCall / applyToolResult (fix parallel multi-subagent)", () => {
  test("a single tool-call/tool-result updates correctly (base behavior)", () => {
    let steps: ToolEntry[] = [];
    steps = addToolCall(steps, toolCall("call-1", "read", { path: "a.ts" }));
    steps = applyToolResult(steps, toolResult("call-1", "read", "file content"));

    expect(steps).toHaveLength(1);
    expect(steps[0]!.output).toBe("file content");
  });

  test("REAL BUG: 2 subagent tasks in parallel, results out of order — each goes to the right place", () => {
    // Scenario: the model launches 2 `task` tools in the same step (parallel exploration
    // of two parts of the codebase). The AI SDK runs them with Promise.all — the SECOND
    // subagent (faster) can complete BEFORE the first. With a single "last id" variable
    // (the pre-fix bug), the second result would be attributed to the wrong task.
    let steps: ToolEntry[] = [];
    steps = addToolCall(steps, toolCall("call-A", "task", { description: "explore auth module" }));
    steps = addToolCall(steps, toolCall("call-B", "task", { description: "explore db module" }));

    // The SECOND (call-B) finishes first — arrival order reversed from calls.
    steps = applyToolResult(steps, toolResult("call-B", "task", "DB module uses Prisma."));

    const taskA = steps.find((s) => s.id === "call-A")!;
    const taskB = steps.find((s) => s.id === "call-B")!;
    expect(taskA.output).toBeUndefined(); // still pending, not contaminated by B's result
    expect(taskB.output).toBe("DB module uses Prisma.");

    // Then the first one also arrives.
    steps = applyToolResult(steps, toolResult("call-A", "task", "Auth uses JWT."));
    const taskAFinal = steps.find((s) => s.id === "call-A")!;
    expect(taskAFinal.output).toBe("Auth uses JWT.");
    // call-B must not have been touched by the second result.
    expect(steps.find((s) => s.id === "call-B")!.output).toBe("DB module uses Prisma.");
  });

  test("3 subagents in parallel, all out of order", () => {
    let steps: ToolEntry[] = [];
    for (const id of ["t1", "t2", "t3"]) {
      steps = addToolCall(steps, toolCall(id, "task", { description: id }));
    }
    // Completion order: t3, t1, t2 (arbitrary, as it would happen with Promise.all).
    steps = applyToolResult(steps, toolResult("t3", "task", "result-3"));
    steps = applyToolResult(steps, toolResult("t1", "task", "result-1"));
    steps = applyToolResult(steps, toolResult("t2", "task", "result-2"));

    expect(steps.find((s) => s.id === "t1")!.output).toBe("result-1");
    expect(steps.find((s) => s.id === "t2")!.output).toBe("result-2");
    expect(steps.find((s) => s.id === "t3")!.output).toBe("result-3");
  });

  test("different tool types in parallel (write + edit): diff goes to the correct tool", () => {
    let steps: ToolEntry[] = [];
    steps = addToolCall(steps, toolCall("w1", "write", { path: "new.ts", content: "line1" }));
    steps = addToolCall(steps, toolCall("e1", "edit", { path: "old.ts", oldString: "a", newString: "b" }));

    // edit finishes first.
    steps = applyToolResult(steps, toolResult("e1", "edit", "ok"));
    const editStep = steps.find((s) => s.id === "e1")!;
    expect(editStep.diff).not.toBeNull();
    expect(editStep.diff!.some((d) => d.type === "remove" && d.text === "a")).toBe(true);

    steps = applyToolResult(steps, toolResult("w1", "write", "ok"));
    const writeStep = steps.find((s) => s.id === "w1")!;
    expect(writeStep.diff).not.toBeNull();
    expect(writeStep.diff!.some((d) => d.type === "add" && d.text === "line1")).toBe(true);
  });
});
