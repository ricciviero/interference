import { Box, Text } from "ink";

interface Props {
  mode: string;
  model: string;
  provider: string;
  contextPct: number;
  busy: boolean;
  statusLine: string;
  turnCount: number;
  cost: string;
}

export function StatusFooter({
  mode,
  model,
  provider,
  contextPct,
  busy,
  statusLine,
  turnCount,
  cost,
}: Props) {
  const modeColor = mode === "build" ? "yellow" : "blue";

  return (
    <Box flexDirection="row" justifyContent="space-between">
      <Box gap={1}>
        <Text dimColor>
          {provider} · {model}
        </Text>
        <Text color={modeColor} bold>
          {mode.toUpperCase()}
        </Text>
        {contextPct > 0 && (
          <Text dimColor>
            {contextPct}% ctx
          </Text>
        )}
        <Text dimColor>#{turnCount}</Text>
        {cost && (
          <Text dimColor>{cost}</Text>
        )}
      </Box>
      <Box>
        {busy && (
          <Text dimColor>{statusLine || "thinking..."}</Text>
        )}
      </Box>
    </Box>
  );
}
