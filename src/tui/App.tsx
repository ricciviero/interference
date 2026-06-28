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
import { saveSession } from "../session/store.ts";
import type { Session } from "../session/store.ts";
import { nextTurn, undo, redo, finalizeSnapshots } from "../session/snapshot.ts";

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
    if (confirmResolveRef.current) {
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
    }
  });

  const nextId = (): number => Date.now() + Math.random();

  async function doTurn(userText: string) {
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
      const chunks = runTurn(messagesRef.current, aborterRef.current.signal);

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
              ts.map((t) =>
                t.id === currentToolId
                  ? {
                      ...t,
                      output: chunk.output,
                      isError: chunk.isError,
                    }
                  : t,
              ),
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
      if (v === "/plan") { setMode("plan"); sessionRef.current.meta.mode = "plan"; return; }
      if (v === "/build") { setMode("build"); sessionRef.current.meta.mode = "build"; return; }
      if (v === "/undo") {
        undo().then((files) => {
          if (files.length > 0) {
            setHistory((h) => [...h, { id: nextId(), role: "assistant", content: `Undo: restored ${files.join(", ")}` }]);
          } else {
            setStatusText("Nothing to undo");
          }
        });
        return;
      }
      if (v === "/redo") {
        redo().then((files) => {
          if (files.length > 0) {
            setHistory((h) => [...h, { id: nextId(), role: "assistant", content: `Redo: restored ${files.join(", ")}` }]);
          } else {
            setStatusText("Nothing to redo");
          }
        });
        return;
      }
      doTurn(v);
    },
    [busy, exit],
  );

  return (
    <Box flexDirection="column" padding={1}>
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

      {statusText && (
        <Text dimColor>{statusText}</Text>
      )}

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
        <Box marginBottom={1} flexDirection="column">
          <Text color="yellow">{confirmPreview}</Text>
          <Text color="yellow" bold>
            Allow {confirmTool}? [y/N]
          </Text>
        </Box>
      )}

      <Box>
        {!confirmPreview && (
          <TextInput
            key={inputKey}
            placeholder={busy ? "waiting…" : "Type a message (/exit to quit)"}
            onSubmit={onSubmit}
          />
        )}
      </Box>
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
      {tool.output && (
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
