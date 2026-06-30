// Sommario del pensiero (it. 23): ricava un titolo breve dalla prima frase significativa
// del reasoning, per l'header `✻ Thinking/Thought: <titolo>` (stile opencode).

export function reasoningSummary(text: string): string {
  const firstLine = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return "";

  let s = firstLine
    .replace(/^#{1,6}\s+/, "") // heading
    .replace(/^[-*>]\s+/, "") // bullet/quote
    .replace(/^\d+\.\s+/, "") // lista numerata
    .replace(/[*_`]/g, "") // enfasi/code inline
    .replace(/\s+/g, " ")
    .trim();

  // Taglia alla prima frase se breve, altrimenti cap a 60 char.
  const sentence = s.match(/^(.*?[.!?])(\s|$)/);
  if (sentence && sentence[1] && sentence[1].length <= 60) return sentence[1];
  return s.length > 60 ? s.slice(0, 60).trimEnd() + "…" : s;
}
