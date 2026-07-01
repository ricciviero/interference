// Shared TUI palette. Brand: black/white (no colors).
// Contrast comes from PANEL (background applied on <Text>, not on <Box>:
// in Ink the Box backgroundColor doesn't fill padding → use Text).
// 3-level background hierarchy (B&W), conventional style (base < panel < element).
export const BG_PANEL = "#141414"; // blocks/dialogs (one step above black)
export const BG_ELEMENT = "#1e1e1e"; // elements/selection/user panel (one step above panel)
export const PANEL = BG_ELEMENT; // historical alias (user message, input, welcome)
export const USER_BAR = "white"; // user message bar
export const ASSISTANT_BAR = "gray"; // assistant response bar

// Diff backgrounds (muted, readable on dark terminal) — it. 20.
export const DIFF_ADD_BG = "#0f2a18"; // added line (dark green)
export const DIFF_REM_BG = "#3a1414"; // removed line (dark red)

// Amber: reserved EXCLUSIVELY for thinking (reasoning), as is conventional.
// Execution (tools) and responses stay black/white → the three phases stand out.
export const THINKING = "#d79921"; // thinking header (amber)
export const THINKING_BODY = "gray"; // thinking body (dimmed)

// Pad right up to w characters (to extend the Text background).
export function padRight(s: string, w: number): string {
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

// Usable panel width given stdout columns (reasonable clamp).
export function panelWidth(columns: number | undefined, max = 96): number {
  return Math.max(24, Math.min((columns ?? 80) - 4, max));
}
