import { Box, Text } from "ink";
import { TextInput } from "@inkjs/ui";
import { useState } from "react";
import packageJson from "../../package.json";

const GREEN = "#009246";
const WHITE = "#fafaf7";
const RED = "#ce2b37";
const ACCENT = "#0a0a0a";

interface Props {
  provider: string;
  model: string;
  sessionCount: number;
  onSubmit: (value: string) => void;
}

export function Welcome({ provider, model, sessionCount, onSubmit }: Props) {
  const [hasStarted, setHasStarted] = useState(false);

  if (hasStarted) return null;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Logo */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color={ACCENT}>
            ┌─┐ ┬┌┐┌┌┬┐┌─┐┬─┐┌─┐┌─┐┬─┐┌─┐┌┐┌┌─┐┌─┐
          </Text>
        </Box>
        <Box>
          <Text bold color={ACCENT}>
            │  │ ││││ │ ├┤ ├┬┘├┤ ├┤ ├┬┘├┤ ││││  ├┤
          </Text>
        </Box>
        <Box>
          <Text bold color={ACCENT}>
            └─┘ ┴┘└┘ ┴ └  ┴└─└─┘└  ┴└─└─┘┘└┘└─┘└─┘
          </Text>
        </Box>
      </Box>

      {/* Tagline */}
      <Box marginBottom={2}>
        <Text dimColor>
          The open-source coding agent that lives in your terminal.
        </Text>
      </Box>

      {/* Italian flag */}
      <Box marginBottom={2}>
        <Text backgroundColor={GREEN} color={WHITE}>
          {"  "}
        </Text>
        <Text backgroundColor={WHITE} color={ACCENT}>
          {"  "}
        </Text>
        <Text backgroundColor={RED} color={WHITE}>
          {"  "}
        </Text>
        <Text> </Text>
        <Text dimColor>Made in Italy</Text>
      </Box>

      {/* Status */}
      <Box flexDirection="column" marginBottom={2}>
        <Text dimColor>
          Provider: <Text>{provider}</Text>
          {" · "}
          Model: <Text>{model}</Text>
        </Text>
        {sessionCount > 0 && (
          <Text dimColor>
            {sessionCount} previous session{sessionCount !== 1 ? "s" : ""} available
            {" · "}
            <Text color="cyan">--continue</Text>
            {" to resume"}
          </Text>
        )}
      </Box>

      {/* Quick start */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Quick start</Text>
        <Box flexDirection="row" gap={2}>
          <Text dimColor>/help</Text>
          <Text>Show all commands</Text>
        </Box>
        <Box flexDirection="row" gap={2}>
          <Text dimColor>/build</Text>
          <Text>Switch to Build mode</Text>
        </Box>
        <Box flexDirection="row" gap={2}>
          <Text dimColor>/init</Text>
          <Text>Initialize AGENTS.md</Text>
        </Box>
        <Box flexDirection="row" gap={2}>
          <Text dimColor>/sessions</Text>
          <Text>Browse previous sessions</Text>
        </Box>
      </Box>

      {/* Input */}
      <Box marginTop={1}>
        <TextInput
          placeholder="What would you like to build today?"
          onSubmit={(v) => {
            if (v.trim()) {
              setHasStarted(true);
              onSubmit(v);
            }
          }}
        />
      </Box>
    </Box>
  );
}
