import { Box, Text } from "ink";
import { matchCommands } from "../commands/index.ts";
import { computeWindow } from "./viewport.ts";

interface Props {
  filter: string;
  /** Selected index (navigated with ↑↓ by App). */
  selected: number;
}

const MAX_SHOWN = 8;

// Hint with selection: arrows (managed by App) move `selected`; Enter
// (managed by TextInput) runs the highlighted command. No useInput here
// to avoid conflicting with the text field on Enter.
export function SlashAutocomplete({ filter, selected }: Props) {
  const matches = matchCommands(filter);
  if (matches.length === 0) return null;

  const sel = ((selected % matches.length) + matches.length) % matches.length;
  // Window scrolls with `sel` instead of always showing the first MAX_SHOWN —
  // otherwise selecting past position 8 (e.g. an empty "/" filter matching
  // 50+ commands) makes the highlight scroll off-screen with no visual trace.
  const { start, end } = computeWindow(matches.length, sel, MAX_SHOWN);
  const shown = matches.slice(start, end);
  const above = start;
  const below = matches.length - end;

  return (
    <Box flexDirection="column" marginBottom={1} borderStyle="round" borderColor="blue" paddingX={1}>
      {above > 0 && <Text dimColor>↑ {above} more above</Text>}
      {shown.map((c, i) => (
        <Box key={c.name}>
          <Text color={start + i === sel ? "cyan" : undefined} bold={start + i === sel}>
            {start + i === sel ? "▸ " : "  "}/{c.name}
          </Text>
          <Text dimColor> {c.description.slice(0, 70)}</Text>
        </Box>
      ))}
      {below > 0 && <Text dimColor>↓ {below} more below</Text>}
      <Text dimColor>↑↓ navigate · Enter run · type to filter</Text>
    </Box>
  );
}
