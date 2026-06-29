import { Box, Text } from "ink";

interface Props {
  mode: string;
  model: string;
  provider: string;
  thinking: string;
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
  thinking,
  contextPct,
  busy,
  statusLine,
  turnCount,
  cost,
}: Props) {
  const modeColor = mode === "build" ? "yellow" : "blue";
  const thinkColor = thinking === "off" ? "gray" : "magenta";

  return (
    <Box flexDirection="row" justifyContent="space-between">
      <Box gap={1}>
        {busy && (
          <Text color="yellow">◉</Text>
        )}
        <Text dimColor>
          {provider} · {model}
        </Text>
        <Text color={modeColor} bold>
          {mode.toUpperCase()}
        </Text>
        <Text color={thinkColor}>
          ◇ {thinking}
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
        {statusLine && (
          <Text dimColor>{statusLine}</Text>
        )}
      </Box>
    </Box>
  );
}
