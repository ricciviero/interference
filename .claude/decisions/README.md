# Decision log — Interference

Registro delle **decisioni architetturali e tecniche non banali** del progetto. Formato ADR semplificato.

## Quando si aggiunge un file qui

**Solo on-demand**, quando l'utente lo chiede esplicitamente con frasi tipo:
- "registra questa decisione"
- "documenta questa scelta"
- "salva un ADR"
- "scrivi un decision record"

L'agente **non** propone proattivamente di creare ADR. Se la decisione richiesta è banale o non ha contesto/alternative/conseguenze concrete, l'agente lo segnala e **non crea il file**.

## Naming

`YYYY-MM-DD-slug-kebab.md`

- La data è quella in cui la decisione è stata presa.
- È immutabile e fa da identificatore.
- Lo slug è breve e descrittivo (es. `2026-06-28-mlx-vs-llama-cpp.md`).

## Stato (`status` nel frontmatter)

- `accepted` — in vigore
- `superseded-by-YYYY-MM-DD-slug` — sostituita da un'altra ADR
- `deprecated` — non più valida ma non sostituita

Quando una decisione viene superata, **non eliminare il file**: aggiorna solo lo `status` e aggiungi nelle conseguenze il link alla nuova ADR.

## Template del file

```markdown
---
date: YYYY-MM-DD
status: accepted
tags: [tag1, tag2]
---

# Titolo della decisione

## Contesto

Qual era il problema o la situazione che ha richiesto una decisione? Quali vincoli (tecnici, temporali, di team, di scope) erano in gioco?

## Opzioni considerate

- **Opzione A** — descrizione breve. Pro / contro.
- **Opzione B** — descrizione breve. Pro / contro.
- **Opzione C** — descrizione breve. Pro / contro.

## Decisione

Quale opzione è stata scelta e **perché**. Una o due frasi sintetiche.

## Conseguenze

Cosa cambia ora nel progetto? Cosa diventa più facile, cosa più difficile? Quali rischi o trade-off accettiamo? Eventuali link a ADR collegate.
```

## Linee guida

- ✅ Una decisione = un file. Non accumulare più scelte in un solo ADR.
- ✅ Cita date e ADR collegate quando una decisione ne supera un'altra.
- ❌ Niente decisioni banali (naming variabili, scelte ovvie, dettagli locali).
- ❌ Niente file vuoti o con sezioni placeholder lasciate da riempire "dopo".
