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
  gitBranch: string;
  inputTokens: number;
  outputTokens: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
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
  gitBranch,
  inputTokens,
  outputTokens,
}: Props) {
  const modeColor = mode === "build" ? "yellow" : "blue";
  const tokenTotal = inputTokens + outputTokens;
  const contextColor = contextPct > 80 ? "yellow" : contextPct > 60 ? undefined : undefined;

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Box gap={1}>
          {busy && <Text color="yellow">◉</Text>}
          <Text dimColor>{provider}</Text>
          <Text dimColor>·</Text>
          <Text>{model}</Text>
          <Text dimColor>·</Text>
          <Text color={modeColor} bold>{mode.toUpperCase()}</Text>
          {thinking && thinking !== "off" && (
            <Text dimColor>◇ {thinking}</Text>
          )}
          <Text dimColor>·</Text>
          <Text dimColor color={contextColor}>
            {fmt(tokenTotal)} tok {contextPct}%
          </Text>
          <Text dimColor>·</Text>
          <Text dimColor>{cost}</Text>
          <Text dimColor>·</Text>
          <Text dimColor>#{turnCount}</Text>
          {gitBranch && <Text dimColor>⎇ {gitBranch}</Text>}
        </Box>
        <Box>
          {statusLine && <Text dimColor>{statusLine}</Text>}
        </Box>
      </Box>
    </Box>
  );
}
