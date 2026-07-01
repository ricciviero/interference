import { useState, type FC } from "react";
import { Box, Text, useInput } from "ink";
import { currentModel, currentProviderId, setModel, setProvider, PROVIDERS, type ProviderId } from "../config.ts";
import { SelectRow } from "./SelectRow.tsx";
import { computeWindow, useMaxVisibleRows } from "./viewport.ts";

// Chrome around the list: border(2) + padding(2) + title+margin(2) + help+margin(2)
// + up-to-2 scroll indicators + root Box padding(2) in App.tsx.
const PICKER_OVERHEAD = 12;

type Row =
  | { type: "header"; label: string }
  | { type: "model"; id: string; label: string; providerId: ProviderId };

export const ModelPicker: FC<{ onCancel: () => void }> = ({ onCancel }) => {
  const current = currentModel();
  const currentPid = currentProviderId();

  // Current provider on top (it. 38): the user sees where they are immediately.
  // Provider with no models in the picker (edge case) won't produce an empty header.
  const providerIds = Object.keys(PROVIDERS) as ProviderId[];
  const orderedPids = [currentPid, ...providerIds.filter((p) => p !== currentPid)];

  const rows: Row[] = [];
  const modelRowIndices: number[] = [];
  for (const pid of orderedPids) {
    const def = PROVIDERS[pid];
    if (def.models.length === 0) continue;
    rows.push({ type: "header", label: def.label });
    for (const m of def.models) {
      modelRowIndices.push(rows.length);
      rows.push({ type: "model", id: m.id, label: m.label, providerId: pid });
    }
  }

  const initialIdx = Math.max(
    0,
    modelRowIndices.findIndex((ri) => {
      const row = rows[ri];
      return row?.type === "model" && row.id === current;
    }),
  );
  // Navigation index scrolls ONLY on "model" rows (modelRowIndices) — headers
  // are never selectable, arrow keys skip them automatically.
  const [idx, setIdx] = useState(initialIdx);
  const selectedRow = modelRowIndices[idx];

  useInput(
    (input, key) => {
      if (modelRowIndices.length === 0) {
        if (key.escape || input === "q") onCancel();
        return;
      }
      if (key.upArrow || input === "k") {
        setIdx((i) => (i > 0 ? i - 1 : modelRowIndices.length - 1));
      } else if (key.downArrow || input === "j") {
        setIdx((i) => (i < modelRowIndices.length - 1 ? i + 1 : 0));
      } else if (key.return) {
        const ri = modelRowIndices[idx];
        const row = ri !== undefined ? rows[ri] : undefined;
        if (row?.type === "model") {
          setProvider(row.providerId);
          setModel(row.id);
          onCancel();
        }
      } else if (key.escape || input === "q") {
        onCancel();
      }
    },
    { isActive: true },
  );

  if (modelRowIndices.length === 0) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="blue" padding={1}>
        <Text>No models available.</Text>
        <Box marginTop={1}>
          <Text dimColor>Esc/q cancel</Text>
        </Box>
      </Box>
    );
  }

  const maxVisible = useMaxVisibleRows(PICKER_OVERHEAD);
  let { start, end } = computeWindow(rows.length, selectedRow ?? 0, maxVisible);
  // Don't strand a model row without its group header above it.
  if (start > 0 && rows[start]?.type === "model") {
    let h = start - 1;
    while (h > 0 && rows[h]?.type !== "header") h--;
    start = h;
  }
  const above = start;
  const below = rows.length - end;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Select model</Text>
      </Box>
      {above > 0 && (
        <Box>
          <Text dimColor>↑ {above} more above</Text>
        </Box>
      )}
      {rows.slice(start, end).map((row, i) => {
        const ri = start + i;
        return row.type === "header" ? (
          <Box key={`h-${row.label}`} marginTop={ri === 0 ? 0 : 1}>
            <Text dimColor bold>
              {row.label}
            </Text>
          </Box>
        ) : (
          <SelectRow key={row.id} label={row.label} selected={ri === selectedRow} current={row.id === current} />
        );
      })}
      {below > 0 && (
        <Box>
          <Text dimColor>↓ {below} more below</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>↑↓ j/k navigate · Enter select · Esc cancel</Text>
      </Box>
    </Box>
  );
};
