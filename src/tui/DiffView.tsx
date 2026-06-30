export interface DiffLine {
  type: "same" | "add" | "remove";
  text: string;
  oldNo?: number; // numero riga nel file vecchio (1-based) — same/remove
  newNo?: number; // numero riga nel file nuovo (1-based) — same/add
}

export function computeDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  let oi = 0;
  let ni = 0;
  // Numeri di riga 1-based: oi/ni sono indici 0-based → +1 al push.
  const same = (t: string) => result.push({ type: "same", text: t, oldNo: oi + 1, newNo: ni + 1 });
  const rem = (t: string) => result.push({ type: "remove", text: t, oldNo: oi + 1 });
  const add = (t: string) => result.push({ type: "add", text: t, newNo: ni + 1 });

  while (oi < oldLines.length && ni < newLines.length) {
    const old = oldLines[oi]!;
    const nw = newLines[ni]!;

    if (old === nw) {
      same(old);
      oi++;
      ni++;
      continue;
    }

    const oldEnd = findEnd(oldLines, newLines, oi, ni);
    if (oldEnd.oi === oi) {
      add(nw);
      ni++;
      continue;
    }
    if (oldEnd.ni === ni) {
      rem(old);
      oi++;
      continue;
    }

    while (oi < oldEnd.oi) {
      rem(oldLines[oi]!);
      oi++;
    }
    while (ni < oldEnd.ni) {
      add(newLines[ni]!);
      ni++;
    }
  }

  while (oi < oldLines.length) {
    rem(oldLines[oi]!);
    oi++;
  }
  while (ni < newLines.length) {
    add(newLines[ni]!);
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
  const no = (n?: number) => String(n ?? "").padStart(4, " ");
  for (const d of diff.slice(0, 80)) {
    const num = d.type === "add" ? no(d.newNo) : no(d.oldNo);
    const mark = d.type === "add" ? "+" : d.type === "remove" ? "-" : " ";
    lines.push(`${num} ${mark} ${d.text}`);
  }
  if (diff.length > 80) lines.push(`… and ${diff.length - 80} more lines`);
  return lines.join("\n");
}
