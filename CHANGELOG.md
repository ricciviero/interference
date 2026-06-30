# Changelog

Tutte le modifiche rilevanti a interference. Formato basato su
[Keep a Changelog](https://keepachangelog.com/it/1.1.0/); versionamento [SemVer](https://semver.org/lang/it/).

## [Unreleased]

## [0.2.2]

### Corretto
- `grep` ora fa fallback a una ricerca pura-JS quando **ripgrep non è installato** (prima esplodeva con ENOENT). Funziona su macchine senza `rg`.
- `bash`: timeout **esplicito** (`setTimeout` → `kill`) invece dell'opzione `timeout` di `Bun.spawn`, non affidabile su tutte le piattaforme/runner.

> Nota: 0.2.0 e 0.2.1 non sono state pubblicate su npm (publish fallito per i bug sopra); la **0.2.2** è la prima release effettiva e include tutte le novità qui sotto.

## [0.2.0]

### Aggiunto
- Tool `todowrite`: task list strutturata (pending/in_progress/completed/cancelled) con rendering live.
- Tool `question`: domande a scelta multipla all'utente durante l'esecuzione (TUI + fallback CLI).
- Rendering chat stile opencode: icone tool, inline vs block, markdown nei messaggi, footer per-messaggio.
- Separazione visiva pensiero/esecuzione/risposta: pensiero in ambra (`✻ Thinking/Thought`), esecuzione e risposta in B&W.
- Profondità a pannelli (sfondi a 3 livelli), wordmark ASCII del brand nella welcome.
- Diff con numeri di riga e sfondo colorato; pending descrittivo dei tool; syntax highlighting nei code block.
- Titolo/sommario nell'header del pensiero; picker con selezione a riga piena; placeholder input rotanti.
- Spinner d'interferenza derivato dal mark animato del brand.

### Modificato
- Brand bianco/nero come palette di base; ambra come unico accento (riservato al pensiero).

## [0.1.0]

### Aggiunto
- Prima release pubblica: agente di coding da terminale (TypeScript + Bun, AI SDK v7, Ink).
- Multi-provider (DeepSeek default, Anthropic, GLM, Kimi) con reasoning.
- Tool read/ls/glob/grep/webfetch/write/edit/bash, permessi allow/ask/deny, modi Plan/Build.
- TUI Ink, sessioni con undo/redo, slash command, skill, subagent, compaction, config file, cost tracking.

[Unreleased]: https://github.com/ricciviero/interference/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/ricciviero/interference/compare/v0.1.0...v0.2.2
[0.1.0]: https://github.com/ricciviero/interference/releases/tag/v0.1.0
