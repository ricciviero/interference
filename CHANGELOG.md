# Changelog

All notable changes to interference. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning [SemVer](https://semver.org/).

## [Unreleased]

## [0.3.2] — 2026-07-04

### Fixed
- **The agent no longer stops mid-task.** A hardcoded 20-step cap silently ended long multi-step turns regardless of the prompt — "complete everything without stopping" couldn't override it. The turn now keeps working until the task is actually done (or you press Esc), with the step budget configurable via `INTERFERENCE_MAX_STEPS` / `interference.json` (`maxSteps`, `maxContinuations`) and a runaway backstop.
- **Footer context reading**: the status footer now shows the **current** context tokens and window (e.g. `13.6K/1.0M · 1%`) instead of the cumulative session token total, which read as a contradictory "1.8M tok · 1%".
- **Session cost persists across reloads**: resuming with `--continue` no longer resets the cost to ~$0 — it is saved with the session and restored (`/clear` resets it, as expected).

### Changed
- Removed the turn counter (`#N`) from the status footer.

## [0.3.1] — 2026-07-03

### Fixed
- **Parallel tool confirmations no longer deadlock the turn** — two mutating tools requesting confirmation in the same step used to overwrite each other's resolver, hanging the turn forever. Confirmations and questions are now per-request queues, shown one at a time.
- **Context % estimate** now counts tool-call/result I/O and the system prompt — it previously ignored the bulk of the real context and read far too low.
- **`/update` now uses Bun** instead of npm — a Bun-installed user may not have npm, which made self-update fail.

### Changed
- Live streaming re-renders are throttled (~12.5 Hz) to reduce flicker and CPU during a turn.
- README and landing now state the **Bun 1.3+ requirement** clearly, with a Bun-first Quickstart.

## [0.3.0] — 2026-07-03

### Added
- **Direct keyboard shortcuts** in the TUI: `Esc` interrupts the current turn (keeping the work done so far), `Shift+Tab` cycles Plan/Build, `Ctrl+T` toggles the todo list, `Ctrl+O` collapses/expands tool output, `Ctrl+R` reverse-searches the prompt history.
- **Markdown tables** rendered with aligned columns.
- **Queued prompts** show their text (not just a count) above the input.

### Fixed
- **"Thinking" spinner** reappears between tool steps — it was suppressed for the rest of the turn after the first tool call.
- **Provider-aware cache pricing**: cache read/write tokens are priced from the models.dev catalog per provider instead of Anthropic's coefficients (was ~12x too high on DeepSeek).

### Changed
- **Lighter tool blocks**: bash/write/edit render with a left border instead of a heavy full-width dark background; distinct `task` icon, descriptive pending text (Writing/Editing file…), and a spinner while running.

## [0.2.4] — 2026-07-01

### Added
- **Agent registry**: declarative subagent definitions (explore, general, review) with custom agents from `interference.json#agents`.
- **Review agent**: `/review` command scans the working diff for bugs, security issues, and simplification opportunities.
- **Model catalog from models.dev**: real-time pricing and context window data via fetch + disk cache + embedded offline snapshot, replacing hardcoded metadata.
- **5 new providers**: Google, Groq, xAI, Mistral (native SDKs) and OpenRouter (OpenAI-compatible) — 10 providers total. Dynamic import loading via `@ai-sdk/*`.
- **Model picker grouped by provider**: section headers, current provider on top, arrow navigation skipping headers.
- **Model family prompts**: Claude-specific behavioral notes in the system prompt for better response quality.
- **Prompt caching**: Anthropic opt-in ephemeral caching with cache-aware cost tracking across all providers.
- **Multi-subagent parallelism**: multiple `task` tools in the same step run in parallel via `Promise.all`; UI indicators and correct result correlation via `toolCallId`.

### Fixed
- **Startup without API key**: app no longer exits — use `/provider` to configure keys first.
- **Auth key loading order**: `loadAuth()` now runs before the API key check, fixing spurious "key not set" on cold start.
- **Model picker viewport**: fixed 12-row visible window prevents header clipping on any terminal size. Applied to `SessionList` too.
- **Parallel tool-call correlation**: `toolCallId` (from SDK) correctly correlates results with calls when multiple subagents run in the same step.

### Changed
- **All source comments translated to English** (~200 lines). Project is now fully English-only.
- **External project references removed** from source code, comments, and CHANGELOG.
- **`.gitignore`/`.npmignore`**: cleaned up stale entries for relocated reference directory.

## [0.2.3]

### Fixed
- **Session persistence**: the test suite ran against the real `~/.interference`, and `cleanupSessions`/`deleteSession` would wipe real sessions on every `bun test`. Tests are now isolated via `INTERFERENCE_HOME` pointing to a temporary directory.
- `resume`: restored messages showed raw JSON; now text and reasoning are correctly extracted from structured content.

### Added
- Sessions with **auto-derived titles** from the first message; `/rename` updates the title; the session list shows only the title.
- Command output rendered **above the input** instead of in the footer.

### Changed
- `~/.interference` resolution **centralized** in `src/paths.ts` (`interferenceHome`/`interferenceDir`): store, skills, auth and update-check all use the helper and honor `INTERFERENCE_HOME`.

## [0.2.2]

### Fixed
- `grep` now falls back to a pure-JS search when **ripgrep is not installed** (previously blew up with ENOENT). Works on machines without `rg`.
- `bash`: **explicit** timeout (`setTimeout` → `kill`) instead of the `timeout` option on `Bun.spawn`, which is unreliable across platforms/runners.

> Note: 0.2.0 and 0.2.1 were not published on npm (publish failed due to the bugs above); **0.2.2** is the first effective release and includes all the features listed below.

## [0.2.0]

### Added
- `todowrite` tool: structured task list (pending/in_progress/completed/cancelled) with live rendering.
- `question` tool: multiple-choice questions to the user during execution (TUI + CLI fallback).
- Chat rendering: tool icons, inline vs block, markdown in messages, per-message footer.
- Visual separation of thinking/execution/response: thinking in amber (`✻ Thinking/Thought`), execution and response in B&W.
- Panel depth (3-level backgrounds), ASCII wordmark of the brand in the welcome screen.
- Diff with line numbers and colored background; descriptive pending tool text; syntax highlighting in code blocks.
- Title/summary in the thinking header; full-row selection picker; rotating input placeholders.
- Interference-themed spinner derived from the brand's animated mark.

### Changed
- Black/white brand as the base palette; amber as the only accent (reserved for thinking).

## [0.1.0]

### Added
- First public release: terminal coding agent (TypeScript + Bun, AI SDK v7, Ink).
- Multi-provider (DeepSeek default, Anthropic, GLM, Kimi) with reasoning.
- Tools: read/ls/glob/grep/webfetch/write/edit/bash, allow/ask/deny permissions, Plan/Build modes.
- Ink TUI, sessions with undo/redo, slash commands, skills, subagent, compaction, config file, cost tracking.

[Unreleased]: https://github.com/ricciviero/interference/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/ricciviero/interference/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/ricciviero/interference/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/ricciviero/interference/compare/v0.2.4...v0.3.0
[0.2.4]: https://github.com/ricciviero/interference/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/ricciviero/interference/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/ricciviero/interference/compare/v0.1.0...v0.2.2
[0.1.0]: https://github.com/ricciviero/interference/releases/tag/v0.1.0
