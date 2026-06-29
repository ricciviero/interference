import { Box, Text } from "ink";
import { currentThinking } from "../config.ts";

// Colori per tema scuro (NON usare #0a0a0a sul testo → invisibile).
const FG = "white";
const ACCENT = "cyan";
const MUTED = "gray";
const GREEN = "#2e8b57";
const RED = "#cd5c5c";

// Wordmark "interference" (cfonts font "chrome", 3 righe box-drawing).
const WORDMARK = [
  " ╦ ╔╗╔ ╔╦╗ ╔═╗ ╦═╗ ╔═╗ ╔═╗ ╦═╗ ╔═╗ ╔╗╔ ╔═╗ ╔═╗",
  " ║ ║║║  ║  ║╣  ╠╦╝ ╠╣  ║╣  ╠╦╝ ║╣  ║║║ ║   ║╣ ",
  " ╩ ╝╚╝  ╩  ╚═╝ ╩╚═ ╚   ╚═╝ ╩╚═ ╚═╝ ╝╚╝ ╚═╝ ╚═╝",
];

// Mark: due sorgenti (◉) i cui fronti d'onda interferiscono al centro (✕).
const MARK = "◉ ››› ✕ ‹‹‹ ◉";

interface Props {
  provider: string;
  model: string;
  sessionCount: number;
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

// Branding-only: l'input è condiviso (gestito da App), così gli slash e
// l'autocomplete funzionano anche dalla home.
export function Welcome({ provider, model, sessionCount }: Props) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Header centrato: mark + wordmark + tagline */}
      <Box flexDirection="column" alignItems="center" marginBottom={1}>
        <Text color={ACCENT}>{MARK}</Text>
        <Box flexDirection="column" marginTop={1}>
          {WORDMARK.map((line, i) => (
            <Text key={i} bold color={FG}>
              {line}
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text color={MUTED}>The open-source coding agent that lives in your terminal.</Text>
        </Box>
      </Box>

      {/* Stato: provider · model · thinking */}
      <Box justifyContent="center">
        <Text color={MUTED}>
          {provider} · {model} · <Text color="magenta">◇ {currentThinking()}</Text>
        </Text>
      </Box>
      {sessionCount > 0 && (
        <Box justifyContent="center">
          <Text color={MUTED}>
            {sessionCount} previous session{sessionCount !== 1 ? "s" : ""} · <Text color={ACCENT}>--continue</Text> to resume
          </Text>
        </Box>
      )}

      {/* Tips (blocco, centrato) */}
      <Box flexDirection="column" alignItems="center" marginTop={1}>
        <Box flexDirection="column">
          <Tip cmd="/help" desc="show all commands" />
          <Tip cmd="/build" desc="switch to full-access mode" />
          <Tip cmd="/thinking" desc="set reasoning level" />
          <Tip cmd="/init" desc="generate AGENTS.md" />
        </Box>
      </Box>

      {/* Made in Italy (discreto) */}
      <Box marginTop={1} justifyContent="center">
        <Text backgroundColor={GREEN}> </Text>
        <Text backgroundColor="white"> </Text>
        <Text backgroundColor={RED}> </Text>
        <Text color={MUTED}> made in Italy · MIT</Text>
      </Box>
    </Box>
  );
}
