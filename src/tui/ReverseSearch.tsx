import { useState, type FC } from "react";
import { Box, Text, useInput } from "ink";

interface Props {
  /** Prompt history, most-recent-first (as stored in cmdHistory). */
  history: string[];
  onAccept: (value: string) => void;
  onCancel: () => void;
}

// Reverse search over the prompt history (fix/08 A6), in the style of shell Ctrl+R.
// Type to filter, Ctrl+R cycles to older matches, Enter accepts, Esc cancels.
export const ReverseSearch: FC<Props> = ({ history, onAccept, onCancel }) => {
  const [query, setQuery] = useState("");
  const [idx, setIdx] = useState(0);

  const matches = query
    ? history.filter((h) => h.toLowerCase().includes(query.toLowerCase()))
    : history;
  const current = matches[Math.min(idx, Math.max(0, matches.length - 1))] ?? "";

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      if (current) onAccept(current);
      else onCancel();
      return;
    }
    // Ctrl+R again → next (older) match.
    if (key.ctrl && input === "r") {
      setIdx((i) => (matches.length > 0 ? (i + 1) % matches.length : 0));
      return;
    }
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      setIdx(0);
      return;
    }
    // Printable character → extend the query (ignore control combos).
    if (input && !key.ctrl && !key.meta && !key.tab) {
      setQuery((q) => q + input);
      setIdx(0);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1}>
      <Box>
        <Text dimColor>(reverse-i-search)`</Text>
        <Text>{query}</Text>
        <Text dimColor>`: </Text>
        {current ? (
          <Text>{current}</Text>
        ) : (
          <Text dimColor>{query ? "(no match)" : "(type to search history)"}</Text>
        )}
      </Box>
      <Text dimColor>
        {matches.length > 0 ? `${Math.min(idx + 1, matches.length)}/${matches.length} · ` : ""}
        Ctrl+R next · Enter accept · Esc cancel
      </Text>
    </Box>
  );
};
