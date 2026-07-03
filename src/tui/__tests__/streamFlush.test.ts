import { describe, test, expect } from "bun:test";
import { createStreamFlusher, STREAM_FLUSH_MS } from "../streamFlush.ts";

describe("fix/07 — streaming flush throttle (fewer redraws → scrollable)", () => {
  test("100 chunks over 500ms flush a handful of times, not 100", () => {
    let clock = 0;
    const flushed: string[] = [];
    const f = createStreamFlusher((v) => flushed.push(v), () => clock, STREAM_FLUSH_MS);
    let acc = "";
    for (let i = 0; i < 100; i++) {
      acc += "x";
      clock += 5; // 5ms per chunk → 500ms total, ~200 chunks/sec
      f.push(acc);
    }
    f.finish();
    // 500ms / 80ms ≈ 6-7 flushes (+leading +final). Must be an order of magnitude below 100.
    expect(flushed.length).toBeLessThanOrEqual(10);
    expect(flushed.length).toBeGreaterThan(3);
  });

  test("first push flushes immediately (leading edge, no initial lag)", () => {
    let clock = 1_700_000_000_000; // realistic Date.now()-like origin
    const flushed: string[] = [];
    const f = createStreamFlusher((v) => flushed.push(v), () => clock);
    f.push("hello");
    expect(flushed).toEqual(["hello"]);
  });

  test("finish() always flushes the last withheld value (no lost text)", () => {
    let clock = 0;
    const flushed: string[] = [];
    const f = createStreamFlusher((v) => flushed.push(v), () => clock);
    f.push("a"); // leading flush → "a"
    clock += 10;
    f.push("ab"); // within interval → withheld
    clock += 10;
    f.push("abc"); // within interval → withheld
    f.finish(); // flush the latest
    expect(flushed[flushed.length - 1]).toBe("abc");
  });

  test("flushed values are always the latest accumulated (monotonic, no stale frames)", () => {
    let clock = 0;
    const flushed: string[] = [];
    const f = createStreamFlusher((v) => flushed.push(v), () => clock);
    let acc = "";
    for (let i = 0; i < 20; i++) {
      acc += String(i) + " ";
      clock += 100; // > interval → every push flushes
      f.push(acc);
    }
    // Each flushed frame is a prefix-growing string ending in the current acc.
    expect(flushed[flushed.length - 1]).toBe(acc);
    for (let i = 1; i < flushed.length; i++) {
      expect(flushed[i]!.length).toBeGreaterThanOrEqual(flushed[i - 1]!.length);
    }
  });
});
