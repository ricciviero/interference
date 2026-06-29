import { useState, useRef, useEffect, useCallback } from "react";
import { Box, Text, Static, useInput, useApp } from "ink";
import { Spinner } from "@inkjs/ui";
import TextInput from "ink-text-input";
import type { ModelMessage } from "ai";
import { runTurn } from "../agent/loop.ts";
import type { Chunk } from "../agent/loop.ts";
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
import { formatCost, getTotalCost } from "../cost.ts";
import { StatusFooter } from "./StatusFooter.tsx";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { SlashAutocomplete } from "./SlashAutocomplete.tsx";
import { SessionList } from "./SessionList.tsx";
import { useToast, ToastContainer } from "./Toast.tsx";
import { Welcome } from "./Welcome.tsx";
import { matchCommands } from "../commands/index.ts";

type HistoryItem = {
  id: number;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
};

type ToolEntry = {
  id: number;
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
  const { toasts, addToast } = useToast();
  const confirmResolveRef = useRef<((v: boolean) => void) | null>(null);
  const messagesRef = useRef<ModelMessage[]>(session.messages);
  const aborterRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(session);

  useEffect(() => { sessionRef.current = session; }, [session]);

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

  useInput((input, key) => {
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

  // Navigazione autocomplete: frecce ↑↓ muovono la selezione quando il draft è "/…".
  // L'Invio (TextInput.onSubmit) esegue il comando evidenziato → niente conflitto.
  const acLastKey = useRef(0);
  const cmdHistory = useRef<string[]>([]);
  const cmdHistoryIdx = useRef(-1);

  useInput((_input, key) => {
    if (confirmPreview || showThinking || showSessions || showModel || showProvider) return;

    // Command history: freccia su/giù senza slash attivo
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

    // Autocomplete: frecce quando draft è "/…"
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
    messagesRef.current.push({ role: "user", content: userText });
    aborterRef.current = new AbortController();
    let acc = "";
    let reasoningAcc = "";
    let currentToolId = 0;

    try {
      const chunks = runTurn(messagesRef.current, aborterRef.current.signal, undefined, skillBodies);

      for await (const chunk of chunks) {
        switch (chunk.type) {
          case "reasoning":
            reasoningAcc += chunk.text;
            setReasoning(reasoningAcc);
            break;

          case "text":
            acc += chunk.text;
            setStreaming(acc);
            break;

          case "tool-call":
            currentToolId = nextId();
            setToolSteps((ts) => [
              ...ts,
              {
                id: currentToolId,
                toolName: chunk.toolName,
                input: chunk.input,
              },
            ]);
            break;

          case "tool-result":
            setToolSteps((ts) =>
              ts.map((t) => {
                if (t.id !== currentToolId) return t;
                const diff = computeToolDiff(t.toolName, t.input as Record<string, unknown>, chunk.isError ? null : chunk.output);
                return {
                  ...t,
                  output: chunk.output,
                  isError: chunk.isError,
                  diff,
                };
              }),
            );
            break;
        }
      }

      if (acc || reasoningAcc) {
        setHistory((h) => [
          ...h,
          {
            id: nextId(),
            role: "assistant",
            content: acc,
            reasoning: reasoningAcc || undefined,
          },
        ]);
      }

      sessionRef.current.meta.turnCount++;
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
      // Se è uno slash parziale senza argomenti, esegui il comando EVIDENZIATO
      // nell'autocomplete (frecce) invece di richiedere il nome completo.
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
            sessionRef.current.meta.id = name;
            await saveSession(sessionRef.current);
            return `Session renamed to '${name}'.`;
          },
          doCompact: async () => {
            doCompact();
            return "";
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
              // Rebuild history from messages
              const items: HistoryItem[] = [];
              let nid = Date.now();
              for (const m of loaded.messages) {
                if (m.role === "user" || m.role === "assistant") {
                  const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
                  items.push({ id: nid++, role: m.role as "user" | "assistant", content });
                }
              }
              setHistory(items);
              setStreaming("");
              setReasoning("");
              setToolSteps([]);
              addToast(`Resumed session ${id.slice(0, 12)} (${loaded.meta.turnCount} turns)`, "success");
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
            />
          )}

          <Static items={history}>
            {(m) => <MsgBlock key={m.id} item={m} />}
          </Static>

          {reasoning && <ReasoningBlock text={reasoning} live />}

          {streaming && <RoleBlock role="interference" color="green" content={streaming} />}

          {toolSteps.map((t) => (
            <ToolStepRow key={t.id} tool={t} />
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

          {draft.startsWith("/") && (
            <SlashAutocomplete filter={draft.slice(1)} selected={acIdx} />
          )}

          {!confirmPreview && !showSessions && (
            <Box borderStyle="round" borderColor="gray" paddingX={1}>
              <Text color="cyan" bold>{"› "}</Text>
              <TextInput
                value={draft}
                onChange={(val: string) => {
                  if (val !== draft) setAcIdx(0);
                  setDraft(val);
                }}
                placeholder={busy ? `working… (${messageQueue.length} queued)` : "Type a message (/ for commands)"}
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
            statusLine={statusText}
            turnCount={sessionRef.current.meta.turnCount}
            cost={formatCost(getTotalCost())}
          />
        </>
      )}
    </Box>
  );
}

// Blocco con barra laterale (stile opencode): bordo solo a sinistra.
function RoleBlock({
  role,
  color,
  content,
}: {
  role: string;
  color: string;
  content: string;
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
      <Text color={color} bold>
        {role}
      </Text>
      <Text>{content}</Text>
    </Box>
  );
}

function ReasoningBlock({ text, live }: { text: string; live?: boolean }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!live) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [live]);

  const shown = live
    ? text.length > 500 ? "…" + text.slice(-500) : text
    : text.length > 600 ? text.slice(0, 600) + " …" : text;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      paddingLeft={1}
      marginBottom={1}
    >
      <Text dimColor bold>
        ┄ thinking{live && elapsed > 0 ? ` ${elapsed}s` : ""}
      </Text>
      <Text dimColor>{shown}</Text>
    </Box>
  );
}

function MsgBlock({ item }: { item: HistoryItem }) {
  const isUser = item.role === "user";
  return (
    <Box flexDirection="column">
      {item.reasoning && <ReasoningBlock text={item.reasoning} />}
      <RoleBlock
        role={isUser ? "you" : "interference"}
        color={isUser ? "cyan" : "green"}
        content={item.content}
      />
    </Box>
  );
}

function ToolStepRow({ tool }: { tool: ToolEntry }) {
  const args =
    typeof tool.input === "string" ? tool.input : JSON.stringify(tool.input);

  return (
    <Box flexDirection="column" marginBottom={0}>
      <Box>
        <Text dimColor>· {tool.toolName}</Text>
        <Text>({args})</Text>
        {!tool.output && <Spinner label="" />}
      </Box>
      {tool.diff && tool.diff.length > 0 && (
        <Box flexDirection="column" marginBottom={0}>
          {tool.diff.slice(0, 15).map((d, i) => (
            <Text
              key={i}
              color={d.type === "add" ? "green" : d.type === "remove" ? "red" : undefined}
              dimColor={d.type !== "add" && d.type !== "remove"}
            >
              {d.type === "add" ? "+ " : d.type === "remove" ? "- " : "  "}
              {d.text.slice(0, 100)}
            </Text>
          ))}
          {tool.diff.length > 15 && (
            <Text dimColor>… {tool.diff.length - 15} more lines</Text>
          )}
        </Box>
      )}
      {tool.output && !tool.diff && (
        <Text dimColor color={tool.isError ? "red" : undefined}>
          {"  → "}
          {tool.output.length > 150
            ? tool.output.slice(0, 150).replace(/\n/g, " ") + "…"
            : tool.output.replace(/\n/g, " ")}
        </Text>
      )}
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
