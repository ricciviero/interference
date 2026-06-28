import { tool } from "ai";
import { z } from "zod";

const OUTPUT_CAP = 20_000;
const TIMEOUT_MS = 15_000;

export const webfetch = tool({
  description:
    "Fetch content from a URL and return it as text. " +
    "Use this to read documentation, check API references, or research external resources. " +
    "Returns the text content of the page (HTML stripped).",
  inputSchema: z.object({
    url: z.string().describe("The URL to fetch. Must be a fully-formed valid URL (http/https)."),
    timeout: z
      .number()
      .int()
      .min(1_000)
      .max(60_000)
      .optional()
      .describe("Timeout in milliseconds (default: 15000)"),
  }),
  execute: async ({ url, timeout }) => {
    const ms = timeout ?? TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "interference/0.1 (+https://github.com/ricciviero/interference)",
          Accept: "text/html, text/plain, */*",
        },
      });
      clearTimeout(timer);

      if (!response.ok) {
        return `Error fetching URL: ${response.status} ${response.statusText}`;
      }

      const contentType = response.headers.get("content-type") ?? "";
      const isHtml = contentType.includes("text/html") || contentType.includes("application/xhtml");

      if (isHtml) {
        const html = await response.text();
        const text = stripHtml(html);
        if (text.length === 0) return "Fetched page but no text content extracted.";
        return truncate(text, OUTPUT_CAP, url);
      }

      const text = await response.text();
      if (text.length === 0) return "Fetched empty response.";
      return truncate(text, OUTPUT_CAP, url);
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof DOMException && err.name === "AbortError") {
        return `Fetch timed out after ${ms}ms for URL: ${url}`;
      }
      const msg = err instanceof Error ? err.message : String(err);
      return `Error fetching URL: ${msg}`;
    }
  },
});

function stripHtml(html: string): string {
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "");

  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/pre>/gi, "\n");

  text = text.replace(/<[^>]+>/g, "");

  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number.parseInt(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(Number.parseInt(n, 16)));

  text = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");

  return text.trim();
}

function truncate(text: string, cap: number, url: string): string {
  if (text.length <= cap) return text;
  const truncated = text.slice(0, cap);
  const originalSize = `${(text.length / 1024).toFixed(1)}K`;
  return `${truncated}\n\n… [truncated from ${originalSize}, original: ${url}]`;
}
