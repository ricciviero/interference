import { useState, useRef, useEffect, useCallback } from "react";
import { Box, Text, Static, useInput, useApp } from "ink";
import { Spinner } from "./Spinner.tsx";
import TextInput from "ink-text-input";
import type { ModelMessage } from "ai";
import { runTurn } from "../agent/loop.ts";
import type { Chunk } from "../agent/loop.ts";
import { runReview, getWorkingDiff } from "../agent/review.ts";
import { MissingApiKeyError } from "../provider.ts";
import { setConfirmHandler } from "../permissions.ts";
import type { ConfirmHandler } from "../permissions.ts";
import { currentMode, setMode, currentThinking, setThinking, currentModel, currentProvider } from "../config.ts";
import { ThinkingPicker } from "./ThinkingPicker.tsx";
import { ModelPicker } from "./ModelPicker.tsx";
import { ProviderPicker } from "./ProviderPicker.tsx";
import { saveSession, loadSession } from "../session/store.ts";
import type { Session } from "../session/store.ts";
import { nextTurn, undo, redo, finalizeSnapshots } from "../session/snapshot.ts";
import { dispatch, isSlashCommand } from "../commands/index.ts";
import { matchSkills, getCachedRegistry, loadSkillBody } from "../skills.ts";
import { shouldCompact, compactMessages, getUsagePercent, estimateMessagesTokens, getContextLimit } from "../agent/compaction.ts";
import { computeDiff, type DiffLine } from "./DiffView.tsx";
import { formatCost, getTotalCost, getRawUsage, restoreUsage, resetUsage } from "../cost.ts";
import { getGitBranch } from "../git.ts";
import { StatusFooter } from "./StatusFooter.tsx";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { SlashAutocomplete } from "./SlashAutocomplete.tsx";
import { FileMentionMenu } from "./FileMentionMenu.tsx";
import { scanProjectFiles, rankFileMentions, getAtQuery, insertMention } from "./fileMentions.ts";
import { scaffoldAgents } from "../projectMemory.ts";
import { ReverseSearch } from "./ReverseSearch.tsx";
import { createStreamFlusher } from "./streamFlush.ts";
import { SessionList } from "./SessionList.tsx";
import { useToast, ToastContainer } from "./Toast.tsx";
import { Welcome } from "./Welcome.tsx";
import { matchCommands } from "../commands/index.ts";
import { TodoList } from "./TodoList.tsx";
import { getTodos, setTodos, subscribeTodos, type Todo } from "../tools/todowrite.ts";
import { QuestionDialog } from "./QuestionDialog.tsx";
import { setAnswerHandler, type QuestionSpec, type Answers } from "../tools/question.ts";
import { ToolStep } from "./ToolStep.tsx";
import { MarkdownText } from "./MarkdownText.tsx";
import { reasoningSummary } from "./reasoning.ts";
import { placeholderFor } from "./placeholders.ts";
import { checkForUpdate, CURRENT_VERSION } from "../version.ts";
import { USER_BAR, ASSISTANT_BAR, THINKING, THINKING_BODY } from "./theme.ts";
import { Panel } from "./Panel.tsx";

// The chat scrollback is a chronological list of typed blocks (thought, tool, text, …),
// committed in the order they happen during a turn — so reasoning, tool runs and the answer
// read top-to-bottom in real order, instead of "all thinking up top, all tools at the bottom".
// (ToolEntry is declared just below; type aliases are hoisted so the forward reference is fine.)
type HistoryItem =
  | { kind: "user"; id: number; content: string }
  | { kind: "assistant"; id: number; content: string; durationMs?: number; mode?: string; model?: string }
  | { kind: "thought"; id: number; content: string; ms?: number }
  | { kind: "tool"; id: number; tool: ToolEntry }
  | { kind: "error"; id: number; content: string };

/** Turn a failed-turn error into a clear, permanent one-liner (no stack trace). A
 *  MissingApiKeyError already carries actionable multi-line text, so pass it through. */
export function formatTurnError(err: unknown): string {
  if (err instanceof MissingApiKeyError) return err.message;
  const msg = err instanceof Error ? err.message : String(err);
  const firstLine = (msg.split("\n")[0] ?? msg).trim();
  return `⚠ Request failed: ${firstLine || "unknown error"}`;
}

export type ToolEntry = {
  // Real toolCallId from the SDK (not an internal counter): correlates call/result
  // even when multiple tools run in parallel and results arrive out of order.
  id: string;
  toolName: string;
  input: unknown;
  output?: string;
  isError?: boolean;
  diff?: DiffLine[] | null;
};

export default function App({ session }: { session: Session }) {
  const { exit } = useApp();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [streaming, setStreaming] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [toolSteps, setToolSteps] = useState<ToolEntry[]>([]);
  const [busy, setBusy] = useState(false);
  // Confirmation requests as a QUEUE, not a single slot (fix/01). Multiple mutating
  // tools can request "ask" confirmation in the SAME parallel step (the AI SDK runs
  // tool-calls with Promise.all): a single resolver would be overwritten by the 2nd
  // request and the 1st Promise would hang forever, deadlocking the turn. Head = active.
  const [confirmQueue, setConfirmQueue] = useState<
    Array<{ id: number; tool: string; preview: string; resolve: (v: boolean) => void }>
  >([]);
  const [statusText, setStatusText] = useState<string>("");
  const [showSessions, setShowSessions] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [showModel, setShowModel] = useState(false);
  const [showProvider, setShowProvider] = useState(false);
  const [showTodos, setShowTodos] = useState(true); // Ctrl+T toggle (fix/08 A2)
  const [collapsedTools, setCollapsedTools] = useState(false); // Ctrl+O toggle (fix/08 A4)
  const [showReverseSearch, setShowReverseSearch] = useState(false); // Ctrl+R (fix/08 A6)
  const [acIdx, setAcIdx] = useState(0);
  // @-file mentions: the project file list (scanned once), kept both in state (for reactive
  // render) and in a ref (for onSubmit, which can't depend on it without stale closures).
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
  const projectFilesRef = useRef<string[]>([]);
  const [draft, setDraft] = useState("");
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const [gitBranch, setGitBranch] = useState("");
  const [todos, setTodosState] = useState<Todo[]>(session.todos ?? []);
  // Same queue treatment for the question tool (fix/01): same deadlock if the model
  // invokes `question` 2+ times in one step.
  const [questionQueue, setQuestionQueue] = useState<
    Array<{ id: number; questions: QuestionSpec[]; resolve: (a: Answers) => void }>
  >([]);
  const reqIdRef = useRef(0); // monotonic id for confirm/question requests (React key)
  const [phIdx, setPhIdx] = useState(0); // placeholder example index (it. 25)
  const [update, setUpdate] = useState<string | null>(null); // newer version (it. 28)
  const [sessionTitle, setSessionTitle] = useState(session.meta.title || "");
  const { toasts, addToast } = useToast();
  // Head-of-queue = the request currently shown to the user (null if none).
  const confirm = confirmQueue[0] ?? null;
  const question = questionQueue[0] ?? null;
  const messagesRef = useRef<ModelMessage[]>(session.messages);
  const aborterRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(session);

  useEffect(() => { sessionRef.current = session; }, [session]);

  // Scan the project files once for @-mentions (non-blocking, best-effort).
  useEffect(() => {
    scanProjectFiles(process.cwd())
      .then((f) => { projectFilesRef.current = f; setProjectFiles(f); })
      .catch(() => {});
  }, []);

  // Update check (it. 28): non-blocking, throttled, silent offline.
  useEffect(() => {
    checkForUpdate().then(setUpdate).catch(() => {});
  }, []);

  // Set the terminal tab/window title to reflect the session name.
  useEffect(() => {
    const title = sessionTitle ? `i: ${sessionTitle}` : "interference";
    process.stdout.write(`\x1b]0;${title}\x07`);
  }, [sessionTitle]);

  // Todos: restore from session and re-render on each tool update.
  useEffect(() => {
    setTodos(session.todos ?? []);
    setTodosState(session.todos ?? []);
    const unsub = subscribeTodos((t) => setTodosState([...t]));
    return unsub;
  }, []);

  useEffect(() => {
    // Enqueue instead of overwriting a single slot (fix/01): each concurrent request
    // keeps its own resolver; the UI shows the head and advances on answer.
    const handler: ConfirmHandler = (tool, preview) =>
      new Promise<boolean>((resolve) => {
        const id = ++reqIdRef.current;
        setConfirmQueue((q) => [...q, { id, tool, preview, resolve }]);
      });
    setConfirmHandler(handler);
    return () => setConfirmHandler(null);
  }, []);

  // Question tool (RF-15): event-driven handler, same queue treatment as confirmation.
  useEffect(() => {
    setAnswerHandler(
      (qs) =>
        new Promise<Answers>((resolve) => {
          const id = ++reqIdRef.current;
          setQuestionQueue((q) => [...q, { id, questions: qs, resolve }]);
        }),
    );
    return () => setAnswerHandler(null);
  }, []);

  // Autocomplete navigation: arrow keys ↑↓ move selection when draft is "/…".
  // Enter (TextInput.onSubmit) runs the highlighted command → no conflict.
  const acLastKey = useRef(0);
  const cmdHistory = useRef<string[]>([]);
  const cmdHistoryIdx = useRef(-1);

  // Direct keyboard shortcuts (fix/08 Percorso A) — the frequent actions get a single
  // key instead of a text command, matching mature terminal agents. Guarded so they
  // never fire while a dialog/picker is open or disrupt normal typing.
  useInput((input, key) => {
    if (
      confirm ||
      question ||
      showThinking ||
      showSessions ||
      showModel ||
      showProvider ||
      showReverseSearch
    )
      return;

    // A1 — Esc interrupts the current turn (reuses the existing AbortController).
    // The work done so far is kept (see doTurn's abort branch).
    if (key.escape && busy) {
      aborterRef.current?.abort();
      return;
    }
    // A3 — Shift+Tab cycles Plan/Build (same setMode codepath as /plan and /build).
    if (key.tab && key.shift) {
      const next = currentMode() === "plan" ? "build" : "plan";
      setMode(next);
      sessionRef.current.meta.mode = next;
      addToast(`${next === "plan" ? "Plan" : "Build"} mode`, "info");
      return;
    }
    // A2 — Ctrl+T toggles the todo list.
    if (key.ctrl && input === "t") {
      setShowTodos((s) => !s);
      return;
    }
    // A4 — Ctrl+O collapses/expands the tool output detail.
    if (key.ctrl && input === "o") {
      setCollapsedTools((c) => !c);
      return;
    }
    // A6 — Ctrl+R opens reverse search over the prompt history.
    if (key.ctrl && input === "r" && !busy && cmdHistory.current.length > 0) {
      setShowReverseSearch(true);
      return;
    }
  });

  // Active @-file mention token + its ranked matches (recomputed each render; fresh in the
  // useInput/onSubmit closures). Slash commands take priority over @.
  const atToken = draft.startsWith("/") ? null : getAtQuery(draft);
  const fileMatches = atToken ? rankFileMentions(projectFiles, atToken.query) : [];

  useInput((_input, key) => {
    if (confirm || question || showThinking || showSessions || showModel || showProvider || showReverseSearch) return;

    // @-file mention menu open: arrows navigate (throttled like the slash menu), Tab inserts
    // the highlighted path. Enter is handled in onSubmit (same pattern as slash).
    if (fileMatches.length > 0 && atToken) {
      if (key.upArrow || key.downArrow) {
        const now = Date.now();
        if (now - acLastKey.current < 120) return;
        acLastKey.current = now;
        if (key.upArrow) setAcIdx((i) => (i > 0 ? i - 1 : fileMatches.length - 1));
        else setAcIdx((i) => (i < fileMatches.length - 1 ? i + 1 : 0));
        return;
      }
      if (key.tab) {
        const sel = fileMatches[((acIdx % fileMatches.length) + fileMatches.length) % fileMatches.length]!;
        setDraft(insertMention(draft, atToken.at, sel));
        setAcIdx(0);
        return;
      }
    }

    // Command history: up/down arrow without active slash
    if (!draft.startsWith("/")) {
      if (key.upArrow && cmdHistory.current.length > 0) {
        cmdHistoryIdx.current = Math.min(
          cmdHistoryIdx.current + 1,
          cmdHistory.current.length - 1,
        );
        setDraft(cmdHistory.current[cmdHistoryIdx.current]!);
        setAcIdx(0);
        return;
      }
      if (key.downArrow) {
        if (cmdHistoryIdx.current > 0) {
          cmdHistoryIdx.current--;
          setDraft(cmdHistory.current[cmdHistoryIdx.current]!);
        } else {
          cmdHistoryIdx.current = -1;
          setDraft("");
        }
        setAcIdx(0);
        return;
      }
    }

    // Autocomplete: arrows when draft is "/…"
    if (!draft.startsWith("/")) return;
    const ms = matchCommands(draft.slice(1));
    if (ms.length === 0) return;
    const now = Date.now();
    if (now - acLastKey.current < 120) return;
    acLastKey.current = now;
    if (key.upArrow) setAcIdx((i) => (i > 0 ? i - 1 : ms.length - 1));
    else if (key.downArrow) setAcIdx((i) => (i < ms.length - 1 ? i + 1 : 0));
  });

  const nextId = (): number => Date.now() + Math.random();

  // Readable title from the first message (collapse spaces, cap ~40 char).
  const deriveTitle = (text: string): string => {
    const t = text.replace(/\s+/g, " ").trim();
    return t.length > 40 ? t.slice(0, 40).trimEnd() + "…" : t;
  };

  async function doCompact() {
    const pct = getUsagePercent(messagesRef.current);
    if (!shouldCompact(messagesRef.current)) {
      setStatusText(`Context at ${pct}%. No compaction needed.`);
      return;
    }
    setStatusText(`Compacting…`);
    setBusy(true);
    const compacted = await compactMessages(messagesRef.current);
    messagesRef.current.length = 0;
    messagesRef.current.push(...compacted);
    sessionRef.current.messages = messagesRef.current;
    await saveSession(sessionRef.current);
    setBusy(false);
    const newPct = getUsagePercent(messagesRef.current);
    setStatusText(`${pct}% → ${newPct}%`);
    addToast(`Compacted: ${pct}% → ${newPct}%`, "info");
  }

  async function doTurn(userText: string, skillBodies?: string[]) {
    setStatusText("");
    setBusy(true);
    setStreaming("");
    setReasoning("");
    setToolSteps([]);

    setHistory((h) => [...h, { kind: "user", id: nextId(), content: userText }]);

    nextTurn();
    // Auto-title on first interaction (if not already renamed by the user).
    if (!sessionRef.current.meta.title) {
      sessionRef.current.meta.title = deriveTitle(userText);
    }
    setSessionTitle(sessionRef.current.meta.title ?? "");
    messagesRef.current.push({ role: "user", content: userText });
    aborterRef.current = new AbortController();

    // Chronological commit: each completed segment — a thought, a
    // tool run, a block of answer text — is pushed to `history` (the Static scrollback) IN THE
    // ORDER it happens, so a turn reads top-to-bottom as it actually occurred (no more "all
    // thinking up top, all tools at the bottom"). Only the in-progress segment stays in the
    // live region below. acc/reasoningAcc/liveTools are the source of truth; the throttled
    // setStreaming/setReasoning only drive the live display.
    const turnStart = Date.now();
    let fold = initTurnFold(); // in-progress turn state (source of truth); see foldTurnChunk

    const commit = (item: HistoryItem) => setHistory((h) => [...h, item]);
    // Turn a completed TurnBlock into a history item (assigns id/model/mode/duration here).
    const commitBlocks = (blocks: TurnBlock[]) => {
      for (const b of blocks) {
        if (b.type === "thought") commit({ kind: "thought", id: nextId(), content: b.content, ms: b.ms });
        else if (b.type === "tool") commit({ kind: "tool", id: nextId(), tool: b.tool });
        else commit({ kind: "assistant", id: nextId(), content: b.content, durationMs: Date.now() - turnStart, mode: currentMode(), model: currentModel() });
      }
    };

    // Throttle live streaming updates (fix/07): flush at ~12.5 Hz instead of per chunk,
    // so the terminal has room to process mouse scroll during a turn. Final text unchanged.
    const nowMs = () => Date.now();
    const streamFlush = createStreamFlusher(setStreaming, nowMs);
    const reasoningFlush = createStreamFlusher(setReasoning, nowMs);

    try {
      const chunks = runTurn(messagesRef.current, aborterRef.current.signal, undefined, skillBodies);

      for await (const chunk of chunks) {
        const { commit: blocks, state } = foldTurnChunk(fold, chunk, Date.now());
        fold = state;
        if (blocks.length > 0) {
          // A boundary happened (a segment closed): commit it, and snap the live display to
          // the new state at once so the just-closed thought/text doesn't linger below.
          commitBlocks(blocks);
          setReasoning(fold.reasoning);
          setStreaming(fold.text);
        } else {
          // Incremental streaming within the same segment: throttle the live display.
          reasoningFlush.push(fold.reasoning);
          streamFlush.push(fold.text);
        }
        setToolSteps(fold.tools);
      }

      // Flush the throttled display, then commit whatever is still open, in order.
      streamFlush.finish();
      reasoningFlush.finish();
      commitBlocks(finishTurnFold(fold, Date.now()));

      sessionRef.current.meta.turnCount++;
      sessionRef.current.todos = getTodos();
      sessionRef.current.usage = getRawUsage();
      await finalizeSnapshots();
      await saveSession(sessionRef.current);
      addToast("Session saved", "success");

      if (shouldCompact(messagesRef.current)) {
        const pct = getUsagePercent(messagesRef.current);
        setStatusText(`Compacting…`);
        setBusy(true);
        const compacted = await compactMessages(messagesRef.current);
        messagesRef.current.length = 0;
        messagesRef.current.push(...compacted);
        setBusy(false);
        setStatusText(`${pct}% → ${getUsagePercent(messagesRef.current)}%`);
        addToast(`Compacted: ${pct}% → ${getUsagePercent(messagesRef.current)}%`, "info");
      }
    } catch (err) {
      // Esc interrupt (fix/08 A1): the AbortController's signal is set. Keep the work done so
      // far visible (blocks already committed in order + flush the open partial), and drop the
      // half-recorded turn from the model context so the next turn starts clean.
      const aborted = aborterRef.current?.signal.aborted ?? false;
      commitBlocks(finishTurnFold(fold, Date.now()));
      messagesRef.current.pop();
      if (aborted) {
        addToast("Interrupted", "info");
      } else {
        // A failed turn (provider 402 "no credit", 429, network, invalid model, …): a VISIBLE,
        // permanent error block. Any partial work was already committed above. Previously the
        // error went to `streaming`, which the finally cleared → an empty turn, zero feedback.
        commit({ kind: "error", id: nextId(), content: formatTurnError(err) });
        addToast("Turn failed", "error");
      }
    } finally {
      setStreaming("");
      setReasoning("");
      setToolSteps([]);
      setBusy(false);
      setPhIdx((i) => i + 1); // rotate placeholder example
      aborterRef.current = null;

      if (messageQueue.length > 0) {
        const next = messageQueue[0];
        setMessageQueue((q) => q.slice(1));
        if (next) setTimeout(() => doTurn(next), 0);
      }
    }
  }

  const onSubmit = useCallback(
    (value: string) => {
      let v = value.trim();
      if (!v) return;
      // @-file mention menu open: Enter inserts the highlighted path instead of sending.
      // Use the RAW value (a trailing space means the token is already closed → send).
      if (!value.startsWith("/")) {
        const at = getAtQuery(value);
        if (at) {
          const matches = rankFileMentions(projectFilesRef.current, at.query);
          if (matches.length > 0) {
            const sel = matches[((acIdx % matches.length) + matches.length) % matches.length]!;
            setDraft(insertMention(value, at.at, sel));
            setAcIdx(0);
            return;
          }
        }
      }
      setDraft("");
      if (busy) {
        setMessageQueue((q) => [...q, v]);
        addToast(`Queued (${messageQueue.length + 1} pending)`, "info");
        return;
      }
      // If it's a partial slash without arguments, run the HIGHLIGHTED command
      // in the autocomplete (arrows) instead of requiring the full name.
      if (v.startsWith("/") && !v.includes(" ")) {
        const ms = matchCommands(v.slice(1));
        if (ms.length > 0) {
          const sel = ms[((acIdx % ms.length) + ms.length) % ms.length];
          if (sel) v = "/" + sel.name;
        }
      }
      setAcIdx(0);
      if (!v.startsWith("/")) {
        cmdHistory.current.unshift(v);
        if (cmdHistory.current.length > 100) cmdHistory.current.pop();
      }
      cmdHistoryIdx.current = -1;
      if (v === "/exit" || v === "/quit") return exit();
      if (v === "/sessions") { setShowSessions(true); return; }
      if (v === "/thinking") { setShowThinking(true); return; }
      if (v === "/model") { setShowModel(true); return; }
      if (v === "/provider") { setShowProvider(true); return; }
      if (v === "/compact") {
        doCompact();
        return;
      }

      if (isSlashCommand(v)) {
        dispatch(v, {
          setMode: (m) => { setMode(m); sessionRef.current.meta.mode = m; },
          clearMessages: () => {
            messagesRef.current = [];
            setHistory([]);
            setTodos([]);
            resetUsage();
            setStatusText("Conversation cleared.");
          },
          doInit: async (args) => {
            setBusy(true);
            try {
            // Scaffold the .agents/ memory/decisions/skills skeleton + gitignore it (F3),
            // deterministically, before the LLM writes AGENTS.md.
            await scaffoldAgents(process.cwd());
            const template = `Set up this project for AI agents. The \`.agents/{memory,decisions,skills}/\` skeleton has already been created and gitignored. Write everything you create (AGENTS.md, memory) in English.

Generate or update the AGENTS.md file at the project root. Key sections:
- Project overview, stack, directory structure
- Build/test commands, code conventions
- Agent skills and triggers
- The memory workflow: record durable facts in .agents/memory/<topic>.md + index them in .agents/memory/MEMORY.md
- Non-negotiable rules

How to proceed:
1. Use ls, glob, grep, and read to explore the project thoroughly
2. Identify languages, frameworks, build system, test setup, conventions
3. Write AGENTS.md at the project root using the write tool
4. If you discovered durable facts not obvious from the code, record them in .agents/memory/
5. Confirm what was created and summarize it

${args ? `Additional context: ${args}` : ""}`;
            nextTurn();
            messagesRef.current.push({ role: "user" as const, content: template });
            const aborter = new AbortController();
            const chunks = runTurn(messagesRef.current, aborter.signal);
            for await (const chunk of chunks) {}
            sessionRef.current.meta.turnCount++;
            await finalizeSnapshots();
            await saveSession(sessionRef.current);
            return "AGENTS.md generated successfully.";
            } catch (err) {
              messagesRef.current.pop();
              return `Init failed: ${err instanceof Error ? err.message : String(err)}`;
            } finally {
              setBusy(false);
            }
          },
          doSkill: async (name, body) => {
            setBusy(true);
            setStreaming("");
            setReasoning("");
            setToolSteps([]);
            try {
              nextTurn();
              messagesRef.current.push({ role: "user" as const, content: `Help with this task. Use the skill context provided in the system prompt.` });
              const aborter = new AbortController();
              const chunks = runTurn(messagesRef.current, aborter.signal, undefined, [body]);
              let acc = "";
              for await (const chunk of chunks) {
                if (chunk.type === "text") { acc += chunk.text; setStreaming(acc); }
              }
              if (acc) {
                setHistory((h) => [...h, { kind: "assistant", id: nextId(), content: acc }]);
              }
              sessionRef.current.meta.turnCount++;
              await finalizeSnapshots();
              await saveSession(sessionRef.current);
              return `Skill '${name}' executed.`;
            } catch (err) {
              messagesRef.current.pop();
              return `Skill failed: ${err instanceof Error ? err.message : String(err)}`;
            } finally {
              setStreaming("");
              setReasoning("");
              setToolSteps([]);
              setBusy(false);
            }
          },
          doSessions: async () => {
            setShowSessions(true);
            return "";
          },
          doRename: async (name) => {
            sessionRef.current.meta.title = name;
            await saveSession(sessionRef.current);
            setSessionTitle(name);
            return `Session renamed to '${name}'.`;
          },
          doCompact: async () => {
            doCompact();
            return "";
          },
          doReview: async () => {
            setBusy(true);
            try {
              const diff = await getWorkingDiff();
              return await runReview(diff);
            } catch (err) {
              return `Review failed: ${err instanceof Error ? err.message : String(err)}`;
            } finally {
              setBusy(false);
            }
          },
        }).then((result) => {
          if (result) setStatusText(result);
        });
        return;
      }

      async function runWithSkills() {
        const matchedSkills = matchSkills(v, getCachedRegistry());
        const skillBodies: string[] = [];
        for (const name of matchedSkills) {
          const body = await loadSkillBody(name);
          if (body) skillBodies.push(body);
        }
        if (skillBodies.length > 0) {
          setStatusText(`Skills matched: ${matchedSkills.join(", ")}`);
        }
        doTurn(v, skillBodies.length > 0 ? skillBodies : undefined);
      }

      runWithSkills();
    },
    [busy, exit, acIdx],
  );

  return (
    <Box flexDirection="column" padding={1}>
      {showSessions && (
        <SessionList
          onSelect={async (id) => {
            setShowSessions(false);
            const loaded = await loadSession(id);
            if (loaded) {
              messagesRef.current = loaded.messages;
              sessionRef.current = loaded;
              setTodos(loaded.todos ?? []);
              restoreUsage(loaded.usage);
              // Rebuild history from saved messages. Content can be a string or an
              // ARRAY of parts ({type:"text"|"reasoning"|...}): extract text and
              // reasoning instead of stringifying (was rendered as raw JSON).
              const items: HistoryItem[] = [];
              let nid = Date.now();
              for (const m of loaded.messages) {
                if (m.role !== "user" && m.role !== "assistant") continue;
                let text = "";
                let reasoning = "";
                if (typeof m.content === "string") {
                  text = m.content;
                } else if (Array.isArray(m.content)) {
                  for (const p of m.content as Array<{ type?: string; text?: string }>) {
                    if (p?.type === "text" && p.text) text += p.text;
                    else if (p?.type === "reasoning" && p.text) reasoning += p.text;
                  }
                }
                if (!text && !reasoning) continue; // skip tool-only messages
                if (m.role === "user") {
                  items.push({ kind: "user", id: nid++, content: text });
                } else {
                  // A saved assistant turn → its thought (collapsed) then its answer, in order.
                  if (reasoning) items.push({ kind: "thought", id: nid++, content: reasoning });
                  if (text) items.push({ kind: "assistant", id: nid++, content: text });
                }
              }
              setHistory(items);
              setStreaming("");
              setReasoning("");
              setToolSteps([]);
              setSessionTitle(loaded.meta.title || "");
              addToast(`Resumed '${loaded.meta.title || id.slice(0, 12)}' (${loaded.meta.turnCount} turns)`, "success");
            } else {
              addToast(`Session ${id.slice(0, 12)} not found`, "error");
            }
          }}
          onCancel={() => setShowSessions(false)}
        />
      )}

      {showThinking && (
        <ThinkingPicker
          onSelect={(level) => {
            setShowThinking(false);
            setThinking(level);
            addToast(`Thinking set to ${level}`, "success");
          }}
          onCancel={() => setShowThinking(false)}
        />
      )}

      {showModel && (
        <ModelPicker onCancel={() => setShowModel(false)} />
      )}

      {showProvider && (
        <ProviderPicker onClose={() => setShowProvider(false)} />
      )}

      {!showThinking && !showSessions && !showModel && !showProvider && (
        <>
          <ToastContainer toasts={toasts} />

          {history.length === 0 && !busy && (
            <Welcome
              provider={currentProvider().label}
              model={currentModel()}
              sessionCount={0}
              update={update}
            />
          )}

          <Static items={history}>
            {(m) => <MsgBlock key={m.id} item={m} />}
          </Static>

          {reasoning && <ReasoningBlock text={reasoning} live />}

          {streaming && <RoleBlock color={ASSISTANT_BAR} content={streaming} markdown />}

          {countPendingTasks(toolSteps) > 1 && (
            <Box paddingLeft={3} marginBottom={1}>
              <Text dimColor>⇉ {countPendingTasks(toolSteps)} subagents running in parallel</Text>
            </Box>
          )}
          {toolSteps.map((t) => (
            <ToolStep key={t.id} tool={t} collapsed={collapsedTools} />
          ))}

          {busy && !streaming && !reasoning && !hasPendingTool(toolSteps) && !confirm && (
            <Box marginBottom={1}>
              <Spinner label="thinking" />
            </Box>
          )}

          {/* Head-of-queue confirmation (fix/01). Keyed by request id so each one starts
              fresh (default Deny). On answer: resolve THIS request, advance the queue. */}
          {confirm && (
            <>
              <ConfirmDialog
                key={confirm.id}
                tool={confirm.tool}
                preview={confirm.preview}
                onResolve={(allowed) => {
                  confirm.resolve(allowed);
                  setConfirmQueue((q) => q.slice(1));
                }}
              />
              {confirmQueue.length > 1 && (
                <Box paddingLeft={1}>
                  <Text dimColor>+{confirmQueue.length - 1} more confirmation(s) waiting</Text>
                </Box>
              )}
            </>
          )}

          {question && (
            <>
              <QuestionDialog
                key={question.id}
                questions={question.questions}
                onResolve={(answers) => {
                  question.resolve(answers);
                  setQuestionQueue((q) => q.slice(1));
                }}
              />
              {questionQueue.length > 1 && (
                <Box paddingLeft={1}>
                  <Text dimColor>+{questionQueue.length - 1} more question(s) waiting</Text>
                </Box>
              )}
            </>
          )}

          {draft.startsWith("/") && !question && (
            <SlashAutocomplete filter={draft.slice(1)} selected={acIdx} />
          )}

          {atToken && fileMatches.length > 0 && !question && (
            <FileMentionMenu matches={fileMatches} selected={acIdx} />
          )}

          {/* Command/status notice: directly ABOVE the input (conventional TUI style), not in the footer */}
          {statusText && !confirm && !question && !showSessions && (
            <Box paddingLeft={1}>
              <Text dimColor>{statusText}</Text>
            </Box>
          )}

          {/* Queued prompts: show the TEXT of what's waiting, not just the count
              (the data is already there as a string[]) — fix 05. */}
          {!confirm && !question && <QueuedPrompts queue={messageQueue} />}

          {/* Todos: moved DOWN here (just above the input) so they don't push the live work
              off-screen, and shown only when there's an active task (TodoList returns null
              otherwise). Ctrl+T still hides/shows them. */}
          {showTodos && <TodoList todos={todos} />}

          {showReverseSearch && (
            <ReverseSearch
              history={cmdHistory.current}
              onAccept={(value) => {
                setShowReverseSearch(false);
                setDraft(value);
                setAcIdx(0);
              }}
              onCancel={() => setShowReverseSearch(false)}
            />
          )}

          {!confirm && !question && !showSessions && !showReverseSearch && (
            <Box borderStyle="round" borderColor="gray" paddingX={1}>
              <Text color="white" bold>{"› "}</Text>
              <TextInput
                value={draft}
                onChange={(val: string) => {
                  if (val !== draft) setAcIdx(0);
                  setDraft(val);
                }}
                placeholder={busy ? `working… (${messageQueue.length} queued)` : placeholderFor(sessionRef.current.meta.mode, phIdx)}
                onSubmit={onSubmit}
              />
            </Box>
          )}

          <StatusFooter
            mode={sessionRef.current.meta.mode}
            model={currentModel()}
            provider={currentProvider().label}
            thinking={currentThinking()}
            contextTokens={messagesRef.current.length > 0 ? estimateMessagesTokens(messagesRef.current) : 0}
            contextLimit={getContextLimit()}
            busy={busy}
            statusLine=""
            cost={formatCost(getTotalCost())}
            gitBranch={gitBranch}
          />
        </>
      )}
    </Box>
  );
}

// Queued prompts waiting to run (fix 05): shows the TEXT (first 3, truncated) + a
// "+N more" tail, not just the count. Renders nothing when the queue is empty.
export function QueuedPrompts({ queue }: { queue: string[] }) {
  if (queue.length === 0) return null;
  return (
    <Box flexDirection="column" paddingLeft={1} marginBottom={1}>
      {queue.slice(0, 3).map((q, i) => (
        <Text key={i} dimColor>
          {"› "}
          {q.length > 60 ? q.slice(0, 60) + "…" : q}
        </Text>
      ))}
      {queue.length > 3 && (
        <Text dimColor>{`  … +${queue.length - 3} more queued`}</Text>
      )}
    </Box>
  );
}

// Assistant response: gray sidebar (left border) on bare background.
// The contrast with the user message (filled panel) differentiates them.
function RoleBlock({
  color,
  content,
  markdown,
  footer,
}: {
  color: string;
  content: string;
  markdown?: boolean;
  footer?: string;
}) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={color}
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      paddingLeft={1}
      marginBottom={1}
    >
      {markdown ? <MarkdownText content={content} /> : <Text>{content}</Text>}
      {footer && <Text dimColor>{footer}</Text>}
    </Box>
  );
}

// THINKING phase: amber header "✻ Thinking/Thought · duration" + dimmed body.
// Distinct from execution (tool icons, white) and response (full white markdown).
function ReasoningBlock({ text, live, ms, collapsed }: { text: string; live?: boolean; ms?: number; collapsed?: boolean }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!live) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [live]);

  const title = reasoningSummary(text);
  const titlePart = title ? `: ${title}` : live ? "…" : "";
  const header = live
    ? `✻ Thinking${titlePart}${elapsed > 0 ? ` · ${elapsed}s` : ""}`
    : `✻ Thought${titlePart}${ms ? ` · ${(ms / 1000).toFixed(1)}s` : ""}`;

  // Live: streaming tail. History: full text from start, capped.
  const body = live
    ? text.length > 400 ? "…" + text.slice(-400) : text
    : text.length > 700 ? text.slice(0, 700) + " …" : text;

  return (
    <Box flexDirection="column" paddingLeft={3} marginBottom={1}>
      <Text color={THINKING} bold>
        {header}
      </Text>
      {!collapsed && <Text color={THINKING_BODY}>{body}</Text>}
    </Box>
  );
}

export function MsgBlock({ item }: { item: HistoryItem }) {
  switch (item.kind) {
    case "user":
      return <Panel content={item.content} bar="▌" barColor={USER_BAR} />;
    // Committed thought: collapsed to its header (✻ Thought: summary · Ns), body hidden —
    // the reasoning "bubble" closes once the answer arrives.
    case "thought":
      return <ReasoningBlock text={item.content} ms={item.ms} collapsed />;
    case "tool":
      return <ToolStep tool={item.tool} />;
    case "error":
      return (
        <Box paddingLeft={1}>
          <Text color="red">{item.content}</Text>
        </Box>
      );
    case "assistant": {
      const secs = (ms?: number) => (ms ? `${(ms / 1000).toFixed(1)}s` : "");
      const footer = item.model
        ? `▣ ${item.mode ?? ""} · ${item.model}${item.durationMs ? ` · ${secs(item.durationMs)}` : ""}`
        : undefined;
      return <RoleBlock color={ASSISTANT_BAR} content={item.content} markdown footer={footer} />;
    }
  }
}


function computeToolDiff(
  toolName: string,
  input: Record<string, unknown> | undefined,
  output: string | null,
): DiffLine[] | null {
  if (!input || output === null || (output && output.startsWith("Error"))) return null;

  if (toolName === "edit" && typeof input.oldString === "string" && typeof input.newString === "string") {
    return computeDiff(
      (input.oldString as string).split("\n"),
      (input.newString as string).split("\n"),
    );
  }

  if (toolName === "write" && typeof input.content === "string") {
    return computeDiff([], (input.content as string).split("\n"));
  }

  return null;
}

// Pure state-reduction functions for tool steps, extracted to be testable in
// isolation. Key = chunk.toolCallId (from the SDK), not a "last id" counter: with
// multiple parallel tools, results arrive in an order not guaranteed to match the call order.
export function addToolCall(
  steps: ToolEntry[],
  chunk: Extract<Chunk, { type: "tool-call" }>,
): ToolEntry[] {
  return [...steps, { id: chunk.toolCallId, toolName: chunk.toolName, input: chunk.input }];
}

export function applyToolResult(
  steps: ToolEntry[],
  chunk: Extract<Chunk, { type: "tool-result" }>,
): ToolEntry[] {
  return steps.map((t) => {
    if (t.id !== chunk.toolCallId) return t;
    const diff = computeToolDiff(t.toolName, t.input as Record<string, unknown>, chunk.isError ? null : chunk.output);
    return { ...t, output: chunk.output, isError: chunk.isError, diff };
  });
}

// Number of `task` subagents currently pending (no output yet) — used to show an
// explicit "N subagents running in parallel" indicator when the model launches more
// than one task tool-call in the same step (Promise.all under the hood).
export function countPendingTasks(steps: ToolEntry[]): number {
  return steps.filter((t) => t.toolName === "task" && t.output === undefined).length;
}

// True if any tool-call in this turn is still executing (no result yet). Used to
// decide the "thinking" spinner: turn HISTORY (past, completed tool steps) must not
// suppress it — only something running RIGHT NOW should. Fixes the case where the
// spinner never reappeared after the first tool step (toolSteps accumulates and is
// never emptied mid-turn).
export function hasPendingTool(steps: ToolEntry[]): boolean {
  return steps.some((t) => t.output === undefined);
}

// Chronological turn folding. A turn is a stream of typed blocks; this pure reducer decides,
// per streamed chunk, which completed blocks to COMMIT (in order) and how the in-progress
// "live" state looks — so the UI reads top-to-bottom as it happened (thought → tool → thought
// → answer), not "all thinking up top, all tools at the bottom". A new kind of event closes
// any open thought/answer first. Pure (no React/ids/clock beyond injected `now`) → testable;
// App turns TurnBlocks into HistoryItems (assigning ids/model/mode) and drives the live region.
export type TurnBlock =
  | { type: "thought"; content: string; ms?: number }
  | { type: "tool"; tool: ToolEntry }
  | { type: "assistant"; content: string };

export interface TurnFold {
  reasoning: string;
  reasoningStart: number; // 0 = no thought currently open
  text: string;
  tools: ToolEntry[];
}

export function initTurnFold(): TurnFold {
  return { reasoning: "", reasoningStart: 0, text: "", tools: [] };
}

export function foldTurnChunk(state: TurnFold, chunk: Chunk, now: number): { commit: TurnBlock[]; state: TurnFold } {
  const commit: TurnBlock[] = [];
  let { reasoning, reasoningStart, text, tools } = state;

  const closeThought = () => {
    if (reasoning) {
      commit.push({ type: "thought", content: reasoning, ms: reasoningStart ? now - reasoningStart : undefined });
      reasoning = "";
      reasoningStart = 0;
    }
  };
  const closeText = () => {
    if (text) {
      commit.push({ type: "assistant", content: text });
      text = "";
    }
  };

  switch (chunk.type) {
    case "reasoning":
      closeText(); // answer text before more thinking (rare) closes first
      if (!reasoningStart) reasoningStart = now;
      reasoning += chunk.text;
      break;
    case "text":
      closeThought(); // thinking is done, the answer begins
      text += chunk.text;
      break;
    case "tool-call":
      closeThought();
      closeText();
      tools = addToolCall(tools, chunk);
      break;
    case "tool-result":
      tools = applyToolResult(tools, chunk);
      // Commit finished tools (completion order); keep still-running ones live.
      for (const t of tools.filter((x) => x.output !== undefined)) commit.push({ type: "tool", tool: t });
      tools = tools.filter((x) => x.output === undefined);
      break;
  }
  return { commit, state: { reasoning, reasoningStart, text, tools } };
}

/** Flush whatever is still open at end-of-turn (or on interrupt), in order. */
export function finishTurnFold(state: TurnFold, now: number): TurnBlock[] {
  const out: TurnBlock[] = [];
  if (state.reasoning) out.push({ type: "thought", content: state.reasoning, ms: state.reasoningStart ? now - state.reasoningStart : undefined });
  if (state.text) out.push({ type: "assistant", content: state.text });
  for (const t of state.tools) out.push({ type: "tool", tool: t });
  return out;
}
