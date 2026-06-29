import { Box, Text } from "ink";
import { matchCommands } from "../commands/index.ts";

interface Props {
  filter: string;
  /** Indice selezionato (navigato con ↑↓ da App). */
  selected: number;
}

// Hint con selezione: le frecce (gestite da App) muovono `selected`; l'Invio
// (gestito dal TextInput) esegue il comando evidenziato. Niente useInput qui
// per non confliggere col campo di testo sull'Invio.
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
