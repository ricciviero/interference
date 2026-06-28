# Memoria di progetto — Interference

Cartella riservata a **fatti vivi non-decisionali** del progetto: stato corrente di integrazioni dormienti, flag temporanei, gotcha noti, patch locali, env hardcoded che esistono per un motivo.

> Nota: esiste anche una memoria esterna (`claude-mem`, fuori dal repo). Questa cartella è la memoria **versionata nel repo**: usala per stati che vuoi condivisi/persistenti col codice.

## Differenza rispetto a `.claude/decisions/`

| | Decisione | Memoria (qui) |
|---|---|---|
| **Cosa è** | "Abbiamo scelto X invece di Y per Z" | "Oggi lo stato di X è Y" |
| **Quando si scrive** | Scelta non banale con alternative considerate (on-demand) | Stato non deducibile dal codice, confermato dall'utente |
| **Vita** | Immutabile (al massimo `superseded-by`) | Evolve, si aggiorna o si rimuove quando non è più vero |
| **Trigger di lettura** | "Abbiamo già deciso qualcosa su X?" | "Cosa devo sapere prima di toccare X?" |

## Quando creare/aggiornare un memo

- L'utente dice: *"ricorda che…"*, *"tieni a mente…"*, *"segna questa cosa"*
- L'agente nota uno stato non deducibile dal codice e **l'utente conferma**
- Lo stato di un'integrazione cambia → **aggiorna o rimuovi** il memo nello stesso intervento
- Esiste una patch locale o workaround non ovvio dal codice

## Quando NON creare un memo

- Convenzioni di codice → skill di progetto (`.claude/skills/`)
- Decisioni con alternative considerate → `.claude/decisions/` (on-demand)
- Task in coda → `iterazioni/`
- Info deducibile dal codice o dal `git log`

## Formato

File `.md` brevi, nominati per **topic** (non per data). Niente frontmatter rigido. Solo:

```markdown
# Titolo del memo

Corpo: cosa va ricordato, perché, cosa cambia se la condizione cambia.

_aggiornato: YYYY-MM-DD_
```

## Comportamento atteso dall'agente

1. **Prima** di toccare un dominio coperto da un memo, **leggi il file corrispondente**
2. Cita il memo all'utente se rilevante
3. Quando lo stato cambia, **aggiorna o rimuovi** il memo nello stesso intervento
4. Non duplicare regole già in `CLAUDE.md` o nelle skill — qui solo stati

## Cosa **non** fare

- ❌ Trattare un memo vecchio come autorevole senza verificare il codice attuale
- ❌ Lasciare memo obsoleti: o aggiorna o cancella
- ❌ Scrivere decisioni qui (vanno in `.claude/decisions/`)
- ❌ Scrivere convenzioni qui (vanno in `.claude/skills/`)
