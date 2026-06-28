import type { ReactNode } from "react";
import { Box, Text } from "ink";

interface Props {
  role: "user" | "assistant";
  children: ReactNode;
}

export function Message({ role, children }: Props) {
  return (
    <Box flexDirection="row" marginBottom={1}>
      <Text color={role === "user" ? "cyan" : "green"} bold>
        {role === "user" ? "› " : "· "}
      </Text>
      <Text>{children}</Text>
    </Box>
  );
}

export function ReasoningBlock({ text }: { text: string }) {
  return (
    <Text dimColor>
      ┄ {text}
    </Text>
  );
}
