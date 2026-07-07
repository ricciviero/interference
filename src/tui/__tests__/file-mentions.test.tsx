import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  getAtQuery,
  insertMention,
  rankFileMentions,
  isSubsequence,
  scanProjectFiles,
} from "../fileMentions.ts";
import { FileMentionMenu } from "../FileMentionMenu.tsx";

describe("getAtQuery", () => {
  test("finds an active @-token being typed", () => {
    expect(getAtQuery("spiega @src/co")).toEqual({ query: "src/co", at: 7 });
    expect(getAtQuery("@src")).toEqual({ query: "src", at: 0 });
    expect(getAtQuery("vai @")).toEqual({ query: "", at: 4 });
  });

  test("returns null when there is no @, or the token is closed by a space", () => {
    expect(getAtQuery("nessun tag qui")).toBeNull();
    expect(getAtQuery("@src/config.ts fatto")).toBeNull(); // space after → completed
  });

  test("uses the LAST @ when several are present", () => {
    expect(getAtQuery("@a.ts poi @b")).toEqual({ query: "b", at: 10 });
  });
});

describe("insertMention", () => {
  test("replaces the active @-token with @<path> + trailing space", () => {
    expect(insertMention("spiega @src", 7, "src/config.ts")).toBe("spiega @src/config.ts ");
    expect(insertMention("@sr", 0, "src/cli.ts")).toBe("@src/cli.ts ");
  });
});

describe("isSubsequence", () => {
  test("matches in-order subsequence", () => {
    expect(isSubsequence("cfg", "config")).toBe(true);
    expect(isSubsequence("gfc", "config")).toBe(false);
  });
});

describe("rankFileMentions", () => {
  const files = ["src/config.ts", "src/cli.ts", "src/config-file.ts", "README.md", "docs/config.md"];

  test("empty query returns the first N files", () => {
    expect(rankFileMentions(files, "", 3)).toEqual(files.slice(0, 3));
  });

  test("ranks basename prefix above substring, exact filename first", () => {
    const r = rankFileMentions(files, "config");
    // src/config.ts (basename starts with "config", shortest) should rank first
    expect(r[0]).toBe("src/config.ts");
    expect(r).toContain("src/config-file.ts");
    expect(r).toContain("docs/config.md");
    expect(r).not.toContain("README.md"); // no "config" in it
  });

  test("matches on path segments too", () => {
    expect(rankFileMentions(files, "cli")).toEqual(["src/cli.ts"]);
  });
});

describe("scanProjectFiles", () => {
  test("lists files, skipping node_modules/.git and .gitignore'd entries", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fm-"));
    await writeFile(path.join(root, ".gitignore"), "ignored/\n*.log\n");
    await writeFile(path.join(root, "a.ts"), "");
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "b.ts"), "");
    await mkdir(path.join(root, "node_modules"));
    await writeFile(path.join(root, "node_modules", "x.js"), "");
    await mkdir(path.join(root, ".git"));
    await writeFile(path.join(root, ".git", "y"), "");
    await mkdir(path.join(root, "ignored"));
    await writeFile(path.join(root, "ignored", "z.ts"), "");
    await writeFile(path.join(root, "app.log"), "");

    const files = await scanProjectFiles(root);
    expect(files).toContain("a.ts");
    expect(files).toContain("src/b.ts");
    expect(files).not.toContain("node_modules/x.js");
    expect(files).not.toContain(".git/y");
    expect(files).not.toContain("ignored/z.ts"); // .gitignore dir
    expect(files).not.toContain("app.log"); // *.log
  });
});

describe("FileMentionMenu", () => {
  test("renders @-prefixed matches with a ▸ on the selected one", () => {
    const { lastFrame, unmount } = render(
      <FileMentionMenu matches={["src/config.ts", "src/cli.ts"]} selected={1} />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("@src/config.ts");
    expect(out).toContain("@src/cli.ts");
    expect(out).toContain("▸ @src/cli.ts"); // selected index 1
    unmount();
  });

  test("renders nothing when there are no matches", () => {
    const { lastFrame, unmount } = render(<FileMentionMenu matches={[]} selected={0} />);
    expect((lastFrame() ?? "").trim()).toBe("");
    unmount();
  });
});
