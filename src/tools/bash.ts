import { tool } from "ai";
import { z } from "zod";
import { decide, requestConfirmation } from "../permissions.ts";

const OUTPUT_CAP = 30_000;
const DEFAULT_TIMEOUT_MS = 120_000;

export const bash = tool({
  description:
    "Execute a shell command in the workspace. " +
    "Use this for git operations, running tests, installing packages, building, etc. " +
    "Never use interactive commands (no -i, no editors). " +
    "Explain what the command does before running it.",
  inputSchema: z.object({
    command: z.string().describe("The shell command to execute"),
    timeout: z
      .number()
      .int()
      .min(1_000)
      .max(300_000)
      .optional()
      .describe("Timeout in milliseconds (default: 120000)"),
  }),
  execute: async ({ command, timeout }) => {
    const decision = decide("bash", command);
    if (decision === "deny") {
      return `Command denied by policy: '${command}'`;
    }
    if (decision === "ask") {
      const preview = `[bash] ${command}`;
      const allowed = await requestConfirmation("bash", preview);
      if (!allowed) {
        return `Command refused by user: '${command}'`;
      }
    }

    const ms = timeout ?? DEFAULT_TIMEOUT_MS;
    const proc = Bun.spawn(["sh", "-c", command], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });

    // Esecuzione (lettura stream + exit) in gara col timeout. Allo scadere
    // uccidiamo il processo e ritorniamo SUBITO senza aspettare l'EOF: un figlio
    // orfano (es. `sleep`) può tenere la pipe aperta dopo la morte della shell e
    // bloccherebbe la lettura. (L'opzione `timeout` di Bun.spawn non è affidabile
    // su tutti i runner.)
    const finished = (async () => {
      const [stdout, stderr] = await Promise.all([
        readStream(proc.stdout, OUTPUT_CAP),
        readStream(proc.stderr, OUTPUT_CAP),
      ]);
      const exitCode = await proc.exited;
      return { stdout, stderr, exitCode };
    })().catch(() => ({ stdout: "", stderr: "", exitCode: 1 }));

    const result = await Promise.race([
      finished,
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms)),
    ]);

    if (result === "timeout") {
      try {
        proc.kill(9);
      } catch {}
      return `Command timed out after ${ms}ms and was killed.`;
    }

    const { stdout, stderr, exitCode } = result;

    let output = "";
    if (stdout.length > 0) output += stdout;
    if (stderr.length > 0) {
      if (output.length > 0) output += "\n";
      output += "[stderr]\n" + stderr;
    }

    const truncated =
      stdout.length >= OUTPUT_CAP || stderr.length >= OUTPUT_CAP ? " [output truncated]" : "";
    const exitInfo = exitCode === 0 ? "" : ` (exit code: ${exitCode})`;

    if (output.length === 0 && exitCode !== 0) {
      return `Command failed (exit code: ${exitCode}) with no output.`;
    }
    if (output.length === 0) {
      return `Command succeeded (no output).`;
    }

    return `${output}${truncated}${exitInfo}`;
  },
});

async function readStream(
  stream: ReadableStream | null,
  cap: number,
): Promise<string> {
  if (!stream) return "";
  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length > cap) {
        text = text.slice(0, cap);
        reader.cancel();
        break;
      }
    }
  } catch {
    // reader cancelled
  }

  let final: string;
  try { final = decoder.decode(); } catch { final = ""; }
  if (final.length > 0 && text.length < cap) text += final;

  return text.slice(0, cap);
}
