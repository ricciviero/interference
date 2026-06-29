import { useState, type FC } from "react";
import { Box, Text, useInput } from "ink";
import { Select, MultiSelect } from "@inkjs/ui";
import type { QuestionSpec, Answers } from "../tools/question.ts";

interface Props {
  questions: QuestionSpec[];
  onResolve: (answers: Answers) => void;
}

export const QuestionDialog: FC<Props> = ({ questions, onResolve }) => {
  const [qIdx, setQIdx] = useState(0);
  // Risposte accumulate (label selezionate) per domanda.
  const [acc, setAcc] = useState<Answers>(() => questions.map(() => []));

  const q = questions[qIdx]!;
  const multiple = q.multiple ?? false;
  const total = questions.length;

  // value = indice opzione (stringa); risaliamo alla label al commit.
  const options = q.options.map((o, i) => ({
    label: o.description ? `${o.label}  — ${o.description}` : o.label,
    value: String(i),
  }));

  function commit(values: string[]) {
    const labels = values.map((v) => q.options[Number(v)]!.label);
    const next = acc.map((a, i) => (i === qIdx ? labels : a));
    if (qIdx + 1 < total) {
      setAcc(next);
      setQIdx(qIdx + 1);
    } else {
      onResolve(next);
    }
  }

  // Esc salta tutto. Le altre frecce/spazio/Invio sono gestiti da Select/MultiSelect.
  useInput((_i, key) => {
    if (key.escape) onResolve(questions.map(() => []));
  }, { isActive: true });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1} marginBottom={1}>
      <Box>
        {q.header ? <Text color="cyan" bold>[{q.header}] </Text> : null}
        <Text bold>{q.question}</Text>
        {total > 1 ? <Text dimColor>  ({qIdx + 1}/{total})</Text> : null}
      </Box>
      <Box marginTop={1}>
        {multiple ? (
          // key={qIdx}: remount per domanda → stato interno azzerato
          <MultiSelect key={qIdx} options={options} onSubmit={commit} />
        ) : (
          <Select key={qIdx} options={options} onChange={(v) => commit([v])} />
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          ↑↓ move · {multiple ? "space toggle · Enter confirm" : "Enter select"} · Esc skip
        </Text>
      </Box>
    </Box>
  );
};
