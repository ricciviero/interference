import { Box, Text } from "ink";
import { matchCommands } from "../commands/index.ts";

interface Props {
  filter: string;
  /** Selected index (navigated with ↑↓ by App). */
  selected: number;
}

// Hint with selection: arrows (managed by App) move `selected`; Enter
// (managed by TextInput) runs the highlighted command. No useInput here
// to avoid conflicting with the text field on Enter.
export function SlashAutocomplete({ filter, selected }: Props) {
  const matches = matchCommands(filter);
  if (matches.length === 0) return null;

  const shown = matches.slice(0, 8);
  const sel = ((selected % matches.length) + matches.length) % matches.length;

  return (
    <Box flexDirection="column" marginBottom={1} borderStyle="round" borderColor="blue" paddingX={1}>
      {shown.map((c, i) => (
        <Box key={c.name}>
          <Text color={i === sel ? "cyan" : undefined} bold={i === sel}>
            {i === sel ? "▸ " : "  "}/{c.name}
          </Text>
          <Text dimColor> {c.description.slice(0, 70)}</Text>
        </Box>
      ))}
      <Text dimColor>↑↓ navigate · Enter run · type to filter</Text>
    </Box>
  );
}
