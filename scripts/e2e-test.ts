#!/usr/bin/env bun
import { rm } from "node:fs/promises";

const TMP = ".test-tmp";
await rm(TMP, { recursive: true, force: true });

let ok = 0;
let nok = 0;

function check(name: string, pass: boolean) {
  if (pass) { console.log(`  ${name}... OK`); ok++; }
  else { console.log(`  ${name}... FAIL`); nok++; }
}

async function run(lines: string[]): Promise<string> {
  const p = Bun.spawn(["bun", "run", "src/cli.ts"], {
    stdin: "pipe", stdout: "pipe", stderr: "pipe",
    env: { ...process.env },
  });
  const w = p.stdin as unknown as { write(s: string): void };
  for (const l of lines) { w.write(l + "\n"); await Bun.sleep(300); }
  await Bun.sleep(8000);
  p.kill();
  return await new Response(p.stdout).text();
}

// Plan mode: bash non esposto → l'agente risponderà che non può
{
  const out = await run(["run command: echo this-should-not-execute", "/exit"]);
  check("Plan: bash not available", !out.includes("this-should-not-execute"));
}

// Build mode con deny: rm -rf bloccato
{
  const out = await run(["/build", "run: rm -rf /tmp/x", "/exit"]);
  check("Build: rm -rf denied", out.includes("denied") || out.includes("Denied"));
}

// Build mode: ls (read-only) funziona senza conferma
{
  const out = await run(["/build", "list files in src/agent", "/exit"]);
  check("Build: ls works (no confirm)", out.includes("loop.ts") || out.includes("prompt.ts"));
}

await rm(TMP, { recursive: true, force: true });
console.log(`\n${ok} passed, ${nok} failed`);
process.exit(nok > 0 ? 1 : 0);
