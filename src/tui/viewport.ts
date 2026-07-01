import { useStdout } from "ink";

export interface Window {
  start: number;
  end: number; // exclusive
}

// Centers a scroll window of `size` rows around `selected`, clamped to the
// list bounds. Returns the full range when everything already fits.
export function computeWindow(total: number, selected: number, size: number): Window {
  if (total <= size) return { start: 0, end: total };
  let start = selected - Math.floor(size / 2);
  start = Math.max(0, Math.min(start, total - size));
  return { start, end: start + size };
}

const FALLBACK_ROWS = 24;

// How many rows a picker can show before it overflows the terminal, after
// subtracting border/padding/title/footer chrome. `overhead` lets each
// picker account for its own extra chrome (e.g. scroll indicators).
export function useMaxVisibleRows(overhead: number): number {
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? FALLBACK_ROWS;
  return Math.max(1, rows - overhead);
}
