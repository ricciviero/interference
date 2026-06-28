# Skill di progetto — Interference

Cartella riservata alle **skill specifiche del progetto**, scritte attingendo a pattern reali del codice e ai vincoli documentati in `docs/`.

## Stato attuale: nessuna skill di progetto

Dopo il pivot del 2026-06-28 (toolkit Python: scout/manager/orchestratore per LLM locali da coding), le skill delle fasi precedenti — legate a stack abbandonati (Rust/Tauri prima, NestJS/Angular ancora prima) — sono state **rimosse**. Il dominio è ora coperto direttamente da `CLAUDE.md` e `docs/` (non c'è una skill globale Python dedicata nell'elenco disponibile).

## Quando crearne una nuova

Quando emerge un pattern che:
- Si ripete (≥2 volte) con la stessa logica
- È specifico di questo progetto (non astratto)
- Non è già coperto da `CLAUDE.md`/`docs/` né dal set globale
- Richiede regole non ovvie o casi limite

Creala/aggiornala **nello stesso intervento** in cui il pattern emerge, con esempi presi dal codice reale.

## Candidate future (da creare on-demand — vedi `CLAUDE.md` §3)

| Skill | Quando |
|---|---|
| `hf-fit-check` | Quando `scout` si stabilizza: stima RAM (pesi+KV cache) da `config.json`, mapping quant→byte/peso, soglie ✅/⚠️/❌ |
| `ssd-enforcement` | Quando `manager` esiste: guard che garantisce I/O modelli solo su SSD esterno (rifiuto path interni, SSD non montato) |
| `mlx-hotswap-server` | Quando l'orchestratore esiste: wrapper OpenAI-compatible su `mlx-lm` con load/unload e routing |
| `opencode-local-provider` | Quando la glue esiste: generazione/aggiornamento config opencode verso il provider locale |

## Formato

```markdown
---
name: nome-skill-kebab-case
description: trigger esplicito (quando invocarla)
---

# Titolo

Vincoli architetturali, pattern del progetto, anti-pattern, riferimenti incrociati a `docs/`.
```

## Linee guida

- ✅ Riferimenti cross a `docs/requisiti.md` e `docs/architettura.md` come fonte canonica
- ✅ Trigger preciso nel frontmatter `description`
- ✅ Esempi presi dal codice reale man mano che esiste
- ✅ Indicare anti-pattern noti
- ❌ Niente skill duplicate del set globale
- ❌ Niente skill abbandonate: aggiornarle quando il pattern evolve, rimuoverle se diventano obsolete
