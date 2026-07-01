import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { tokenizeLine, normalizeLang } from "./syntax.ts";

// Minimal markdown rendering for the terminal (no dependencies):
// - fenced code ``` → dimmed block
// - heading #..###### → bold
// - bullet -, * → •
// - inline **bold** and `code`
// Deliberately conservative: clean text is better than fragile parsing.

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

  lines.forEach((line, i) => {
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
      return; // hide fence markers
    }
    if (inFence) {
      if (++fenceLines > 200) return; // safety cap
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
      return;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(<Text key={i} bold>{heading[2]}</Text>);
      return;
    }
    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      blocks.push(
        <Text key={i}>
          {bullet[1]}• {renderInline(bullet[2] ?? "", `l${i}`)}
        </Text>,
      );
      return;
    }
    blocks.push(<Text key={i}>{renderInline(line, `l${i}`)}</Text>);
  });

  return <Box flexDirection="column">{blocks}</Box>;
}
