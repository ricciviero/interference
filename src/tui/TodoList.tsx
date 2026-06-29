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
  if (todos.length === 0) return null;
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
      {todos.map((t, i) => (
        <Text key={i} color={COLOR[t.status]} dimColor={t.status === "cancelled"}>
          {SYMBOL[t.status]}{" "}
          <Text strikethrough={t.status === "completed" || t.status === "cancelled"}>
            {t.content}
          </Text>
          {t.priority && t.priority !== "medium" ? (
            <Text dimColor> ({t.priority})</Text>
          ) : null}
        </Text>
      ))}
    </Box>
  );
}
