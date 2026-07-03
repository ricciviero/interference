// Time-gated flusher for streaming state (fix/07). During a turn the model streams text
// token-by-token; calling setState per chunk makes React re-render (and Ink redraw) as
// often as Ink's write cap allows (maxFps 30). Each redraw of the dynamic region re-anchors
// most terminals to the bottom, so scrolling UP to read earlier output fights the redraw.
//
// This flushes the accumulated value at most once per `intervalMs` (~12.5 Hz here, well
// below Ink's 30 fps), cutting the redraw frequency during streaming ~2.5x and giving the
// terminal room to process mouse scroll. The final text is unchanged: `finish()` always
// flushes the last value. `now` is injected so the logic is testable without a real clock.

export const STREAM_FLUSH_MS = 80;

export interface StreamFlusher {
  /** Record the latest accumulated value; flushes if enough time has passed. */
  push(value: string): void;
  /** Flush the last pending value unconditionally (call at end of stream). */
  finish(): void;
}

export function createStreamFlusher(
  onFlush: (value: string) => void,
  now: () => number,
  intervalMs = STREAM_FLUSH_MS,
): StreamFlusher {
  // -Infinity → the first push always flushes (leading edge: first token appears at once),
  // regardless of the clock's origin (real Date.now() or a test clock starting at 0).
  let last = -Infinity;
  let pending: string | null = null;
  return {
    push(value: string) {
      pending = value;
      const t = now();
      if (t - last >= intervalMs) {
        last = t;
        pending = null;
        onFlush(value);
      }
    },
    finish() {
      if (pending !== null) {
        const value = pending;
        pending = null;
        onFlush(value);
      }
    },
  };
}
