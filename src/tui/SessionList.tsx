import { useState, useEffect, useCallback, type FC } from "react";
import { Box, Text, useInput } from "ink";
import { listSessions, loadSession, type SessionMeta } from "../session/store.ts";
import { SelectRow } from "./SelectRow.tsx";

interface Props {
  onSelect: (sessionId: string) => void;
  onCancel: () => void;
}

const PAGE_SIZE = 15;

export const SessionList: FC<Props> = ({ onSelect, onCancel }) => {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSessions().then((list) => {
      setSessions(list);
      setLoading(false);
    });
  }, []);

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setIdx((i) => (i > 0 ? i - 1 : Math.max(0, sessions.length - 1)));
    } else if (key.downArrow || input === "j") {
      setIdx((i) => (i < sessions.length - 1 ? i + 1 : 0));
    } else if (key.return) {
      const s = sessions[idx];
      if (s) onSelect(s.id);
    } else if (key.escape || input === "q") {
      onCancel();
    }
  }, { isActive: true });

  if (loading) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="blue" padding={1}>
        <Text>Loading sessions...</Text>
      </Box>
    );
  }

  if (sessions.length === 0) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="blue" padding={1}>
        <Text>No sessions found.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Sessions ({sessions.length})</Text>
      </Box>
      {sessions.slice(0, PAGE_SIZE).map((s, i) => (
        <SelectRow
          key={s.id}
          label={s.id.slice(0, 12)}
          meta={`${s.mode} · ${s.turnCount}t · ${s.updatedAt.slice(0, 10)}`}
          selected={i === idx}
        />
      ))}
      <Box marginTop={1}>
        <Text dimColor>↑↓ j/k navigate · Enter select · Esc/q cancel</Text>
      </Box>
    </Box>
  );
};
