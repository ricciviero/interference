# Changelog

All notable changes to interference. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning [SemVer](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/ricciviero/interference/compare/v0.2.2...HEAD
[0.2.3]: https://github.com/ricciviero/interference/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/ricciviero/interference/compare/v0.1.0...v0.2.2
[0.1.0]: https://github.com/ricciviero/interference/releases/tag/v0.1.0
