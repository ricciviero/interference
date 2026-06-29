import { useState, type FC } from "react";
import { Box, Text, useInput } from "ink";
import { currentModel, setModel, setProvider, PROVIDERS, type ProviderId } from "../config.ts";

export const ModelPicker: FC<{ onCancel: () => void }> = ({ onCancel }) => {
  const current = currentModel();
  const flat: { id: string; label: string; provider: string; providerId: ProviderId }[] = [];
  for (const [pid, def] of Object.entries(PROVIDERS)) {
    for (const m of def.models) {
      flat.push({ id: m.id, label: m.label, provider: def.label, providerId: pid as ProviderId });
    }
  }

  const [idx, setIdx] = useState(Math.max(0, flat.findIndex((m) => m.id === current)));

  useInput(
    (input, key) => {
      if (key.upArrow || input === "k") setIdx((i) => (i > 0 ? i - 1 : flat.length - 1));
      else if (key.downArrow || input === "j") setIdx((i) => (i < flat.length - 1 ? i + 1 : 0));
      else if (key.return) {
        const m = flat[idx];
        if (m) { setProvider(m.providerId); setModel(m.id); onCancel(); }
      }
      else if (key.escape || input === "q") onCancel();
    },
    { isActive: true },
  );

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" padding={1}>
      <Box marginBottom={1}><Text bold>Select model</Text></Box>
      {flat.map((m, i) => (
        <Box key={m.id}>
          <Text color={i === idx ? "cyan" : undefined} bold={i === idx}>
            {i === idx ? "▸ " : "  "}{m.label}
          </Text>
          <Text dimColor> · {m.provider}</Text>
          {m.id === current && <Text color="cyan"> (active)</Text>}
        </Box>
      ))}
      <Box marginTop={1}><Text dimColor>↑↓ j/k navigate · Enter select · Esc cancel</Text></Box>
    </Box>
  );
};
