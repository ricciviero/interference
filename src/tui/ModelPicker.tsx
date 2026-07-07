import { useState, useEffect, type FC } from "react";
import { Box, Text, useInput } from "ink";
import { currentModel, currentProviderId, setModel, setProvider, savePreferences, PROVIDERS, type ProviderId } from "../config.ts";
import { loadOpenRouterModels } from "../openrouter.ts";
import { SelectRow } from "./SelectRow.tsx";
import { computeWindow, useMaxVisibleRows } from "./viewport.ts";

// Chrome inside the picker: border(2) + padding(2) + title+margin(2) + help+margin(2)
// + up-to-2 scroll indicators = 10. Plus root Box padding(2) in App.tsx = 12 total.
const PICKER_OVERHEAD = 12;

type ModelEntry = { id: string; label: string };
type Row =
  | { type: "header"; label: string }
  | { type: "model"; id: string; label: string; providerId: ProviderId };

export const ModelPicker: FC<{ onCancel: () => void }> = ({ onCancel }) => {
  const current = currentModel();
  const currentPid = currentProviderId();

  // OpenRouter's full catalog (hundreds of models) is loaded dynamically from its /models
  // endpoint — not hardcodable. `null` = still loading; `[]` = loaded-but-empty (offline)
  // → in both cases the curated PROVIDERS entries stay as fallback.
  const [orModels, setOrModels] = useState<ModelEntry[] | null>(null);
  // Always-on filter: typing narrows the list in real time (essential for ~343 models).
  const [filter, setFilter] = useState("");
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let alive = true;
    loadOpenRouterModels().then((models) => {
      if (alive) setOrModels(models.map((m) => ({ id: m.id, label: m.id })));
    });
    return () => {
      alive = false;
    };
  }, []);

  // Current provider on top: the user sees where they are immediately.
  const providerIds = Object.keys(PROVIDERS) as ProviderId[];
  const orderedPids = [currentPid, ...providerIds.filter((p) => p !== currentPid)];

  const f = filter.trim().toLowerCase();
  const rows: Row[] = [];
  const modelRowIndices: number[] = [];
  for (const pid of orderedPids) {
    const def = PROVIDERS[pid];
    // OpenRouter: prefer the live catalog once loaded; otherwise the curated fallback.
    const models: ModelEntry[] =
      pid === "openrouter" && orModels && orModels.length > 0 ? orModels : def.models;
    const matched = f
      ? models.filter((m) => m.id.toLowerCase().includes(f) || m.label.toLowerCase().includes(f))
      : models;
    if (matched.length === 0) continue;
    rows.push({ type: "header", label: def.label });
    for (const m of matched) {
      modelRowIndices.push(rows.length);
      rows.push({ type: "model", id: m.id, label: m.label, providerId: pid });
    }
  }

  // Clamp the selection: the filtered list can shrink below the current index.
  const selIdx = modelRowIndices.length === 0 ? 0 : Math.min(idx, modelRowIndices.length - 1);
  const selectedRow = modelRowIndices[selIdx];

  useInput(
    (input, key) => {
      if (key.escape) {
        onCancel();
        return;
      }
      const n = modelRowIndices.length;
      if (key.upArrow) {
        if (n > 0) setIdx((i) => (Math.min(i, n - 1) > 0 ? Math.min(i, n - 1) - 1 : n - 1));
        return;
      }
      if (key.downArrow) {
        if (n > 0) setIdx((i) => (Math.min(i, n - 1) < n - 1 ? Math.min(i, n - 1) + 1 : 0));
        return;
      }
      if (key.return) {
        const ri = modelRowIndices[selIdx];
        const row = ri !== undefined ? rows[ri] : undefined;
        if (row?.type === "model") {
          setProvider(row.providerId);
          setModel(row.id);
          savePreferences();
          onCancel();
        }
        return;
      }
      if (key.backspace || key.delete) {
        setFilter((s) => s.slice(0, -1));
        setIdx(0);
        return;
      }
      // Any printable input extends the filter (letters, digits, `/`, `-`, `.`, paste).
      if (!key.ctrl && !key.meta && input && input.charCodeAt(0) >= 0x20) {
        setFilter((s) => s + input);
        setIdx(0);
      }
    },
    { isActive: true },
  );

  const loadingOr = orModels === null;

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
      <Box marginBottom={1} gap={1}>
        <Text bold>Select model</Text>
        {filter ? (
          <Text>
            <Text dimColor>Filter: </Text>
            <Text>{filter}</Text>
            <Text dimColor>▊</Text>
          </Text>
        ) : (
          <Text dimColor>(type to filter)</Text>
        )}
        {loadingOr && <Text dimColor>· loading OpenRouter…</Text>}
      </Box>
      {above > 0 && (
        <Box>
          <Text dimColor>↑ {above} more above</Text>
        </Box>
      )}
      {rows.length === 0 ? (
        <Text dimColor>No models match "{filter}".</Text>
      ) : (
        rows.slice(start, end).map((row, i) => {
          const ri = start + i;
          return row.type === "header" ? (
            <Box key={`h-${row.label}`} marginTop={ri === 0 ? 0 : 1}>
              <Text dimColor bold>
                {row.label}
              </Text>
            </Box>
          ) : (
            <SelectRow key={`${row.providerId}:${row.id}`} label={row.label} selected={ri === selectedRow} current={row.id === current && row.providerId === currentPid} />
          );
        })
      )}
      {below > 0 && (
        <Box>
          <Text dimColor>↓ {below} more below</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · type to filter · Enter select · Esc cancel</Text>
      </Box>
    </Box>
  );
};
