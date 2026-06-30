import * as path from "node:path";

/**
 * Home base dei dati di interference (`~/.interference`).
 *
 * `INTERFERENCE_HOME` ridireziona l'intero store dell'app: usato dai test per
 * isolarsi dalla directory reale dell'utente, così nessun test possa scrivere
 * o cancellare dati veri (sessioni, snapshot, credenziali, skill, cache update).
 *
 * Tutti i consumatori di `~/.interference` DEVONO passare da qui — non
 * ricalcolare la home a mano (vedi store/skills/auth/version).
 */
export function interferenceHome(): string {
  return (
    process.env.INTERFERENCE_HOME ??
    process.env.HOME ??
    process.env.USERPROFILE ??
    "/tmp"
  );
}

/** Path dentro `~/.interference` (o la home reindirizzata da INTERFERENCE_HOME). */
export function interferenceDir(...segments: string[]): string {
  return path.join(interferenceHome(), ".interference", ...segments);
}
