#!/usr/bin/env bun
// Generate an asciicast demo of interference's CLI.
// Captures branded header + /help (fast) + /model (fast).
// No LLM calls — instant commands only, so the GIF is quick.

const input = [
  "/help",
  "/model",
  "/exit",
];

const proc = Bun.spawn(["bun", "run", "src/cli.ts"], {
  stdin: "pipe", stdout: "pipe", stderr: "pipe",
  env: { ...process.env },
});
const w = proc.stdin as unknown as { write(s: string): void; end(): void };
for (const l of input) { w.write(l + "\n"); await Bun.sleep(200); }
await Bun.sleep(2000);
proc.kill();

const raw = Buffer.from(await new Response(proc.stdout).arrayBuffer());

// Build asciicast v2
const header = { version: 2, width: 100, height: 25 };
const events: Array<[number, string, string]> = [];
let t = 0.0;
let buf = "";

for (let i = 0; i < raw.length; i++) {
  const ch = String.fromCharCode(raw[i]!);
  buf += ch;
  if (ch === "\n" || buf.length > 200) {
    events.push([t, "o", buf]);
    buf = "";
    t += 0.08;
  }
}
if (buf) events.push([t, "o", buf]);

const out = [JSON.stringify(header), ...events.map(e => JSON.stringify(e))].join("\n");
await Bun.write("assets/demo.cast", out);
console.log(`Generated asciicast: ${events.length} frames, ${t.toFixed(1)}s`);
