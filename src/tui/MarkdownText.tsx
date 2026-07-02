import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { tokenizeLine, normalizeLang } from "./syntax.ts";

// Minimal markdown rendering for the terminal (no dependencies):
// - fenced code ``` → dimmed block
// - heading #..###### → bold
// - bullet -, * → •
// - inline **bold** and `code`
// Deliberately conservative: clean text is better than fragile parsing.

// --- Table detection (GitHub-style, leading pipe) --------------------------
function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.length > 1;
}

function isTableSeparator(line: string): boolean {
  const t = line.trim();
  return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(t);
}

function parseTableCells(line: string): string[] {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.split("|").map((c) => c.trim());
}

// Renders a markdown table with left-aligned, width-computed columns. Cells over
// CELL_CAP are truncated (not wrapped) — same principle as the fence line cap.
function TableBlock({ header, rows }: { header: string[]; rows: string[][] }) {
  const CELL_CAP = 30;
  const cols = header.length;
  const widths = Array.from({ length: cols }, (_, c) =>
    Math.min(
      CELL_CAP,
      Math.max(header[c]?.length ?? 0, ...rows.map((r) => r[c]?.length ?? 0)),
    ),
  );
  const fmtRow = (cells: string[]) =>
    widths.map((w, ci) => (cells[ci] ?? "").slice(0, w).padEnd(w)).join("  ");

  return (
    <Box flexDirection="column">
      <Text bold>{fmtRow(header)}</Text>
      <Text dimColor>{widths.map((w) => "─".repeat(w)).join("  ")}</Text>
      {rows.map((r, i) => (
        <Text key={i}>{fmtRow(r)}</Text>
      ))}
    </Box>
  );
}

function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      out.push(<Text key={`${keyBase}-b${k++}`} bold>{tok.slice(2, -2)}</Text>);
    } else {
      out.push(<Text key={`${keyBase}-c${k++}`} color="cyan">{tok.slice(1, -1)}</Text>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MarkdownText({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let inFence = false;
  let lang = "";
  let fenceLines = 0;

  // Indexed loop (not forEach) so a table block can consume several consecutive
  // lines and advance `i` past them.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const t = line.trimStart();
    if (t.startsWith("```")) {
      if (!inFence) {
        inFence = true;
        lang = normalizeLang(t.slice(3));
        fenceLines = 0;
      } else {
        inFence = false;
        lang = "";
      }
      continue; // hide fence markers
    }
    if (inFence) {
      if (++fenceLines > 200) continue; // safety cap
      const toks = tokenizeLine(line, lang);
      blocks.push(
        <Text key={i}>
          {"  "}
          {toks.map((tk, j) => (
            <Text key={j} color={tk.color} dimColor={tk.dim}>
              {tk.text}
            </Text>
          ))}
        </Text>,
      );
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(<Text key={i} bold>{heading[2]}</Text>);
      continue;
    }
    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      blocks.push(
        <Text key={i}>
          {bullet[1]}• {renderInline(bullet[2] ?? "", `l${i}`)}
        </Text>,
      );
      continue;
    }
    // Table: header row + separator row (|---|---|) + data rows.
    if (isTableRow(line) && lines[i + 1] && isTableSeparator(lines[i + 1]!)) {
      const header = parseTableCells(line);
      let j = i + 2;
      const rows: string[][] = [];
      while (j < lines.length && isTableRow(lines[j]!)) {
        rows.push(parseTableCells(lines[j]!));
        j++;
      }
      blocks.push(<TableBlock key={i} header={header} rows={rows} />);
      i = j - 1; // consumed through row j-1; loop i++ moves to j
      continue;
    }
    blocks.push(<Text key={i}>{renderInline(line, `l${i}`)}</Text>);
  }

  return <Box flexDirection="column">{blocks}</Box>;
}
