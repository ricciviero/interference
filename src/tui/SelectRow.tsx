import { Text, useStdout } from "ink";
import { BG_ELEMENT, padRight, panelWidth } from "./theme.ts";

// Riga di selezione stile opencode (it. 24): selezione = sfondo a riga piena,
// `●` per il valore corrente (vs `  `). Niente pointer `▸`.
export function SelectRow({
  label,
  meta,
  selected,
  current,
  color = "white",
}: {
  label: string;
  meta?: string;
  selected: boolean;
  current?: boolean;
  color?: string;
}) {
  const { stdout } = useStdout();
  const w = Math.min(panelWidth(stdout?.columns), 72);
  const marker = current ? "● " : "  ";

  if (selected) {
    const text = `${marker}${label}${meta ? "  " + meta : ""}`;
    return (
      <Text backgroundColor={BG_ELEMENT} color="white" bold>
        {padRight(text, w)}
      </Text>
    );
  }
  return (
    <Text>
      <Text color={current ? color : undefined} bold={current}>
        {marker}
        {label}
      </Text>
      {meta ? <Text dimColor>{"  " + meta}</Text> : null}
    </Text>
  );
}
