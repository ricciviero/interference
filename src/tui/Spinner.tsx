import { useState, useEffect } from "react";
import { Text } from "ink";

// Spinner d'interferenza (it. 26), eco del mark animato del brand
// (logo/interference-mark-animated.svg): due sorgenti `◉` i cui fronti d'onda `‹ ›`
// si espandono verso il centro e interferiscono in `✕`, poi svaniscono e ripartono.
// Tutti i frame larghi 7 → niente jitter.
const FRAMES = [
  "◉     ◉",
  "◉‹   ›◉",
  "◉‹‹ ››◉",
  "◉‹‹✕››◉",
  "◉‹ ✕ ›◉",
  "◉  ✕  ◉",
  "◉  ·  ◉",
];

// Variante compatta (3 col) per le righe inline dei tool.
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
