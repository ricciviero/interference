import { Box, Text } from "ink";
import { Spinner } from "@inkjs/ui";
import type { DiffLine } from "./DiffView.tsx";

// Vista di un tool step (call → result). Allineata a ToolEntry in App.tsx.
export interface ToolView {
  toolName: string;
  input: unknown;
  output?: string;
  isError?: boolean;
  diff?: DiffLine[] | null;
}

// Icone per tipo (convenzione opencode, adattata — fonte: opencode-dev/packages/tui).
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

// Tool con output complesso → blocco con bordo sinistro. Gli altri → riga inline.
const BLOCK = new Set(["bash", "write", "edit"]);

function rec(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

// Descrizione sintetica (path/comando/pattern) invece del JSON grezzo.
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
      return Array.isArray(i.questions) ? `${i.questions.length} question(s)` : "question";
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
  const iconColor = tool.isError ? "red" : "cyan";
  return (
    <Box flexDirection="column" paddingLeft={3}>
      <Box>
        <Text color={iconColor}>{icon} </Text>
        <Text color={tool.isError ? "red" : undefined} dimColor={!tool.isError && !pending}>
          {tool.toolName} {desc}
        </Text>
        {pending && <Spinner label="" />}
      </Box>
      {!pending && tool.output && (
        <Text dimColor color={tool.isError ? "red" : undefined}>
          {"  "}
          {oneLine(tool.output)}
        </Text>
      )}
    </Box>
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
  const title =
    tool.toolName === "bash" ? oneLine(desc, 160) : `${tool.toolName} ${desc}`;
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={tool.isError ? "red" : "gray"}
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      paddingLeft={1}
      marginTop={1}
      marginBottom={1}
    >
      <Box>
        <Text color={tool.isError ? "red" : "cyan"} bold>
          {icon}{" "}
        </Text>
        <Text bold>{title}</Text>
        {pending && <Spinner label="" />}
      </Box>
      {tool.diff && tool.diff.length > 0 ? (
        <DiffBody diff={tool.diff} />
      ) : (
        !pending &&
        tool.output && (
          <Text dimColor color={tool.isError ? "red" : undefined}>
            {clip(tool.output)}
          </Text>
        )
      )}
    </Box>
  );
}

function DiffBody({ diff }: { diff: DiffLine[] }) {
  return (
    <Box flexDirection="column">
      {diff.slice(0, 15).map((d, i) => (
        <Text
          key={i}
          color={d.type === "add" ? "green" : d.type === "remove" ? "red" : undefined}
          dimColor={d.type === "same"}
        >
          {d.type === "add" ? "+ " : d.type === "remove" ? "- " : "  "}
          {d.text.slice(0, 100)}
        </Text>
      ))}
      {diff.length > 15 && <Text dimColor>… {diff.length - 15} more lines</Text>}
    </Box>
  );
}

function clip(s: string, max = 500): string {
  const lines = s.split("\n").slice(0, 12).join("\n");
  return lines.length > max ? lines.slice(0, max) + "\n… [truncated]" : lines;
}
