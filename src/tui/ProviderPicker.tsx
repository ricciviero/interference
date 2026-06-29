import { useState, useEffect, type FC } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { PROVIDERS, type ProviderId } from "../config.ts";
import { loadAuth, setProviderKey, removeProviderKey, applyAuthToEnv } from "../auth.ts";

export const ProviderPicker: FC<{ onClose: () => void }> = ({ onClose }) => {
  const providers = Object.entries(PROVIDERS) as [ProviderId, typeof PROVIDERS[ProviderId]][];
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"list" | "add" | "remove">("list");
  const [keyInput, setKeyInput] = useState("");
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState("");

  useEffect(() => {
    loadAuth().then((auth) => {
      const c = new Set(Object.keys(auth).filter((k) => !!auth[k]));
      setConnected(c);
    });
  }, []);

  async function handleSelect() {
    const [pid, def] = providers[idx]!;
    if (connected.has(pid)) {
      setPhase("remove");
      setStatus(`Remove key for ${def.label}? (y/n)`);
    } else {
      setPhase("add");
      setKeyInput("");
      setStatus(`Enter API key for ${def.label}:`);
    }
  }

  async function submitKey() {
    const [pid] = providers[idx]!;
    const key = keyInput.trim();
    if (!key) { setPhase("list"); return; }
    await setProviderKey(pid, key);
    applyAuthToEnv(await loadAuth(), Object.fromEntries(
      Object.entries(PROVIDERS).map(([pid, def]) => [pid, { label: def.label, envKey: def.envKey }])
    ));
    setConnected((c) => new Set([...c, pid]));
    setPhase("list");
    setStatus(`Connected to ${PROVIDERS[pid].label}.`);
    setTimeout(() => setStatus(""), 2000);
  }

  async function confirmRemove() {
    const [pid] = providers[idx]!;
    await removeProviderKey(pid);
    delete process.env[PROVIDERS[pid].envKey];
    setConnected((c) => { const n = new Set(c); n.delete(pid); return n; });
    setPhase("list");
    setStatus(`Disconnected from ${PROVIDERS[pid].label}.`);
    setTimeout(() => setStatus(""), 2000);
  }

  useInput(
    (input, key) => {
      if (phase === "remove") {
        if (input === "y" || key.return) confirmRemove();
        else { setPhase("list"); setStatus(""); }
        return;
      }
      if (phase === "add") return;
      if (key.upArrow || input === "k") setIdx((i) => (i > 0 ? i - 1 : providers.length - 1));
      else if (key.downArrow || input === "j") setIdx((i) => (i < providers.length - 1 ? i + 1 : 0));
      else if (key.return) handleSelect();
      else if (key.escape || input === "q") onClose();
    },
    { isActive: true },
  );

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" padding={1}>
      <Box marginBottom={1}><Text bold>Providers</Text></Box>

      {phase === "list" && (
        <>
          {providers.map(([pid, def], i) => (
            <Box key={pid}>
              <Text color={i === idx ? "cyan" : undefined} bold={i === idx}>
                {i === idx ? "▸ " : "  "}{def.label}
              </Text>
              <Text dimColor> ({def.models[0]?.id ?? def.defaultModel})</Text>
              {connected.has(pid)
                ? <Text color="green"> ● connected</Text>
                : <Text dimColor> ○ not connected</Text>}
            </Box>
          ))}
          <Box marginTop={1}>
            <Text dimColor>↑↓ navigate · Enter {connected.has(providers[idx]![0]) ? "disconnect" : "add key"} · Esc close</Text>
          </Box>
          {status && <Box marginTop={1}><Text>{status}</Text></Box>}
        </>
      )}

      {phase === "add" && (
        <Box flexDirection="column">
          <Text>{status}</Text>
          <Box><Text dimColor>Key: </Text><TextInput value={keyInput} onChange={setKeyInput} onSubmit={submitKey} /></Box>
          <Text dimColor>Enter to confirm · Esc to cancel</Text>
        </Box>
      )}

      {phase === "remove" && (
        <Text>{status}</Text>
      )}
    </Box>
  );
};
