import { Box, Text, useStdout } from "ink";
import { PANEL, padRight, panelWidth } from "./theme.ts";

// Pannello con sfondo REALE: ogni riga è un <Text backgroundColor> riempito di
// spazi fino alla larghezza, così il colore si vede (il bg dei <Box> in Ink non
// riempie il padding). Barra laterale opzionale come primo carattere della riga.
export function Panel({
  content,
  bar,
  barColor,
  bold,
}: {
  content: string;
  bar?: string;
  barColor?: string;
  bold?: boolean;
}) {
  const { stdout } = useStdout();
  const w = panelWidth(stdout?.columns);
  const prefix = bar ? `${bar} ` : "";
  const lines = content.split("\n");

  return (
    <Box flexDirection="column" marginBottom={1}>
      {lines.map((ln, i) => (
        <Text key={i} backgroundColor={PANEL} color="white" bold={bold}>
          {bar && i === 0 ? (
            <Text backgroundColor={PANEL} color={barColor} bold>
              {prefix}
            </Text>
          ) : (
            <Text backgroundColor={PANEL}>{bar ? "  " : ""}</Text>
          )}
          {padRight(ln, w - prefix.length)}
        </Text>
      ))}
    </Box>
  );
}
