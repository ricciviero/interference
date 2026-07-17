# Changelog

All notable changes to interference. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning [SemVer](https://semver.org/).

## [Unreleased]

## [0.7.0] — 2026-07-17

### Added
- **Kimi K3 support.** The Moonshot model picker now includes the public API model `kimi-k3` with 1M context, native tools, max-effort reasoning, and offline pricing/context metadata.

### Changed
- Kimi K3 requests use the model-specific top-level `reasoning_effort: "max"` contract instead of the K2 `thinking` object. Assistant reasoning is preserved as `reasoning_content` across tool calls and subsequent turns. K2.7 remains the implicit Kimi default so existing conversations are not migrated silently.

### Fixed
- Multi-step turns now persist the aggregate AI SDK `responseMessages` instead of only the final step response, so assistant tool calls, tool results, and their reasoning remain in context on the next user turn.

## [0.6.0] — 2026-07-16

### Added
- **Agentic SWE authoritative behavior runtime.** The separate Agentic SWE Protocol 1.1 now drives classification, mutation intent, setup/planning gates, skill selection, capability requests, and completion criteria for primary turns.
- **Host-verifiable delivery evidence.** Tool authorization, mutation, validation, documentation, refusal, abort, and completion events are recorded with redacted subjects and exact exit codes; only successful compatible events become evidence.
- **Behavior status and state persistence.** `/behavior`, the plain status line, and the TUI footer expose the active phase; session snapshots persist compatible plan/event/evidence state without changing older session files. Retry state is reused only for the same hashed request and never after abort/refusal.
- The repository now dogfoods Agentic SWE through a versioned `.agentic/config.yaml` and a portable `AGENTS.md#Agentic Workflow` section.

### Security
- Effective capabilities use a deny-wins intersection across protocol requests, Plan/Build mode, concrete host tools, and the existing permission policy. Setup and planning writes are path-scoped, stale/concurrent calls are re-authorized, and specialized subagents cannot regain parent capabilities.
- Behavior diagnostics and session events store only hashes and typed projections; request text, prompts, command arguments/output, source content, secrets, and skill bodies are excluded. Deleting a session also deletes its shadow JSONL.

### Changed
- Agentic SWE authoritative enforcement is the supported default. `engine: "legacy"` remains an explicit temporary rollback; `enforcement: "shadow"` remains available for diagnostics.
- The authoritative prompt renders `BehaviorPlan` instead of duplicating `BUILD_RULES`, `VERIFY_TEXT`, or `MEMORY_RULES`; the legacy prompt remains byte-compatible behind the rollback path.
- `agents-setup` and `iterations-planner` are loaded from the versioned `@agenticswe/skills@0.1.0` package instead of embedded Interference copies.
- Interference users continue to install only `interference-agent`; the exact `@agenticswe/core@0.1.0`, `@agenticswe/node@0.1.0`, and `@agenticswe/skills@0.1.0` runtime packages are resolved transitively, with no separate Agentic SWE process or account.
- Completion checks use a bounded protocol-nudge budget separate from todo continuations. Abort and permission refusal remain terminal.
- Public README, architecture, contribution guide, and landing now present Agentic SWE as the separate open-source behavior framework at Interference's core and link directly to its repository.

## [0.5.0] — 2026-07-12

### Added
- **OpenAI GPT-5.6 family** — `gpt-5.6` (Sol alias), `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna` are available in the model picker; Luna is the low-cost model used for OpenAI subagents and compaction. Pricing/context metadata is included in the offline catalog snapshot.

### Changed
- **Model-specific reasoning levels.** `/thinking` now exposes only the levels supported by the active model. GPT-5.6 supports `none`, `low`, `medium`, `high`, `xhigh`, and `max`; OpenAI Chat Completions receives the corresponding `reasoning_effort` value.

## [0.4.0] — 2026-07-07

### Added
- **Living project memory.** The agent now maintains project knowledge in `.agents/` and reloads it every session, so it remembers what isn't in the code (integration state, decisions, gotchas). `/init` scaffolds `.agents/{memory,decisions,skills}/` (gitignored by default) and generates `AGENTS.md`; `.agents/memory/` (a `MEMORY.md` index + one file per fact) is injected into the context each session; the agent is instructed to record durable facts, decisions and recurring patterns as it works. New commands: `/remember <fact>` and `/memory`. Files the agent creates (AGENTS.md, memory) are written in English.
- **`@`-file mentions** — type `@` to fuzzy-pick a project file; Tab/Enter inserts its path (path only, no content expansion). The scanner respects `.gitignore`.
- **Persistent model/provider selection** — the `/model` and `/provider` choices are saved and restored at startup, so the CLI reopens on the last-used model.

### Changed
- **Chronological turn rendering.** A turn now reads top-to-bottom in the real order things happen — reasoning, tool runs and the answer are committed to the scrollback as they occur, instead of "all thinking up top, all tools at the bottom". Tools persist in the scrollback; past thoughts collapse to their header.
- **Todos** show only active tasks and sit just above the input, so the list disappears when the work is done.

### Fixed
- Failed turns are no longer swallowed silently in the TUI — a provider error (no credit/402, 429, network, invalid model) now shows a clear message in the chat.

## [0.3.3] — 2026-07-07

### Added
- **OpenRouter: full dynamic model catalog.** OpenRouter now loads its complete live model list (hundreds of models) from its `/models` endpoint, with **type-to-filter** in the `/model` picker — pick any of them, not a hardcoded few. Per-model pricing and context are read directly from OpenRouter, so cost and context% are accurate. The recommended ranking headers (`HTTP-Referer` / `X-Title`) are sent.
- **Reasoning control for OpenRouter models**: `/thinking` (off/low/medium/high) is mapped to OpenRouter's unified `reasoning.effort`. Note: a provider's proprietary "max" (e.g. DeepSeek) is not exposed through OpenRouter — use that provider directly for it.
- `/model <provider> <id>` switches provider and model together (handy for aggregators, e.g. `/model openrouter anthropic/claude-opus-4-8`).

### Fixed
- **Failed turns are no longer swallowed silently in the TUI.** A provider error (no credit / HTTP 402, 429, network, invalid model) used to show as an empty turn with zero feedback; it now surfaces a clear error message in the chat.

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

[Unreleased]: https://github.com/ricciviero/interference/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/ricciviero/interference/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/ricciviero/interference/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/ricciviero/interference/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/ricciviero/interference/compare/v0.3.3...v0.4.0
[0.3.3]: https://github.com/ricciviero/interference/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/ricciviero/interference/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/ricciviero/interference/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/ricciviero/interference/compare/v0.2.4...v0.3.0
[0.2.4]: https://github.com/ricciviero/interference/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/ricciviero/interference/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/ricciviero/interference/compare/v0.1.0...v0.2.2
[0.1.0]: https://github.com/ricciviero/interference/releases/tag/v0.1.0
