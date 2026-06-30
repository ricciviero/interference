#!/usr/bin/env bun
// Record a demo asciicast of interference in action.
// Uses plain CLI (non-TTY) so it's scriptable.

const session1 = await run([
  "/model",
  "/thinking off",
  "list the files in src/agent/",
  "/exit",
]);

const session2 = await run([
  "What does the project do? Briefly describe it.",
  "/exit",
]);

// Build combined asciicast
const header = { version: 2, width: 100, height: 30 };
const events: Array<[number, string, string]> = [];

let t = 0;
let pause = 0;
function writeFrame(text: string, delay = 0.15) {
  t += delay;
  for (const line of text.split("\n")) {
    events.push([t, "o", line + "\r\n"]);
    t += 0.03;
  }
  t += 0.5;
}

const all = session1 + "\n\n\n" + session2;
writeFrame(all, 0.3);

const out = [JSON.stringify(header), ...events.map(e => JSON.stringify(e))].join("\n");
await Bun.write("assets/demo.cast", out);
console.log("Wrote assets/demo.cast");

// Convert to GIF
const { stdout, stderr } = Bun.spawnSync(["agg", "assets/demo.cast", "assets/demo.gif", "--font-size", "14", "--cols", "100", "--rows", "20"]);
if (stderr.length > 0) console.error(stderr.toString());
console.log("GIF conversion:", stdout.toString() || "done");

async function run(lines: string[]): Promise<string> {
  const proc = Bun.spawn(["bun", "run", "src/cli.ts"], {
    stdin: "pipe", stdout: "pipe", stderr: "pipe",
    env: { ...process.env },
  });
  const w = proc.stdin as unknown as { write(s: string): void; end(): void };
  for (const l of lines) { w.write(l + "\n"); await Bun.sleep(200); }
  await Bun.sleep(15000);
  proc.kill();
  return await new Response(proc.stdout).text();
}
