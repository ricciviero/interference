import { Box, Text } from "ink";
import { computeWindow } from "./viewport.ts";

interface Props {
  matches: string[];
  /** Selected index (navigated with ↑↓ by App; wraps). */
  selected: number;
}

const MAX_SHOWN = 8;

// Passive hint (like SlashAutocomplete): no useInput, so it doesn't fight the text field on
// Enter/Tab. App owns navigation (arrows) and insertion (Tab/Enter).
export function FileMentionMenu({ matches, selected }: Props) {
  if (matches.length === 0) return null;

  const sel = ((selected % matches.length) + matches.length) % matches.length;
  const { start, end } = computeWindow(matches.length, sel, MAX_SHOWN);
  const shown = matches.slice(start, end);
  const above = start;
  const below = matches.length - end;

  return (
    <Box flexDirection="column" marginBottom={1} borderStyle="round" borderColor="blue" paddingX={1}>
      {above > 0 && <Text dimColor>↑ {above} more above</Text>}
      {shown.map((f, i) => (
        <Box key={f}>
          <Text color={start + i === sel ? "cyan" : undefined} bold={start + i === sel}>
            {start + i === sel ? "▸ " : "  "}@{f}
          </Text>
        </Box>
      ))}
      {below > 0 && <Text dimColor>↓ {below} more below</Text>}
      <Text dimColor>↑↓ navigate · Tab/Enter insert · type to filter</Text>
    </Box>
  );
}
