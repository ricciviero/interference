import { useState, useRef, useEffect, useCallback } from "react";
import { Box, Text, Static, useInput, useApp } from "ink";
import { TextInput, Spinner } from "@inkjs/ui";
import type { ModelMessage } from "ai";
import { runTurn } from "../agent/loop.ts";
import type { Chunk } from "../agent/loop.ts";
import { MissingApiKeyError } from "../provider.ts";
import { setConfirmHandler } from "../permissions.ts";
import type { ConfirmHandler } from "../permissions.ts";
import { currentMode, setMode } from "../config.ts";
import { saveSession, loadSession } from "../session/store.ts";
import type { Session } from "../session/store.ts";
import { nextTurn, undo, redo, finalizeSnapshots } from "../session/snapshot.ts";
import { dispatch, isSlashCommand } from "../commands/index.ts";
import { matchSkills, getCachedRegistry, loadSkillBody } from "../skills.ts";
import { shouldCompact, compactMessages, getUsagePercent } from "../agent/compaction.ts";
import { computeDiff, type DiffLine } from "./DiffView.tsx";
import { StatusFooter } from "./StatusFooter.tsx";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { SlashAutocomplete } from "./SlashAutocomplete.tsx";
import { SessionList } from "./SessionList.tsx";
import { useToast, ToastContainer } from "./Toast.tsx";
import { Welcome } from "./Welcome.tsx";
import { listCommands } from "../commands/index.ts";

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
  const [inputKey, setInputKey] = useState(0);
  const [confirmPreview, setConfirmPreview] = useState<string | null>(null);
  const [confirmTool, setConfirmTool] = useState<string>("");
  const [statusText, setStatusText] = useState<string>("");
  const [showSessions, setShowSessions] = useState(false);
  const [draft, setDraft] = useState("");
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

  const nextId = (): number => Date.now() + Math.random();

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
        setStatusText(`Compacting context (${pct}%)`);
        const compacted = await compactMessages(messagesRef.current);
        messagesRef.current.length = 0;
        messagesRef.current.push(...compacted);
        sessionRef.current.messages = messagesRef.current;
        await saveSession(sessionRef.current);
        setStatusText(`Compacted (${getUsagePercent(messagesRef.current)}%)`);
        addToast(`Compacted to ${getUsagePercent(messagesRef.current)}%`, "info");
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
    }
  }

  const onSubmit = useCallback(
    (value: string) => {
      const v = value.trim();
      if (!v || busy) return;
      setInputKey((k) => k + 1);
      if (v === "/exit" || v === "/quit") return exit();
      if (v === "/sessions") { setShowSessions(true); return; }

      if (isSlashCommand(v)) {
        dispatch(v, {
          setMode: (m) => { setMode(m); sessionRef.current.meta.mode = m; },
          clearMessages: () => {
            messagesRef.current = [];
            setHistory([]);
            setStatusText("Conversation cleared.");
          },
          doInit: async (args) => {
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
            try {
              const chunks = runTurn(messagesRef.current, aborter.signal);
              for await (const chunk of chunks) {
                // consume silently — the history will show the result
              }
              sessionRef.current.meta.turnCount++;
              await finalizeSnapshots();
              await saveSession(sessionRef.current);
              return "AGENTS.md generated successfully.";
            } catch (err) {
              messagesRef.current.pop();
              return `Init failed: ${err instanceof Error ? err.message : String(err)}`;
            }
          },
          doSkill: async (name, body) => {
            nextTurn();
            messagesRef.current.push({ role: "user" as const, content: v });
            const aborter = new AbortController();
            try {
              const chunks = runTurn(messagesRef.current, aborter.signal, undefined, [body]);
              for await (const chunk of chunks) {}
              sessionRef.current.meta.turnCount++;
              await finalizeSnapshots();
              await saveSession(sessionRef.current);
              return `Skill '${name}' executed.`;
            } catch (err) {
              messagesRef.current.pop();
              return `Skill failed: ${err instanceof Error ? err.message : String(err)}`;
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
    [busy, exit],
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

      {!showSessions && history.length === 0 && !busy && !confirmPreview && (
        <Welcome
          provider={sessionRef.current.meta.provider}
          model={sessionRef.current.meta.model}
          sessionCount={0}
          onSubmit={(v) => {
            doTurn(v, undefined);
          }}
        />
      )}

      {!showSessions && (history.length > 0 || busy || confirmPreview) && (
        <>
          <ToastContainer toasts={toasts} />

          <Static items={history}>
            {(m) => (
              <Box key={m.id} flexDirection="column" marginBottom={1}>
                <Box>
                  <Text color={m.role === "user" ? "cyan" : "green"} bold>
                    {m.role === "user" ? "› " : "· "}
                  </Text>
                  <Text>{m.content}</Text>
                </Box>
                {m.reasoning && (
                  <Text dimColor>┄ {m.reasoning.slice(0, 120)}</Text>
                )}
              </Box>
            )}
          </Static>

          {reasoning && (
            <Text dimColor>┄ {reasoning}</Text>
          )}

          {streaming && (
            <Box marginBottom={1}>
              <Text color="green" bold>· </Text>
              <Text>{streaming}</Text>
            </Box>
          )}

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
            <SlashAutocomplete
              filter={draft.slice(1)}
              commands={listCommands()}
              onSelect={(name) => {
                setDraft("/" + name + " ");
                setInputKey((k) => k + 1);
              }}
              onCancel={() => {
                setDraft("");
                setInputKey((k) => k + 1);
              }}
            />
          )}

          <Box>
            {!confirmPreview && !showSessions && (
              <TextInput
                key={inputKey}
                placeholder={busy ? "waiting…" : "Type a message (/help for commands)"}
                onChange={setDraft}
                onSubmit={onSubmit}
              />
            )}
          </Box>

          <StatusFooter
            mode={sessionRef.current.meta.mode}
            model={sessionRef.current.meta.model}
            provider={sessionRef.current.meta.provider}
            contextPct={messagesRef.current.length > 0 ? getUsagePercent(messagesRef.current) : 0}
            busy={busy}
            statusLine={statusText}
            turnCount={sessionRef.current.meta.turnCount}
          />
        </>
      )}
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
