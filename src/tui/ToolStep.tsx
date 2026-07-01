import type { ReactNode } from "react";
import { Box, Text, useStdout } from "ink";
import { SpinnerInline } from "./Spinner.tsx";
import type { DiffLine } from "./DiffView.tsx";
import { BG_PANEL, DIFF_ADD_BG, DIFF_REM_BG, panelWidth } from "./theme.ts";

const fill = (w: number, used: number) => " ".repeat(Math.max(0, w - used));

// Diff row: line number + marker + text, on muted green/red background (it. 20).
function DiffLineRow({ d, w }: { d: DiffLine; w: number }) {
  const bg =
    d.type === "add"
      ? DIFF_ADD_BG
      : d.type === "remove"
        ? DIFF_REM_BG
        : BG_PANEL;
  const fg =
    d.type === "add" ? "green" : d.type === "remove" ? "red" : undefined;
  const num = String((d.type === "add" ? d.newNo : d.oldNo) ?? "").padStart(
    4,
    " ",
  );
  const mark = d.type === "add" ? "+ " : d.type === "remove" ? "- " : "  ";
  const text = d.text.slice(0, Math.max(0, w - 9));
  const used = 2 + 4 + 1 + 2 + text.length; // bar + number + space + marker + text
  return (
    <Text backgroundColor={bg}>
      <Text color="gray" bold backgroundColor={bg}>
        {"▌ "}
      </Text>
      <Text dimColor backgroundColor={bg}>
        {num}{" "}
      </Text>
      <Text color={fg} dimColor={d.type === "same"} backgroundColor={bg}>
        {mark}
        {text}
      </Text>
      <Text backgroundColor={bg}>{fill(w, used)}</Text>
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
  task: "│",
};

// Descriptive text during execution (it. 21, conventional style ~ <verb>…).
const PENDING: Record<string, string> = {
  bash: "Running command…",
  read: "Reading file…",
  ls: "Listing…",
  glob: "Finding files…",
  grep: "Searching content…",
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

export function ToolStep({ tool }: { tool: ToolView }) {
  const icon = ICON[tool.toolName] ?? "·";
  const desc = describe(tool.toolName, tool.input);
  const pending = tool.output === undefined;
  return BLOCK.has(tool.toolName) ? (
    <BlockTool tool={tool} icon={icon} desc={desc} pending={pending} />
  ) : (
    <InlineTool tool={tool} icon={icon} desc={desc} pending={pending} />
  );
}

function InlineTool({
  tool,
  icon,
  desc,
  pending,
}: {
  tool: ToolView;
  icon: string;
  desc: string;
  pending: boolean;
}) {
  const iconColor = tool.isError ? "red" : "white";
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
      {!pending && tool.output && (
        <Box paddingLeft={2}>
          <Text dimColor color={tool.isError ? "red" : undefined}>
            {oneLine(tool.output)}
          </Text>
        </Box>
      )}
    </Box>
  );
}

// Panel row: bar "▌ " (2 cols) + content + background fill to width.
function PanelLine({
  w,
  barColor,
  used,
  children,
}: {
  w: number;
  barColor: string;
  used: number;
  children: ReactNode;
}) {
  return (
    <Text backgroundColor={BG_PANEL}>
      <Text color={barColor} bold>
        {"▌ "}
      </Text>
      {children}
      <Text backgroundColor={BG_PANEL}>{fill(w - 2, used)}</Text>
    </Text>
  );
}

function BlockTool({
  tool,
  icon,
  desc,
  pending,
}: {
  tool: ToolView;
  icon: string;
  desc: string;
  pending: boolean;
}) {
  const { stdout } = useStdout();
  const w = panelWidth(stdout?.columns);
  const barColor = tool.isError ? "red" : "gray";
  const title =
    tool.toolName === "bash" ? oneLine(desc, 160) : `${tool.toolName} ${desc}`;
  const titleClip = title.slice(0, w - 6);

  const diff = tool.diff && tool.diff.length > 0 ? tool.diff : null;
  const outLines =
    !diff && !pending && tool.output ? clip(tool.output).split("\n") : [];

  return (
    <Box flexDirection="column" marginTop={10} marginBottom={1}>
      <PanelLine w={w} barColor={barColor} used={2 + titleClip.length}>
        <Text
          color={tool.isError ? "red" : "white"}
          bold
          backgroundColor={BG_PANEL}
        >
          {icon}{" "}
        </Text>
        <Text bold backgroundColor={BG_PANEL}>
          {titleClip}
        </Text>
      </PanelLine>

      {pending && (
        <PanelLine
          w={w}
          barColor={barColor}
          used={2 + pendingText(tool.toolName).length}
        >
          <Text dimColor backgroundColor={BG_PANEL}>
            ~ {pendingText(tool.toolName)}
          </Text>
        </PanelLine>
      )}

      {diff &&
        diff.slice(0, 15).map((d, i) => <DiffLineRow key={i} d={d} w={w} />)}
      {diff && diff.length > 15 && (
        <PanelLine w={w} barColor={barColor} used={2 + 14}>
          <Text dimColor backgroundColor={BG_PANEL}>
            … {diff.length - 15} more
          </Text>
        </PanelLine>
      )}

      {outLines.map((ln, i) => {
        const t = ln.slice(0, w - 2);
        return (
          <PanelLine key={i} w={w} barColor={barColor} used={t.length}>
            <Text
              dimColor
              color={tool.isError ? "red" : undefined}
              backgroundColor={BG_PANEL}
            >
              {t}
            </Text>
          </PanelLine>
        );
      })}
    </Box>
  );
}

function clip(s: string, max = 500): string {
  const lines = s.split("\n").slice(0, 12).join("\n");
  return lines.length > max ? lines.slice(0, max) + "\n… [truncated]" : lines;
}
