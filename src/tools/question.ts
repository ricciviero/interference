import { tool } from "ai";
import { z } from "zod";

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionSpec {
  question: string;
  header?: string;
  options: QuestionOption[];
  multiple?: boolean;
}

// Risposta: per ogni domanda, le label selezionate (più di una se multiple).
export type Answers = string[][];

// Meccanismo EVENT-DRIVEN (come requestConfirmation in permissions.ts):
// la UI registra un handler con setAnswerHandler; il tool, dentro execute, chiama
// requestAnswer e ne attende l'esito. Senza handler (test/headless) si usa il fallback.
export type AnswerHandler = (questions: QuestionSpec[]) => Promise<Answers>;

let answerHandler: AnswerHandler | null = null;

export function setAnswerHandler(handler: AnswerHandler | null): void {
  answerHandler = handler;
}

export async function requestAnswer(questions: QuestionSpec[]): Promise<Answers> {
  if (answerHandler) return answerHandler(questions);
  // Fallback senza UI: nessuna risposta (l'agente prosegue con cautela).
  return questions.map(() => []);
}

export const question = tool({
  description:
    "Ask the user one or more questions during execution instead of guessing on ambiguous choices. " +
    "Each question offers a list of options the user picks from (single or multiple choice). " +
    "Use sparingly, only for decisions that genuinely change the outcome and that you cannot resolve " +
    "from the request, the code, or sensible defaults. Execution pauses until the user answers.",
  inputSchema: z.object({
    questions: z
      .array(
        z.object({
          question: z.string().min(1).describe("The full question to ask the user"),
          header: z
            .string()
            .optional()
            .describe("Very short label/chip for the question (e.g. 'Auth method')"),
          options: z
            .array(
              z.object({
                label: z.string().min(1).describe("Short choice text shown to the user"),
                description: z
                  .string()
                  .optional()
                  .describe("Optional explanation of what this option means"),
              }),
            )
            .min(2)
            .describe("The available choices (at least 2, mutually exclusive unless multiple)"),
          multiple: z
            .boolean()
            .optional()
            .describe("Allow selecting more than one option (default false)"),
        }),
      )
      .min(1)
      .describe("The questions to ask (1 or more)"),
  }),
  execute: async ({ questions }) => {
    const answers = await requestAnswer(questions);
    const lines = questions.map((q, i) => {
      const sel = answers[i] ?? [];
      const a = sel.length > 0 ? sel.join(", ") : "(no answer — proceed with best judgment)";
      return `Q: ${q.question}\nA: ${a}`;
    });
    return lines.join("\n\n");
  },
});
