import { Box, Text, useStdout } from "ink";
import { BG_PANEL, BG_ELEMENT, padRight, panelWidth } from "./theme.ts";

// Panel with ACTUAL background: each row is a <Text backgroundColor> filled with
// spaces up to the width, so the color is visible (Box backgrounds in Ink don't
// fill padding). Optional sidebar as the first character of each row.
// level: "element" (#1e1e1e, messages/selection) | "panel" (#141414, blocks/dialogs).
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
