import { useState, useEffect, useCallback, useRef, type FC, type ReactNode } from "react";
import { Box, Text } from "ink";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

interface Props {
  toasts: Toast[];
}

export function ToastContainer({ toasts }: Props) {
  if (toasts.length === 0) return null;

  return (
    <Box flexDirection="column">
      {toasts.slice(0, 3).map((t) => (
        <Box key={t.id} marginBottom={0}>
          <Text
            color={
              t.type === "success"
                ? "green"
                : t.type === "error"
                  ? "red"
                  : t.type === "warning"
                    ? "yellow"
                    : "blue"
            }
          >
            {t.type === "success" ? "✓" : t.type === "error" ? "✗" : t.type === "warning" ? "△" : "ℹ"}{" "}
            {t.message}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

let nextToastId = 1;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const addToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = nextToastId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timers.current.delete(timer);
    }, 3000);
    timers.current.add(timer);
  }, []);

  useEffect(() => {
    return () => {
      for (const t of timers.current) clearTimeout(t);
    };
  }, []);

  return { toasts, addToast };
}
