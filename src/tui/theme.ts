// Palette condivisa della TUI. Brand: bianco/nero (niente colori).
// Il contrasto nasce dal PANEL (sfondo applicato sui <Text>, non sui <Box>:
// in Ink il backgroundColor del Box non riempie il padding → si usa il Text).
// Gerarchia sfondi a 3 livelli (B&W), stile opencode (base < panel < element).
export const BG_PANEL = "#141414"; // blocchi/dialog (un gradino sopra il nero)
export const BG_ELEMENT = "#1e1e1e"; // elementi/selezione/pannello utente (un gradino sopra ancora)
export const PANEL = BG_ELEMENT; // alias storico (messaggio utente, input, welcome)
export const USER_BAR = "white"; // barra messaggi utente
export const ASSISTANT_BAR = "gray"; // barra risposte assistant

// Sfondi diff (attenuati, leggibili su terminale scuro) — it. 20.
export const DIFF_ADD_BG = "#0f2a18"; // riga aggiunta (verde scuro)
export const DIFF_REM_BG = "#3a1414"; // riga rimossa (rosso scuro)

// Ambra: riservata ESCLUSIVAMENTE al pensiero (reasoning), come opencode.
// Esecuzione (tool) e risposte restano bianco/nero → le tre fasi si distinguono.
export const THINKING = "#d79921"; // header pensiero (ambra)
export const THINKING_BODY = "gray"; // corpo pensiero (attenuato)

// Pad a destra fino a w caratteri (per estendere lo sfondo del Text).
export function padRight(s: string, w: number): string {
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

// Larghezza utile del pannello dato lo stdout (clamp ragionevole).
export function panelWidth(columns: number | undefined, max = 96): number {
  return Math.max(24, Math.min((columns ?? 80) - 4, max));
}
