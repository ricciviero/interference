import { Box, Text } from "ink";

interface Props {
  mode: string;
  model: string;
  provider: string;
  thinking: string;
  // Current CHAT context (fix/10): how full the context window is right now — NOT the
  // cumulative session tokens (which are billing-oriented and belong to `cost`).
  contextTokens: number;
  contextLimit: number;
  busy: boolean;
  statusLine: string;
  cost: string;
  gitBranch: string;
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
  contextTokens,
  contextLimit,
  busy,
  statusLine,
  cost,
  gitBranch,
}: Props) {
  const modeColor = mode === "build" ? "yellow" : "blue";
  const contextPct = contextLimit > 0 ? Math.round((contextTokens / contextLimit) * 100) : 0;
  const contextColor = contextPct > 80 ? "yellow" : undefined;

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
            {fmt(contextTokens)}/{fmt(contextLimit)} · {contextPct}%
          </Text>
          <Text dimColor>·</Text>
          <Text dimColor>{cost}</Text>
          {gitBranch && <Text dimColor>⎇ {gitBranch}</Text>}
        </Box>
        <Box>
          {statusLine && <Text dimColor>{statusLine}</Text>}
        </Box>
      </Box>
    </Box>
  );
}
