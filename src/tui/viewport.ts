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

// Always returns a fixed number of rows — no terminal-measurement tricks.
// 12 content rows + chrome fits on a 24-row terminal without clipping.
export function useMaxVisibleRows(_overhead: number): number {
  return 12;
}
