import { Box, Text, useStdout } from "ink";
import { SpinnerInline } from "./Spinner.tsx";
import type { DiffLine } from "./DiffView.tsx";
import { panelWidth } from "./theme.ts";

// Diff row: line number + colored +/- marker and text (green add / red remove),
// on the terminal background — no full-width fill (light, consistent with the block).
function DiffLineRow({ d, w }: { d: DiffLine; w: number }) {
  const fg =
    d.type === "add" ? "green" : d.type === "remove" ? "red" : undefined;
  const num = String((d.type === "add" ? d.newNo : d.oldNo) ?? "").padStart(
    4,
    " ",
  );
  const mark = d.type === "add" ? "+ " : d.type === "remove" ? "- " : "  ";
  const text = d.text.slice(0, Math.max(0, w - 8));
  return (
    <Text>
      <Text dimColor>{num} </Text>
      <Text color={fg} dimColor={d.type === "same"}>
        {mark}
        {text}
      </Text>
    </Text>
  );
}

// View of a tool step (call → result). Aligned with ToolEntry in App.tsx.
export interface ToolView {
  toolName: string;
  input: unknown;
  output?: string;
  isError?: boolean;
  diff?: DiffLine[] | null;
}

// Icons by type (conventional icon convention, adapted).
const ICON: Record<string, string> = {
  bash: "$",
  read: "→",
  ls: "→",
  glob: "✱",
  grep: "✱",
  write: "←",
  edit: "←",
  webfetch: "%",
  websearch: "◈",
  todowrite: "⚙",
  question: "?",
  // Distinct from the block-tool left border "│" (bash/write/edit) — reads as delegate/branch.
  task: "▸",
};

// Descriptive text during execution (it. 21, conventional style ~ <verb>…).
const PENDING: Record<string, string> = {
  bash: "Running command…",
  read: "Reading file…",
  ls: "Listing…",
  glob: "Finding files…",
  grep: "Searching content…",
  write: "Writing file…",
  edit: "Editing file…",
  webfetch: "Fetching…",
  websearch: "Searching web…",
  todowrite: "Updating todos…",
  question: "Asking…",
  task: "Delegating…",
};
const pendingText = (name: string) => PENDING[name] ?? "Working…";

// Tools with complex output → block with left border. Others → inline row.
const BLOCK = new Set(["bash", "write", "edit"]);

function rec(input: unknown): Record<string, unknown> {
  return input && typeof input === "object"
    ? (input as Record<string, unknown>)
    : {};
}

// Synthetic description (path/command/pattern) instead of raw JSON.
function describe(toolName: string, input: unknown): string {
  const i = rec(input);
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  switch (toolName) {
    case "bash":
      return s(i.command);
    case "read":
    case "write":
    case "edit":
      return s(i.path) || s(i.filePath);
    case "ls":
      return s(i.path) || ".";
    case "glob":
    case "grep":
      return s(i.pattern);
    case "webfetch":
      return s(i.url);
    case "websearch":
      return s(i.query);
    case "todowrite":
      return "todos";
    case "question":
      return Array.isArray(i.questions)
        ? `${i.questions.length} question(s)`
        : "question";
    case "task":
      return s(i.description) || s(i.prompt).slice(0, 60);
    default: {
      const str = typeof input === "string" ? input : JSON.stringify(input);
      return str.length > 80 ? str.slice(0, 80) + "…" : str;
    }
  }
}

function oneLine(s: string, max = 120): string {
  const flat = s.replace(/\s*\n\s*/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}

export function ToolStep({ tool, collapsed }: { tool: ToolView; collapsed?: boolean }) {
  const icon = ICON[tool.toolName] ?? "·";
  const desc = describe(tool.toolName, tool.input);
  const pending = tool.output === undefined;
  return BLOCK.has(tool.toolName) ? (
    <BlockTool tool={tool} icon={icon} desc={desc} pending={pending} collapsed={collapsed} />
  ) : (
    <InlineTool tool={tool} icon={icon} desc={desc} pending={pending} collapsed={collapsed} />
  );
}

function InlineTool({
  tool,
  icon,
  desc,
  pending,
  collapsed,
}: {
  tool: ToolView;
  icon: string;
  desc: string;
  pending: boolean;
  collapsed?: boolean;
}) {
  const iconColor = tool.isError ? "red" : "white";
  // Collapsed (Ctrl+O): show only the synthetic row, hide the output preview.
  // Errors always stay visible (they matter even when collapsed).
  const showOutput = !pending && tool.output && (!collapsed || tool.isError);
  return (
    <Box flexDirection="column" paddingLeft={3}>
      <Box>
        {/* fixed-width icon (2 cols) → alignment across different tools */}
        <Box width={2}>
          <Text color={iconColor}>{icon}</Text>
        </Box>
        {pending ? (
          <>
            <Text dimColor>~ {pendingText(tool.toolName)} </Text>
            <SpinnerInline />
          </>
        ) : (
          <Text
            color={tool.isError ? "red" : undefined}
            dimColor={!tool.isError}
          >
            {tool.toolName} {desc}
          </Text>
        )}
      </Box>
      {showOutput && (
        <Box paddingLeft={2}>
          <Text dimColor color={tool.isError ? "red" : undefined}>
            {oneLine(tool.output!)}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function BlockTool({
  tool,
  icon,
  desc,
  pending,
  collapsed,
}: {
  tool: ToolView;
  icon: string;
  desc: string;
  pending: boolean;
  collapsed?: boolean;
}) {
  const { stdout } = useStdout();
  const w = panelWidth(stdout?.columns);
  const barColor = tool.isError ? "red" : "gray";
  const title =
    tool.toolName === "bash" ? oneLine(desc, 160) : `${tool.toolName} ${desc}`;
  const titleClip = title.slice(0, w - 6);

  // Collapsed (Ctrl+O): show the title row only, hide the diff/output body — unless
  // it's an error, which stays visible.
  const hideDetail = collapsed && !tool.isError;
  const diff = !hideDetail && tool.diff && tool.diff.length > 0 ? tool.diff : null;
  const outLines =
    !diff && !hideDetail && !pending && tool.output ? clip(tool.output).split("\n") : [];

  // Left-border block (like the assistant message), on the terminal background — no
  // heavy full-width fill. The gray/red bar delimits the tool block; content breathes.
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={barColor}
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      paddingLeft={1}
      marginBottom={1}
    >
      <Box>
        <Text color={tool.isError ? "red" : "white"} bold>
          {icon}{" "}
        </Text>
        <Text bold>{titleClip}</Text>
      </Box>

      {pending && (
        <Box>
          <Text dimColor>~ {pendingText(tool.toolName)} </Text>
          <SpinnerInline />
        </Box>
      )}

      {diff &&
        diff.slice(0, 15).map((d, i) => <DiffLineRow key={i} d={d} w={w} />)}
      {diff && diff.length > 15 && (
        <Text dimColor>… {diff.length - 15} more</Text>
      )}

      {outLines.map((ln, i) => (
        <Text key={i} dimColor color={tool.isError ? "red" : undefined}>
          {ln.slice(0, w - 2)}
        </Text>
      ))}
    </Box>
  );
}

function clip(s: string, max = 500): string {
  const lines = s.split("\n").slice(0, 12).join("\n");
  return lines.length > max ? lines.slice(0, max) + "\n… [truncated]" : lines;
}
