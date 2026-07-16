import type { AvailableSkill } from "@agenticswe/core";
import { getCachedRegistry, skillsDir, type SkillInfo } from "../skills.ts";

export interface BehaviorSkillCandidate extends SkillInfo {
  source: AvailableSkill["source"];
}

/**
 * Interference owns discovery and skill bodies. Agentic SWE receives only the
 * approved metadata needed to route names; it never duplicates the host loader.
 */
export function behaviorSkillCandidates(): BehaviorSkillCandidate[] {
  return getCachedRegistry().map((skill) => ({ ...skill, source: "global" }));
}

export function behaviorGlobalSkillDirectories(): string[] {
  return [skillsDir()];
}
