// Syntax highlighting MINIMALE per i code block (it. 22). Niente parser/dipendenze:
// un tokenizer a regex per pochi scope (commento/stringa/numero/keyword) — "good enough"
// come la subtle-syntax di opencode. Colori per il contenuto (i code block sono per natura
// colorati); la chrome resta B&W.

export interface Tok {
  text: string;
  color?: string;
  dim?: boolean;
}

const KW: Record<string, string[]> = {
  ts: ["import","export","from","const","let","var","function","return","if","else","for","while","class","extends","implements","interface","type","enum","new","async","await","try","catch","finally","throw","typeof","instanceof","as","in","of","public","private","protected","readonly","static","void","null","undefined","true","false"],
  js: ["import","export","from","const","let","var","function","return","if","else","for","while","class","extends","new","async","await","try","catch","finally","throw","typeof","instanceof","in","of","null","undefined","true","false"],
  py: ["def","class","import","from","return","if","elif","else","for","while","try","except","finally","with","as","in","not","and","or","is","lambda","yield","async","await","pass","raise","None","True","False","self"],
  sh: ["if","then","else","elif","fi","for","in","do","done","while","case","esac","function","echo","export","local","return","cd","exit"],
  json: [],
};

export function normalizeLang(info: string): string {
  const l = info.toLowerCase().trim();
  if (l === "ts" || l === "typescript" || l === "tsx") return "ts";
  if (l === "js" || l === "javascript" || l === "jsx" || l === "mjs") return "js";
  if (l === "py" || l === "python") return "py";
  if (l === "sh" || l === "bash" || l === "shell" || l === "zsh") return "sh";
  if (l === "json") return "json";
  return "";
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function tokenizeLine(line: string, lang: string): Tok[] {
  if (!lang) return [{ text: line }];
  const kw = KW[lang] ?? [];
  const commentPat = lang === "py" || lang === "sh" ? "(#[^\\n]*)" : "(\\/\\/[^\\n]*)";
  const parts = [
    commentPat,
    "(\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|`(?:[^`\\\\]|\\\\.)*`)",
    "(\\b\\d+(?:\\.\\d+)?\\b)",
  ];
  if (kw.length) parts.push("(\\b(?:" + kw.map(escape).join("|") + ")\\b)");
  const re = new RegExp(parts.join("|"), "g");

  const out: Tok[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out.push({ text: line.slice(last, m.index) });
    if (m[1]) out.push({ text: m[0], color: "gray", dim: true }); // commento
    else if (m[2]) out.push({ text: m[0], color: "green" }); // stringa
    else if (m[3]) out.push({ text: m[0], color: "magenta" }); // numero
    else out.push({ text: m[0], color: "cyan" }); // keyword
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++; // guard anti-loop
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out.length ? out : [{ text: line }];
}
