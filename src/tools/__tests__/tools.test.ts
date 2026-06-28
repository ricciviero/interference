import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import * as path from "node:path";
import { read } from "../read.ts";
import { ls } from "../ls.ts";
import { glob } from "../glob.ts";
import { grep } from "../grep.ts";
import { resolveInWorkspace } from "../_fs.ts";

const TMP = path.join(process.cwd(), ".test-tmp");

beforeAll(async () => {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(TMP, { recursive: true });
  await mkdir(path.join(TMP, "empty"));
  await mkdir(path.join(TMP, "sub"), { recursive: true });
  await writeFile(path.join(TMP, "a.ts"), "export const hello = 42;\nconst world = 'cafe';\n");
  await writeFile(path.join(TMP, "b.ts"), "function foo() { return 1; }\nfunction bar() { return 2; }\n");
  await writeFile(path.join(TMP, "sub", "c.ts"), "import { hello } from './a';\nexport const sum = hello + 10;\n");
  await writeFile(path.join(TMP, "binary.bin"), Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE]));
  for (let i = 0; i < 50; i++) {
    await writeFile(path.join(TMP, `many_${String(i).padStart(3, "0")}.txt`), `file ${i}\n`);
  }
  await mkdir(path.join(TMP, "bigdir"), { recursive: true });
  for (let i = 0; i < 250; i++) {
    await writeFile(path.join(TMP, "bigdir", `file_${String(i).padStart(3, "0")}.txt`), `file ${i}\n`);
  }
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

async function call<R>(t: { execute?: (...args: any[]) => any }, input: any): Promise<R> {
  return t.execute!(input, {} as any);
}

describe("_fs.ts — resolveInWorkspace", () => {
  test("risolve path relativo dentro workspace", () => {
    const abs = resolveInWorkspace(".test-tmp/a.ts");
    expect(abs).toEndWith(".test-tmp/a.ts");
    expect(abs).toStartWith(process.cwd());
  });

  test("risolve path assoluto dentro workspace", () => {
    const absPath = path.join(process.cwd(), ".test-tmp/a.ts");
    const abs = resolveInWorkspace(absPath);
    expect(abs).toBe(absPath);
  });

  test("rifiuta ../ che esce dalla workspace", () => {
    expect(() => resolveInWorkspace("../../../etc/passwd")).toThrow("escapes workspace");
  });

  test("rifiuta path assoluto fuori workspace", () => {
    expect(() => resolveInWorkspace("/etc/passwd")).toThrow("escapes workspace");
  });

  test("accetta '.' ≡ workspace root", () => {
    expect(resolveInWorkspace(".")).toBe(process.cwd());
  });
});

describe("read tool", () => {
  test("legge file esistente", async () => {
    const out = await call<string>(read, { path: ".test-tmp/a.ts" });
    expect(out).toContain("export const hello = 42");
    expect(out).toStartWith(".test-tmp/a.ts");
  });

  test("file inesistente → errore chiaro", async () => {
    const out = await call<string>(read, { path: ".test-tmp/nonesiste.txt" });
    expect(out).toStartWith("Error: file not found");
  });

  test("offset funziona", async () => {
    const out = await call<string>(read, { path: ".test-tmp/b.ts", offset: 1 });
    expect(out).not.toContain("function foo");
    expect(out).toContain("function bar");
  });

  test("limit funziona", async () => {
    const out = await call<string>(read, { path: ".test-tmp/b.ts", offset: 0, limit: 1 });
    expect(out).toContain("function foo");
    expect(out).not.toContain("function bar");
  });

  test("path fuori workspace → errore", async () => {
    try {
      await call<string>(read, { path: "../etc/passwd" });
      expect.unreachable();
    } catch (err) {
      expect(String(err)).toContain("escapes workspace");
    }
  });

  test("legge file binario senza crashare", async () => {
    const out = await call<string>(read, { path: ".test-tmp/binary.bin" });
    expect(out).toStartWith(".test-tmp/binary.bin");
  });
});

describe("ls tool", () => {
  test("elenca directory", async () => {
    const out = await call<string>(ls, { path: ".test-tmp" });
    expect(out).toContain("a.ts");
    expect(out).toContain("b.ts");
    expect(out).toContain("sub/");
    expect(out).toContain("empty/");
    expect(out).toContain("entries");
  });

  test("dir vuota", async () => {
    const out = await call<string>(ls, { path: ".test-tmp/empty" });
    expect(out).toContain("(empty)");
  });

  test("dir inesistente → errore", async () => {
    const out = await call<string>(ls, { path: ".test-tmp/xyzzy" });
    expect(out).toStartWith("Error: directory not found");
  });

  test("default ≡ workspace root", async () => {
    const out = await call<string>(ls, {});
    expect(out).toContain("src");
  });

  test("dir con molti file → troncamento a MAX_ENTRIES", async () => {
    const out = await call<string>(ls, { path: ".test-tmp/bigdir" });
    expect(out).toContain("more entries");
    expect(out).toContain("entries");
  });

  test("path fuori workspace → errore", async () => {
    try {
      await call<string>(ls, { path: "../" });
      expect.unreachable();
    } catch (err) {
      expect(String(err)).toContain("escapes workspace");
    }
  });
});

describe("glob tool", () => {
  test("match semplice", async () => {
    const out = await call<string>(glob, { pattern: "*.ts", cwd: ".test-tmp" });
    expect(out).toContain("a.ts");
    expect(out).toContain("b.ts");
  });

  test("pattern ricorsivo", async () => {
    const out = await call<string>(glob, { pattern: "**/*.ts", cwd: ".test-tmp" });
    expect(out).toContain("a.ts");
    expect(out).toContain("sub/c.ts");
  });

  test("nessun match", async () => {
    const out = await call<string>(glob, { pattern: "*.xyz", cwd: ".test-tmp" });
    expect(out).toContain("No files matched");
  });

  test("cwd default", async () => {
    const out = await call<string>(glob, { pattern: "*.json" });
    expect(out).toContain("package.json");
  });

  test("path fuori workspace → errore", async () => {
    try {
      await call<string>(glob, { pattern: "*", cwd: "../etc" });
      expect.unreachable();
    } catch (err) {
      expect(String(err)).toContain("escapes workspace");
    }
  });

  test("molti match → troncati", async () => {
    const out = await call<string>(glob, { pattern: "*", cwd: ".test-tmp/bigdir" });
    expect(out).toContain("truncated");
  });
});

describe("grep tool", () => {
  test("match semplice", async () => {
    const out = await call<string>(grep, { pattern: "hello", path: ".test-tmp" });
    expect(out).toContain("hello");
    expect(out).toContain("a.ts");
  });

  test("nessun match", async () => {
    const out = await call<string>(grep, { pattern: "zzzNOZZZ", path: ".test-tmp" });
    expect(out).toContain("No matches");
  });

  test("case insensitive", async () => {
    const out = await call<string>(grep, { pattern: "HELLO", path: ".test-tmp", ignoreCase: true });
    expect(out).toContain("hello");
  });

  test("include filter", async () => {
    const out = await call<string>(grep, { pattern: "export", path: ".test-tmp", include: "*.ts" });
    expect(out).toContain("export");
  });

  test("regex invalida → errore in fallback JS", async () => {
    const out = await call<string>(grep, { pattern: "[invalid", path: ".test-tmp" });
    expect(out).toContain("grep error");
  });

  test("path fuori workspace → errore", async () => {
    try {
      await call<string>(grep, { pattern: "x", path: "../etc" });
      expect.unreachable();
    } catch (err) {
      expect(String(err)).toContain("escapes workspace");
    }
  });
});
