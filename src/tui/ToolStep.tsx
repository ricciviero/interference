import { Box, Text } from "ink";
import { Spinner } from "@inkjs/ui";

interface Props {
  toolName: string;
  input: unknown;
  output?: string;
  isError?: boolean;
  pending?: boolean;
}

export function ToolStep({ toolName, input, output, isError, pending }: Props) {
  const args =
    typeof input === "string" ? input : JSON.stringify(input);

  return (
    <Box flexDirection="column" marginBottom={0}>
      <Box>
        <Text dimColor>· {toolName}</Text>
        <Text>({args})</Text>
        {pending && <Spinner label="" />}
      </Box>
      {output && (
        <Text dimColor color={isError ? "red" : undefined}>
          {"  → "}
          {output.length > 150 ? output.slice(0, 150).replace(/\n/g, " ") + "…" : output.replace(/\n/g, " ")}
        </Text>
      )}
    </Box>
  );
}
