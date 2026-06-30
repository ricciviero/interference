// Palette condivisa della TUI. Brand: bianco/nero (niente colori).
// Il contrasto nasce dal PANEL (sfondo applicato sui <Text>, non sui <Box>:
// in Ink il backgroundColor del Box non riempie il padding → si usa il Text).
export const PANEL = "#262626"; // sfondo pannello (grigio scuro, stacca dal nero)
export const USER_BAR = "white"; // barra messaggi utente
export const ASSISTANT_BAR = "gray"; // barra risposte assistant

// Pad a destra fino a w caratteri (per estendere lo sfondo del Text).
export function padRight(s: string, w: number): string {
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

// Larghezza utile del pannello dato lo stdout (clamp ragionevole).
export function panelWidth(columns: number | undefined, max = 96): number {
  return Math.max(24, Math.min((columns ?? 80) - 4, max));
}
