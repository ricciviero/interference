import { useState, type FC } from "react";
import { Box, Text, useInput } from "ink";

interface Props {
  tool: string;
  preview: string;
  onResolve: (allowed: boolean) => void;
}

export const ConfirmDialog: FC<Props> = ({ tool, preview, onResolve }) => {
  const [selected, setSelected] = useState<"allow" | "deny">("deny");

  useInput((input, key) => {
    if (key.leftArrow || key.rightArrow) {
      setSelected((s) => (s === "allow" ? "deny" : "allow"));
    }
    if (key.return) {
      onResolve(selected === "allow");
    }
    const c = input.toLowerCase();
    if (c === "y") onResolve(true);
    if (c === "n" || key.escape) onResolve(false);
  }, { isActive: true });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1}>
      <Box marginBottom={1}>
        <Text color="yellow" bold>
          Allow {tool}?
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>{preview.slice(0, 300)}</Text>
      </Box>
      <Box gap={2}>
        <Text color={selected === "allow" ? "green" : undefined} bold={selected === "allow"}>
          {selected === "allow" ? "▸ Allow" : "  Allow"}
        </Text>
        <Text color={selected === "deny" ? "red" : undefined} bold={selected === "deny"}>
          {selected === "deny" ? "▸ Deny" : "  Deny"}
        </Text>
        <Text dimColor>(←→ arrows, Enter, y/n)</Text>
      </Box>
    </Box>
  );
};
