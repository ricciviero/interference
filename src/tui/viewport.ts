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

// Visible content rows = terminal height minus picker chrome.
// No upper cap: the picker's natural height is bounded by `rows - overhead`
// and overflows only if the terminal is too small for the chrome alone
// (below ~12 rows). On a 24+ row terminal, chrome=10 leaves 14+ rows for
// content — sufficient for scrolling through 10 providers.
export function useMaxVisibleRows(overhead: number): number {
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? FALLBACK_ROWS;
  return Math.max(1, rows - overhead);
}
