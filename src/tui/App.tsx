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
import { shouldCompact, compactMessages, getUsagePercent } from "../agent/compaction.ts";
import { computeDiff, type DiffLine } from "./DiffView.tsx";
import { formatCost, getTotalCost, getUsageStats } from "../cost.ts";
import { getGitBranch } from "../git.ts";
import { StatusFooter } from "./StatusFooter.tsx";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { SlashAutocomplete } from "./SlashAutocomplete.tsx";
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

type HistoryItem = {
  id: number;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  reasoningMs?: number;
  durationMs?: number;
  mode?: string;
  model?: string;
};

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
  const [confirmPreview, setConfirmPreview] = useState<string | null>(null);
  const [confirmTool, setConfirmTool] = useState<string>("");
  const [statusText, setStatusText] = useState<string>("");
  const [showSessions, setShowSessions] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [showModel, setShowModel] = useState(false);
  const [showProvider, setShowProvider] = useState(false);
  const [acIdx, setAcIdx] = useState(0);
  const [draft, setDraft] = useState("");
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const [gitBranch, setGitBranch] = useState("");
  const [todos, setTodosState] = useState<Todo[]>(session.todos ?? []);
  const [questions, setQuestions] = useState<QuestionSpec[] | null>(null);
  const [phIdx, setPhIdx] = useState(0); // placeholder example index (it. 25)
  const [update, setUpdate] = useState<string | null>(null); // newer version (it. 28)
  const { toasts, addToast } = useToast();
  const confirmResolveRef = useRef<((v: boolean) => void) | null>(null);
  const answerResolveRef = useRef<((a: Answers) => void) | null>(null);
  const messagesRef = useRef<ModelMessage[]>(session.messages);
  const aborterRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(session);

  useEffect(() => { sessionRef.current = session; }, [session]);

  // Update check (it. 28): non-blocking, throttled, silent offline.
  useEffect(() => {
    checkForUpdate().then(setUpdate).catch(() => {});
  }, []);

  // Todos: restore from session and re-render on each tool update.
  useEffect(() => {
    setTodos(session.todos ?? []);
    setTodosState(session.todos ?? []);
    const unsub = subscribeTodos((t) => setTodosState([...t]));
    return unsub;
  }, []);

  useEffect(() => {
    const handler: ConfirmHandler = async (tool, preview) => {
      setConfirmTool(tool);
      setConfirmPreview(preview);
      return new Promise<boolean>((resolve) => {
        confirmResolveRef.current = resolve;
      });
    };
    setConfirmHandler(handler);
    return () => setConfirmHandler(null);
  }, []);

  // Question tool (RF-15): event-driven handler, same pattern as confirmation.
  useEffect(() => {
    setAnswerHandler(async (qs) => {
      setQuestions(qs);
      return new Promise<Answers>((resolve) => {
        answerResolveRef.current = resolve;
      });
    });
    return () => setAnswerHandler(null);
  }, []);

  useInput((input, key) => {
    if (questions) return;
    if (!confirmResolveRef.current || confirmPreview) return;
    const c = input.toLowerCase();
    if (c === "y" || key.return) {
      const r = confirmResolveRef.current;
      confirmResolveRef.current = null;
      setConfirmTool("");
      setConfirmPreview(null);
      r(true);
    } else if (c === "n" || key.escape) {
      const r = confirmResolveRef.current;
      confirmResolveRef.current = null;
      setConfirmTool("");
      setConfirmPreview(null);
      r(false);
    }
  });

  // Autocomplete navigation: arrow keys ↑↓ move selection when draft is "/…".
  // Enter (TextInput.onSubmit) runs the highlighted command → no conflict.
  const acLastKey = useRef(0);
  const cmdHistory = useRef<string[]>([]);
  const cmdHistoryIdx = useRef(-1);

  useInput((_input, key) => {
    if (confirmPreview || questions || showThinking || showSessions || showModel || showProvider) return;

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

    const userMsg: HistoryItem = {
      id: nextId(),
      role: "user",
      content: userText,
    };
    setHistory((h) => [...h, userMsg]);

    nextTurn();
    // Auto-title on first interaction (if not already renamed by the user).
    if (!sessionRef.current.meta.title) {
      sessionRef.current.meta.title = deriveTitle(userText);
    }
    messagesRef.current.push({ role: "user", content: userText });
    aborterRef.current = new AbortController();
    let acc = "";
    let reasoningAcc = "";
    const turnStart = Date.now();
    let reasoningStart = 0;
    let reasoningMs = 0;

    try {
      const chunks = runTurn(messagesRef.current, aborterRef.current.signal, undefined, skillBodies);

      for await (const chunk of chunks) {
        switch (chunk.type) {
          case "reasoning":
            if (!reasoningStart) reasoningStart = Date.now();
            reasoningAcc += chunk.text;
            setReasoning(reasoningAcc);
            break;

          case "text":
            if (reasoningStart && !reasoningMs) reasoningMs = Date.now() - reasoningStart;
            acc += chunk.text;
            setStreaming(acc);
            break;

          case "tool-call":
            // chunk.toolCallId (from the SDK) is the correlation key — not a shared
            // external variable: with multiple parallel tools (e.g. multiple `task`
            // subagents), results arrive in an order not guaranteed to match the call
            // order, and a single "last id" variable would wrongly attribute every
            // result to the most recently created call.
            setToolSteps((ts) => addToolCall(ts, chunk));
            break;

          case "tool-result":
            setToolSteps((ts) => applyToolResult(ts, chunk));
            break;
        }
      }

      if (acc || reasoningAcc) {
        if (reasoningStart && !reasoningMs) reasoningMs = Date.now() - reasoningStart;
        setHistory((h) => [
          ...h,
          {
            id: nextId(),
            role: "assistant",
            content: acc,
            reasoning: reasoningAcc || undefined,
            reasoningMs: reasoningMs || undefined,
            durationMs: Date.now() - turnStart,
            mode: currentMode(),
            model: currentModel(),
          },
        ]);
      }

      sessionRef.current.meta.turnCount++;
      sessionRef.current.todos = getTodos();
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
      messagesRef.current.pop();
      if (err instanceof MissingApiKeyError) {
        setStreaming(`\n${err.message}`);
      } else if (aborterRef.current === null) {
        // interrupted
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setStreaming(`\n[error] ${msg}`);
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
            setStatusText("Conversation cleared.");
          },
          doInit: async (args) => {
            setBusy(true);
            try {
            const template = `Generate or update the AGENTS.md file at the project root.

Follow the bundled agents-setup skill (see system prompt). Key sections:
- Project overview, stack, directory structure
- Build/test commands, code conventions
- Agent skills and triggers
- Non-negotiable rules

How to proceed:
1. Use ls, glob, grep, and read to explore the project thoroughly
2. Identify languages, frameworks, build system, test setup, conventions
3. Write AGENTS.md at the project root using the write tool
4. Confirm the file was created and summarize its contents

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
                setHistory((h) => [...h, { id: nextId(), role: "assistant", content: acc }]);
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
                items.push({
                  id: nid++,
                  role: m.role as "user" | "assistant",
                  content: text,
                  reasoning: reasoning || undefined,
                });
              }
              setHistory(items);
              setStreaming("");
              setReasoning("");
              setToolSteps([]);
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

          <TodoList todos={todos} />

          {reasoning && <ReasoningBlock text={reasoning} live />}

          {streaming && <RoleBlock color={ASSISTANT_BAR} content={streaming} markdown />}

          {countPendingTasks(toolSteps) > 1 && (
            <Box paddingLeft={3} marginBottom={1}>
              <Text dimColor>⇉ {countPendingTasks(toolSteps)} subagents running in parallel</Text>
            </Box>
          )}
          {toolSteps.map((t) => (
            <ToolStep key={t.id} tool={t} />
          ))}

          {busy && !streaming && toolSteps.length === 0 && !confirmPreview && (
            <Box marginBottom={1}>
              <Spinner label="thinking" />
            </Box>
          )}

          {confirmPreview && (
            <ConfirmDialog
              tool={confirmTool}
              preview={confirmPreview}
              onResolve={(allowed) => {
                if (confirmResolveRef.current) {
                  confirmResolveRef.current(allowed);
                  confirmResolveRef.current = null;
                }
                setConfirmTool("");
                setConfirmPreview(null);
              }}
            />
          )}

          {questions && (
            <QuestionDialog
              questions={questions}
              onResolve={(answers) => {
                if (answerResolveRef.current) {
                  answerResolveRef.current(answers);
                  answerResolveRef.current = null;
                }
                setQuestions(null);
              }}
            />
          )}

          {draft.startsWith("/") && !questions && (
            <SlashAutocomplete filter={draft.slice(1)} selected={acIdx} />
          )}

          {/* Command/status notice: directly ABOVE the input (conventional TUI style), not in the footer */}
          {statusText && !confirmPreview && !questions && !showSessions && (
            <Box paddingLeft={1}>
              <Text dimColor>{statusText}</Text>
            </Box>
          )}

          {!confirmPreview && !questions && !showSessions && (
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
            contextPct={messagesRef.current.length > 0 ? getUsagePercent(messagesRef.current) : 0}
            busy={busy}
            statusLine=""
            turnCount={sessionRef.current.meta.turnCount}
            cost={formatCost(getTotalCost())}
            gitBranch={gitBranch}
            inputTokens={getUsageStats().inputTokens}
            outputTokens={getUsageStats().outputTokens}
          />
        </>
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
function ReasoningBlock({ text, live, ms }: { text: string; live?: boolean; ms?: number }) {
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
      <Text color={THINKING_BODY}>{body}</Text>
    </Box>
  );
}

function MsgBlock({ item }: { item: HistoryItem }) {
  const isUser = item.role === "user";
  const secs = (ms?: number) => (ms ? `${(ms / 1000).toFixed(1)}s` : "");
  const footer =
    !isUser && item.model
      ? `▣ ${item.mode ?? ""} · ${item.model}${item.durationMs ? ` · ${secs(item.durationMs)}` : ""}`
      : undefined;
  if (isUser) {
    return <Panel content={item.content} bar="▌" barColor={USER_BAR} />;
  }
  return (
    <Box flexDirection="column">
      {item.reasoning && <ReasoningBlock text={item.reasoning} ms={item.reasoningMs} />}
      <RoleBlock
        color={ASSISTANT_BAR}
        content={item.content}
        markdown
        footer={footer}
      />
    </Box>
  );
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
