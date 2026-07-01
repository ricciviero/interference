// Reasoning summary (it. 23): extracts a short title from the first meaningful
// sentence of the reasoning text, for the `✻ Thinking/Thought: <title>` header (conventional style).

export function reasoningSummary(text: string): string {
  const firstLine = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return "";

  let s = firstLine
    .replace(/^#{1,6}\s+/, "") // heading
    .replace(/^[-*>]\s+/, "") // bullet/quote
    .replace(/^\d+\.\s+/, "") // numbered list
    .replace(/[*_`]/g, "") // emphasis/inline code
    .replace(/\s+/g, " ")
    .trim();

  // Cut at first sentence if short, otherwise cap at 60 chars.
  const sentence = s.match(/^(.*?[.!?])(\s|$)/);
  if (sentence && sentence[1] && sentence[1].length <= 60) return sentence[1];
  return s.length > 60 ? s.slice(0, 60).trimEnd() + "…" : s;
}
