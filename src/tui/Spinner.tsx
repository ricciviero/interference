import { useState, useEffect } from "react";
import { Text } from "ink";

// Interference spinner (it. 26), echo of the animated brand mark
// (logo/interference-mark-animated.svg): two `◉` sources whose wavefronts `‹ ›`
// expand toward the center and interfere in `✕`, then fade and restart.
// All frames are 7 wide → no jitter.
const FRAMES = [
  "◉     ◉",
  "◉‹   ›◉",
  "◉‹‹ ››◉",
  "◉‹‹✕››◉",
  "◉‹ ✕ ›◉",
  "◉  ✕  ◉",
  "◉  ·  ◉",
];

// Compact variant (3 cols) for inline tool rows.
const FRAMES_INLINE = ["‹✕›", "·✕·", " ✕ ", "‹ ›"];

function useFrame(frames: string[], ms: number): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % frames.length), ms);
    return () => clearInterval(t);
  }, [frames, ms]);
  return frames[i]!;
}

export function Spinner({ label }: { label?: string }) {
  const frame = useFrame(FRAMES, 110);
  return (
    <Text>
      <Text color="white">{frame}</Text>
      {label ? <Text dimColor>{" " + label}</Text> : null}
    </Text>
  );
}

export function SpinnerInline() {
  const frame = useFrame(FRAMES_INLINE, 130);
  return <Text dimColor>{frame}</Text>;
}
