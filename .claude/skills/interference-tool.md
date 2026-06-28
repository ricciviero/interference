---
name: interference-tool
description: >-
  Pattern per aggiungere/modificare un TOOL dell'agente interference (src/tools/*).
  Usa quando crei un nuovo tool (read/ls/glob/grep/webfetch/write/edit/bash/task o nuovi) o ne tocchi uno:
  schema zod, path containment (resolveInWorkspace), gate permessi (decide + requestConfirmation),
  troncamento output, registrazione nel registry (readonlyTools / allToolsWithoutTask / allTools),
  aggiornamento system prompt, test. Per tool senza filesystem (webfetch, task) salta resolveInWorkspace.
  Trigger: nuovo tool, src/tools, aggiungere tool all'agente, tool read-only vs mutante, permessi tool.
---

# Aggiungere un tool a interference

Tutti i tool vivono in `src/tools/` e seguono lo **stesso scheletro**. Replica questo pattern; non reinventarlo. Riferimento di dominio: opencode (`CLAUDE.md` §6.11).

## Scheletro comune (ogni tool)

```ts
import { tool } from "ai";
import { z } from "zod";
import { resolveInWorkspace } from "./_fs.ts";        // se tocca il filesystem
import { decide, requestConfirmation } from "../permissions.ts"; // se è mutante

export const myTool = tool({
  description: "Frase chiara + quando usarlo. Guida la scelta del modello.",
  inputSchema: z.object({
    path: z.string().describe("…"),                   // ogni campo con .describe()
  }),
  execute: async ({ path: p }) => {
    const abs = resolveInWorkspace(p);                 // 1) path containment (può throware → tool-error)
    // 2) [solo mutanti] gate permessi
    // 3) lavoro
    // 4) output TRONCATO (mai dump illimitati)
    return "risultato come stringa o oggetto serializzabile";
  },
});
```

Regole invarianti:
- **`inputSchema`** (NON `parameters`), zod, ogni campo con `.describe()`.
- **Path dal modello** → SEMPRE `resolveInWorkspace()` (rifiuta uscite dalla workspace). Non usare path grezzi.
- **Output troncato**: cap espliciti (read/grep ~30k, write preview ~500). Salta `node_modules`/`.git` negli scan (vedi `glob.ts`).
- **Errori**: ritorna una stringa `Error: …` o lascia throware — l'SDK la reinietta come tool-error (auto-correzione). Niente `process.exit`, niente throw non gestiti in path felice.
- Il **nome** del tool è la chiave nel registry, non un campo dentro `tool()`.

## Tool read-only (read/ls/glob/grep)

- `decide()` per questi torna sempre `allow` → nessuna conferma.
- Esempio canonico: `src/tools/read.ts` (offset/limit + cap), `src/tools/glob.ts` (Bun.Glob, esclude node_modules/.git).

## Tool mutante (write/edit/bash) — gate permessi OBBLIGATORIO

Pattern verificato (da `src/tools/edit.ts`, `write.ts`, `bash.ts`):

```ts
const decision = decide("edit", subject);            // subject = path (file tool) o comando (bash)
if (decision === "deny") return `Error: edit denied by policy for '${rel}'`;
// … validazioni specifiche (es. edit: match univoco) …
if (decision === "ask") {
  const allowed = await requestConfirmation("edit", preview);  // EVENT-DRIVEN, vedi sotto
  if (!allowed) return `Edit refused by user for '${rel}'`;
}
// … esegui la mutazione …
```

- **`decide(tool, subject)`**: `subject` è il **path** per i tool file, il **comando** per `bash`.
- **Conferma `requestConfirmation`**: è event-driven (la CLI registra l'handler con `setConfirmHandler`). **MAI** dedurre la conferma osservando lo stream nel loop → causa deadlock. Vedi `.claude/memory/confirmation-flow.md`.
- `edit` è **atomico**: `oldString` deve matchare **esattamente una volta** (o `replaceAll: true`); altrimenti errore.
- `bash` via `Bun.spawn(["sh","-c",cmd])` con `timeout` + output cap + exit code. La deny-list in `permissions.ts` è best-effort: aggiungi pattern lì per nuovi comandi pericolosi.

## Registrazione (sempre)

1. `src/tools/index.ts`: aggiungi al set giusto — `readonlyTools` (disponibile anche in Plan) o solo `allTools` (Build). `toolsForMode(mode)` espone il set corretto.
2. `src/agent/prompt.ts`: se è un tool **Build-only**, descrivilo nel ramo `build` del system prompt (il modello deve sapere che esiste e come usarlo).
3. Test in `src/tools/__tests__/`: chiama `tool.execute(input, {} as any)`; per i mutanti usa `setRules([...])` + `answerConfirmation(true/false)` (fallback senza handler). Copri: happy path, deny, path-escape, ask-accept, ask-refuse, edge case.

## Checklist nuovo tool

- [ ] `inputSchema` zod con `.describe()` su ogni campo
- [ ] path dal modello via `resolveInWorkspace`
- [ ] output troncato (cap esplicito); scan saltano node_modules/.git
- [ ] [mutante] `decide()` → deny/ask gestiti; conferma via `requestConfirmation`
- [ ] registrato in `index.ts` (readonly vs all) + descritto nel system prompt se Build-only
- [ ] test (happy + deny + path-escape + ask accept/refuse + edge)
- [ ] `bunx tsc --noEmit` pulito; `bun test` verde
