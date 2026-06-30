import { useState, type FC } from "react";
import { Box, Text, useInput } from "ink";
import { BG_ELEMENT } from "./theme.ts";

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
        <Text
          backgroundColor={selected === "allow" ? BG_ELEMENT : undefined}
          color={selected === "allow" ? "green" : undefined}
          bold={selected === "allow"}
        >
          {" Allow "}
        </Text>
        <Text
          backgroundColor={selected === "deny" ? BG_ELEMENT : undefined}
          color={selected === "deny" ? "red" : undefined}
          bold={selected === "deny"}
        >
          {" Deny "}
        </Text>
        <Text dimColor>(←→ arrows, Enter, y/n)</Text>
      </Box>
    </Box>
  );
};
