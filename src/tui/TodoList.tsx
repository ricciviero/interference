import { Box, Text } from "ink";
import type { Todo, TodoStatus } from "../tools/todowrite.ts";

const SYMBOL: Record<TodoStatus, string> = {
  pending: "○",
  in_progress: "◐",
  completed: "✓",
  cancelled: "✗",
};

const COLOR: Record<TodoStatus, string | undefined> = {
  pending: undefined,
  in_progress: "yellow",
  completed: "green",
  cancelled: "gray",
};

export function TodoList({ todos }: { todos: Todo[] }) {
  // Show only the ACTIVE tasks (pending / in progress); completed & cancelled ones are folded
  // into the count. Nothing active → render nothing, so the list disappears when the work is
  // done instead of occupying space with a wall of ✓.
  const active = todos.filter((t) => t.status === "pending" || t.status === "in_progress");
  if (active.length === 0) return null;
  const done = todos.filter((t) => t.status === "completed").length;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      paddingLeft={1}
      marginBottom={1}
    >
      <Text dimColor bold>
        ☰ todos {done}/{todos.length}
      </Text>
      {active.map((t, i) => (
        <Text key={i} color={COLOR[t.status]}>
          {SYMBOL[t.status]} {t.content}
          {t.priority && t.priority !== "medium" ? (
            <Text dimColor> ({t.priority})</Text>
          ) : null}
        </Text>
      ))}
    </Box>
  );
}
