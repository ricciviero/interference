import type { BehaviorPlan, Capability } from "@agenticswe/core";

const PHASE_ACTIONS: Record<BehaviorPlan["phase"], string> = {
  discovery: "Inspect the repository and applicable instructions.",
  classification: "Clarify and classify the current request.",
  setup: "Complete only the required repository setup artifacts.",
  planning: "Create or reconcile the configured local planning record.",
  execution: "Implement the approved scope and keep the planning record current.",
  verification: "Validate the changed surface and collect concrete evidence.",
  completion: "Report completion evidence, assumptions, and unresolved blockers.",
  blocked: "Explain the incompatibility or blocker; do not mutate the workspace.",
  aborted: "Stop work because the turn was aborted.",
};

export function renderBehaviorPlan(
  plan: BehaviorPlan,
  effectiveCapabilities: readonly Capability[],
): string {
  const gates = plan.requiredGates
    .map((gate) => `${gate.id}=${gate.status} (${gate.reasonCode})`)
    .join(", ");
  const skills = plan.selectedSkills.map((skill) => skill.name).join(", ") || "none";
  const hardCriteria = plan.completionCriteria
    .filter((criterion) => criterion.hard)
    .map((criterion) => `${criterion.id}=${criterion.status}`)
    .join(", ");
  const capabilities = effectiveCapabilities.join(", ") || "none";
  const phaseAction =
    plan.phase === "execution" &&
    !effectiveCapabilities.some((capability) =>
      ["workspace:mutate", "commands:execute", "subagents:invoke", "external:mutate"].includes(
        capability,
      ),
    )
      ? "Answer or analyze the request within the available read-only capabilities."
      : PHASE_ACTIONS[plan.phase];

  return `<agentic_swe_behavior protocol="${plan.protocolVersion}" request="${plan.requestId}">
Phase: ${plan.phase}
Classification: ${plan.effectiveClassification}
Required action: ${phaseAction}
Gates: ${gates}
Selected skills: ${skills}
Effective capabilities: ${capabilities}
Hard completion criteria: ${hardCriteria}
Can complete: ${plan.canComplete ? "yes" : "no"}

Work only within this phase and the tools exposed by the host. A successful tool call is not
evidence that another gate is satisfied. Do not claim completion while Can complete is no.
</agentic_swe_behavior>`;
}
