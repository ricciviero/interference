import { Box, Text } from "ink";
import type { ReactNode } from "react";

// Rendering markdown minimale per il terminale (no dipendenze):
// - fenced code ``` → blocco dim
// - heading #..###### → bold
// - bullet -, * → •
// - inline **bold** e `code`
// Volutamente conservativo: meglio testo pulito che parsing fragile.

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

  lines.forEach((line, i) => {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      return; // nascondi i marker di fence
    }
    if (inFence) {
      blocks.push(<Text key={i} dimColor>  {line}</Text>);
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
