import { Box, Text, useStdout } from "ink";
import { BG_PANEL, BG_ELEMENT, padRight, panelWidth } from "./theme.ts";

// Pannello con sfondo REALE: ogni riga è un <Text backgroundColor> riempito di
// spazi fino alla larghezza, così il colore si vede (il bg dei <Box> in Ink non
// riempie il padding). Barra laterale opzionale come primo carattere della riga.
// level: "element" (#1e1e1e, messaggi/selezione) | "panel" (#141414, blocchi/dialog).
export function Panel({
  content,
  bar,
  barColor,
  bold,
  level = "element",
}: {
  content: string;
  bar?: string;
  barColor?: string;
  bold?: boolean;
  level?: "panel" | "element";
}) {
  const { stdout } = useStdout();
  const w = panelWidth(stdout?.columns);
  const bg = level === "panel" ? BG_PANEL : BG_ELEMENT;
  const prefix = bar ? `${bar} ` : "";
  const lines = content.split("\n");

  return (
    <Box flexDirection="column" marginBottom={1}>
      {lines.map((ln, i) => (
        <Text key={i} backgroundColor={bg} color="white" bold={bold}>
          {bar && i === 0 ? (
            <Text backgroundColor={bg} color={barColor} bold>
              {prefix}
            </Text>
          ) : (
            <Text backgroundColor={bg}>{bar ? "  " : ""}</Text>
          )}
          {padRight(ln, w - prefix.length)}
        </Text>
      ))}
    </Box>
  );
}
