import { describe, test, expect, afterEach } from "bun:test";
import { question, setAnswerHandler, requestAnswer, type QuestionSpec } from "../question.ts";

async function call(input: any): Promise<string> {
  return question.execute!(input, {} as any) as Promise<string>;
}

afterEach(() => {
  setAnswerHandler(null);
});

const SAMPLE: QuestionSpec[] = [
  {
    question: "Which library?",
    header: "Lib",
    options: [
      { label: "zod", description: "schema validation" },
      { label: "yup" },
    ],
  },
];

describe("question tool", () => {
  test("passes questions to handler and formats the answer", async () => {
    let seen: QuestionSpec[] | null = null;
    setAnswerHandler(async (qs) => {
      seen = qs;
      return [["zod"]];
    });
    const out = await call({ questions: SAMPLE });
    expect(seen).not.toBeNull();
    expect(seen!).toHaveLength(1);
    expect(out).toContain("Q: Which library?");
    expect(out).toContain("A: zod");
  });

  test("multi-select joins multiple labels", async () => {
    setAnswerHandler(async () => [["zod", "yup"]]);
    const out = await call({ questions: SAMPLE });
    expect(out).toContain("A: zod, yup");
  });

  test("no answer falls back to a 'no answer' marker", async () => {
    setAnswerHandler(async (qs) => qs.map(() => []));
    const out = await call({ questions: SAMPLE });
    expect(out).toMatch(/no answer/i);
  });

  test("requestAnswer without handler returns empty selections", async () => {
    const res = await requestAnswer(SAMPLE);
    expect(res).toEqual([[]]);
  });
});
