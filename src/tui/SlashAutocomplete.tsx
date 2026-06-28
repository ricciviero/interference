import { useState } from "react";
import { Box, Text, useInput } from "ink";

interface CommandInfo {
  name: string;
  description: string;
}

interface Props {
  filter: string;
  commands: CommandInfo[];
  onSelect: (name: string) => void;
  onCancel: () => void;
}

export function SlashAutocomplete({ filter, commands, onSelect, onCancel }: Props) {
  const matches = commands.filter(
    (c) =>
      c.name.includes(filter) ||
      c.description.toLowerCase().includes(filter),
  );
  const [idx, setIdx] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setIdx((i) => (i > 0 ? i - 1 : matches.length - 1));
    } else if (key.downArrow) {
      setIdx((i) => (i < matches.length - 1 ? i + 1 : 0));
    } else if (key.return) {
      const match = matches[idx];
      if (match) onSelect(match.name);
    } else if (key.escape) {
      onCancel();
    }
  }, { isActive: true });

  if (matches.length === 0) {
    return (
      <Box marginBottom={1}>
        <Text dimColor>No commands match "{filter}"</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1} borderStyle="round" borderColor="blue" padding={1}>
      {matches.slice(0, 8).map((c, i) => (
        <Box key={c.name}>
          <Text color={i === idx ? "cyan" : undefined} bold={i === idx}>
            {i === idx ? "▸" : " "} /{c.name}
          </Text>
          <Text dimColor> {c.description.slice(0, 80)}</Text>
        </Box>
      ))}
      <Text dimColor>↑↓ navigate · Enter select · Esc cancel</Text>
    </Box>
  );
}
