import { Box, Text } from "ink";
import { currentThinking } from "../config.ts";
import { WORDMARK } from "./wordmark.ts";
import { PANEL, padRight } from "./theme.ts";
import { CURRENT_VERSION } from "../version.ts";

// Width of the wordmark panel = longest line + margins.
const WM_W = Math.max(...WORDMARK.map((l) => l.length)) + 4;
// Panel rows: one empty above/below + the wordmark, all filled.
const WM_LINES = ["", ...WORDMARK, ""].map((l) => padRight("  " + l, WM_W));

// Colors for dark theme (do NOT use #0a0a0a on text → invisible).
const FG = "white";
const ACCENT = "cyan";
const MUTED = "gray";
const GREEN = "#2e8b57";
const RED = "#cd5c5c";

interface Props {
  provider: string;
  model: string;
  sessionCount: number;
  update?: string | null;
}

function Tip({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <Box>
      <Box width={11}>
        <Text color={ACCENT}>{cmd}</Text>
      </Box>
      <Text color={MUTED}>{desc}</Text>
    </Box>
  );
}

// Branding-only: the input is shared (managed by App), so slashes and
// autocomplete work from the home screen too.
export function Welcome({ provider, model, sessionCount, update }: Props) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Update banner (it. 28): subtle, only if a newer version exists */}
      {update && (
        <Box marginBottom={1}>
          <Text color={ACCENT}>
            interference {CURRENT_VERSION} → {update}
          </Text>
          <Text color={MUTED}> · run </Text>
          <Text color={ACCENT}>/update</Text>
        </Box>
      )}
      {/* Header: wordmark on panel (actual background via Text) + tagline */}
      <Box flexDirection="column" marginBottom={1}>
        <Box flexDirection="column">
          {WM_LINES.map((line, i) => (
            <Text key={i} bold color={FG} backgroundColor={PANEL}>
              {line}
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text color={MUTED}>The open-source coding agent that lives in your terminal.</Text>
        </Box>
      </Box>

      {/* Status: provider · model · thinking */}
      <Box>
        <Text color={MUTED}>
          {provider} · {model} · <Text color="magenta">◇ {currentThinking()}</Text>
        </Text>
      </Box>
      {sessionCount > 0 && (
        <Box>
          <Text color={MUTED}>
            {sessionCount} previous session{sessionCount !== 1 ? "s" : ""} · <Text color={ACCENT}>--continue</Text> to resume
          </Text>
        </Box>
      )}

      {/* Tips — top two core commands at the top */}
      <Box flexDirection="column" marginTop={1}>
        <Box marginBottom={1}>
          <Text color={MUTED}>Get started — connect a provider, then pick a model:</Text>
        </Box>
        <Box flexDirection="column">
          <Tip cmd="/provider" desc="connect a provider (add your API key)" />
          <Tip cmd="/model" desc="choose the model to use" />
          <Tip cmd="/help" desc="all commands" />
          <Tip cmd="/thinking" desc="set reasoning level" />
        </Box>
      </Box>

      {/* Made in Italy (subtle) */}
      <Box marginTop={1}>
        <Text backgroundColor={GREEN}> </Text>
        <Text backgroundColor="white"> </Text>
        <Text backgroundColor={RED}> </Text>
        <Text color={MUTED}> made in Italy</Text>
      </Box>
    </Box>
  );
}
