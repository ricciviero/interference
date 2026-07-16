import { generateText, Output } from "ai";
import { z } from "zod";
import type {
  AvailableSkill,
  SkillRouter,
  SkillRouterInput,
  TaskClassifier,
  TaskClassifierInput,
} from "@agenticswe/core";
import {
  cheapModelFor,
  currentProviderId,
  type ProviderId,
} from "../config.ts";
import { getPricing } from "../cost.ts";
import { resolveModel } from "../provider.ts";
import type { BehaviorSkillCandidate } from "./skills.ts";
import type { ClassifierTelemetry } from "./types.ts";

const MAX_SUMMARY_CHARACTERS = 8_000;

const classificationSchema = z.object({
  value: z.enum(["trivial", "non-trivial", "uncertain"]),
  reasons: z.array(z.string().min(1)).min(1).max(5),
  confidence: z.number().min(0).max(1),
  selectedSkills: z.array(z.string().min(1)).max(5),
  /** False restricts the host to read-only behavior; true never grants permission by itself. */
  mutationRequested: z.boolean().optional(),
  explicitOnboarding: z.boolean().optional(),
  explicitLighterProcess: z.boolean().optional(),
  lighterProcessReason: z.string().min(1).optional(),
});

type ClassificationOutput = z.infer<typeof classificationSchema>;

function estimateCost(
  provider: ProviderId,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = getPricing(model, provider);
  return (
    (inputTokens / 1_000_000) * pricing.inputPer1M +
    (outputTokens / 1_000_000) * pricing.outputPer1M
  );
}

/** One bounded structured call supplies both the TaskClassifier and SkillRouter ports. */
export class ModelBehaviorClassifier implements TaskClassifier, SkillRouter {
  readonly #skills: readonly BehaviorSkillCandidate[];
  readonly #telemetry = new Map<string, ClassifierTelemetry>();
  readonly #selectedSkills = new Map<string, string[]>();
  readonly #requestedSkills = new Map<string, string[]>();
  readonly #requestSignals = new Map<
    string,
    {
      explicitOnboarding: boolean;
      explicitLighterProcess: boolean;
      lighterProcessReason?: string;
      mutationRequested: boolean;
    }
  >();

  constructor(skills: readonly BehaviorSkillCandidate[]) {
    this.#skills = skills;
  }

  async classify(input: TaskClassifierInput, signal?: AbortSignal): Promise<unknown> {
    const provider = currentProviderId();
    const model = cheapModelFor(provider);
    const summary = input.summary.slice(0, MAX_SUMMARY_CHARACTERS);
    const startedAt = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const result = await generateText({
        model: await resolveModel({ provider, model, thinkingLevel: "low" }),
        abortSignal: signal,
        // One SDK retry absorbs a transient provider/schema failure while the
        // Agentic SWE port timeout still bounds the entire shadow operation.
        maxRetries: 1,
        temperature: 0,
        maxOutputTokens: 700,
        output: Output.object({ schema: classificationSchema }),
        system:
          "Classify a software-engineering request for a workflow engine. " +
          "Trivial requires all of: localized, mechanically clear, no behavior or contract change, " +
          "and no sequencing decision. Non-trivial applies when any of these holds: multiple " +
          "deliverables, cross-layer behavior, migration, refactor, deployment, security, unclear " +
          "scope, or trade-offs. Use uncertain when evidence is insufficient. Select only skill " +
          "names from the supplied approved catalog. Set mutationRequested=false for questions, " +
          "explanations, reviews, status checks, and any request that explicitly says not to change " +
          "files or call tools. Set it true only when the user asks to create, change, fix, migrate, " +
          "deploy, or otherwise mutate something. Return structured data only.",
        prompt: JSON.stringify({
          request: summary,
          approvedSkills: this.#skills.map(({ name, description }) => ({ name, description })),
        }),
      });
      const output: ClassificationOutput = result.output;
      inputTokens = result.usage.inputTokens ?? 0;
      outputTokens = result.usage.outputTokens ?? 0;
      this.#selectedSkills.set(input.requestId, [...new Set(output.selectedSkills)]);
      this.#requestSignals.set(input.requestId, {
        explicitOnboarding: output.explicitOnboarding ?? false,
        explicitLighterProcess: output.explicitLighterProcess ?? false,
        mutationRequested: output.mutationRequested ?? true,
        ...(output.lighterProcessReason
          ? { lighterProcessReason: output.lighterProcessReason }
          : {}),
      });
      this.#telemetry.set(input.requestId, {
        requestId: input.requestId,
        provider,
        model,
        durationMs: Date.now() - startedAt,
        inputTokens,
        outputTokens,
        estimatedCostUsd: estimateCost(provider, model, inputTokens, outputTokens),
        summaryCharacters: summary.length,
        truncated: summary.length !== input.summary.length,
        outcome: "success",
      });
      return output;
    } catch (error) {
      const aborted = signal?.aborted || (error instanceof Error && error.name === "AbortError");
      this.#telemetry.set(input.requestId, {
        requestId: input.requestId,
        provider,
        model,
        durationMs: Date.now() - startedAt,
        inputTokens,
        outputTokens,
        estimatedCostUsd: estimateCost(provider, model, inputTokens, outputTokens),
        summaryCharacters: summary.length,
        truncated: summary.length !== input.summary.length,
        outcome: aborted ? "aborted" : "error",
      });
      throw error;
    }
  }

  async select(
    input: SkillRouterInput,
    candidates: readonly AvailableSkill[],
    _signal?: AbortSignal,
  ): Promise<unknown> {
    const approved = new Set(candidates.filter((candidate) => candidate.selected).map((candidate) => candidate.name));
    return [
      ...new Set([
        ...(this.#requestedSkills.get(input.requestId) ?? []),
        ...(this.#selectedSkills.get(input.requestId) ?? []),
      ]),
    ].filter((name) => approved.has(name));
  }

  setRequestedSkills(requestId: string, names: readonly string[]): void {
    this.#requestedSkills.set(requestId, [...new Set(names)]);
  }

  takeTelemetry(requestId: string): ClassifierTelemetry | undefined {
    const telemetry = this.#telemetry.get(requestId);
    this.#telemetry.delete(requestId);
    this.#selectedSkills.delete(requestId);
    this.#requestedSkills.delete(requestId);
    return telemetry;
  }

  takeRequestSignals(requestId: string) {
    const signals = this.#requestSignals.get(requestId);
    this.#requestSignals.delete(requestId);
    return signals;
  }
}

/** Deterministic port used by the shadow corpus and failure-path tests. */
export class FakeBehaviorClassifier implements TaskClassifier, SkillRouter {
  constructor(
    private readonly output: ClassificationOutput,
    private readonly failure?: Error,
  ) {}

  async classify(_input: TaskClassifierInput, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (this.failure) throw this.failure;
    return this.output;
  }

  async select(
    _input: SkillRouterInput,
    candidates: readonly AvailableSkill[],
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const approved = new Set(candidates.map((candidate) => candidate.name));
    return this.output.selectedSkills.filter((name) => approved.has(name));
  }

  takeRequestSignals(_requestId: string) {
    return {
      explicitOnboarding: this.output.explicitOnboarding ?? false,
      explicitLighterProcess: this.output.explicitLighterProcess ?? false,
      mutationRequested: this.output.mutationRequested ?? true,
      ...(this.output.lighterProcessReason
        ? { lighterProcessReason: this.output.lighterProcessReason }
        : {}),
    };
  }
}
