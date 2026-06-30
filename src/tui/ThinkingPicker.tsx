import { useState, type FC } from "react";
import { Box, Text, useInput } from "ink";
import { currentProvider, currentThinking, type ThinkingLevel } from "../config.ts";
import { SelectRow } from "./SelectRow.tsx";

interface Props {
  onSelect: (level: ThinkingLevel) => void;
  onCancel: () => void;
}

const HINT: Partial<Record<ThinkingLevel, string>> = {
  off: "no reasoning (fastest)",
  max: "deepest reasoning",
};

export const ThinkingPicker: FC<Props> = ({ onSelect, onCancel }) => {
  const provider = currentProvider();
  const levels = provider.thinkingLevels;
  const current = currentThinking();
  const [idx, setIdx] = useState(Math.max(0, levels.indexOf(current)));

  useInput(
    (input, key) => {
      if (key.upArrow || input === "k") {
        setIdx((i) => (i > 0 ? i - 1 : levels.length - 1));
      } else if (key.downArrow || input === "j") {
        setIdx((i) => (i < levels.length - 1 ? i + 1 : 0));
      } else if (key.return) {
        const l = levels[idx];
        if (l) onSelect(l);
      } else if (key.escape || input === "q") {
        onCancel();
      }
    },
    { isActive: true },
  );

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Thinking level · {provider.label}</Text>
      </Box>
      {levels.map((l, i) => (
        <SelectRow
          key={l}
          label={l}
          meta={HINT[l]}
          selected={i === idx}
          current={l === current}
        />
      ))}
      <Box marginTop={1}>
        <Text dimColor>↑↓ j/k navigate · Enter select · Esc cancel</Text>
      </Box>
    </Box>
  );
};
