export interface DiffLine {
  type: "same" | "add" | "remove";
  text: string;
}

export function computeDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  let oi = 0;
  let ni = 0;

  while (oi < oldLines.length && ni < newLines.length) {
    const old = oldLines[oi]!;
    const nw = newLines[ni]!;

    if (old === nw) {
      result.push({ type: "same", text: old });
      oi++;
      ni++;
      continue;
    }

    const oldEnd = findEnd(oldLines, newLines, oi, ni);
    if (oldEnd.oi === oi) {
      result.push({ type: "add", text: nw });
      ni++;
      continue;
    }
    if (oldEnd.ni === ni) {
      result.push({ type: "remove", text: old });
      oi++;
      continue;
    }

    while (oi < oldEnd.oi) {
      result.push({ type: "remove", text: oldLines[oi]! });
      oi++;
    }
    while (ni < oldEnd.ni) {
      result.push({ type: "add", text: newLines[ni]! });
      ni++;
    }
  }

  while (oi < oldLines.length) {
    result.push({ type: "remove", text: oldLines[oi]! });
    oi++;
  }
  while (ni < newLines.length) {
    result.push({ type: "add", text: newLines[ni]! });
    ni++;
  }

  return result;
}

function findEnd(
  oldLines: string[],
  newLines: string[],
  oi: number,
  ni: number,
): { oi: number; ni: number } {
  for (let o = oi + 1; o <= oldLines.length; o++) {
    for (let n = ni; n < newLines.length; n++) {
      if (oldLines[o] === newLines[n]) {
        return { oi: o, ni: n };
      }
    }
  }
  return { oi: oldLines.length, ni: newLines.length };
}

export function formatDiff(diff: DiffLine[]): string {
  const lines: string[] = [];
  for (const d of diff.slice(0, 80)) {
    switch (d.type) {
      case "add":
        lines.push(`+ ${d.text}`);
        break;
      case "remove":
        lines.push(`- ${d.text}`);
        break;
      default:
        lines.push(`  ${d.text}`);
    }
  }
  if (diff.length > 80) lines.push(`… and ${diff.length - 80} more lines`);
  return lines.join("\n");
}
