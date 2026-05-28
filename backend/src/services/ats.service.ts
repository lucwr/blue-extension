/**
 * Lightweight, deterministic ATS post-processor for AI-generated resumes.
 *
 * The AI does the heavy keyword work; this layer enforces hard rules the
 * model occasionally violates:
 *   1. Deduplicate skill entries (case-insensitive).
 *   2. Sort each skill array so JD-required skills appear first.
 *   3. Stamp `meta.schemaVersion` and `meta.generatedAt` regardless of what
 *      the model emitted (defense in depth — Zod allows the field to drift).
 */
import type { AnalyzedJd } from '../schemas/jd.schema.js';
import { RESUME_SCHEMA_VERSION, type ResumeJson, type ResumeSkills } from '../schemas/resume.schema.js';

function dedupePreservingOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v.trim());
  }
  return out;
}

function reorderByPriority(skills: readonly string[], priority: readonly string[]): string[] {
  const prioritySet = new Set(priority.map((p) => p.toLowerCase()));
  const priorityHits: string[] = [];
  const rest: string[] = [];
  for (const skill of skills) {
    if (prioritySet.has(skill.toLowerCase())) priorityHits.push(skill);
    else rest.push(skill);
  }
  return [...priorityHits, ...rest];
}

function postProcessSkills(skills: ResumeSkills, priority: readonly string[]): ResumeSkills {
  const bucket = (arr: readonly string[]): string[] =>
    reorderByPriority(dedupePreservingOrder(arr), priority);
  return {
    languages: bucket(skills.languages),
    frontend: bucket(skills.frontend),
    backend: bucket(skills.backend),
    cloud: bucket(skills.cloud),
    databases: bucket(skills.databases),
    testing: bucket(skills.testing),
    tools: bucket(skills.tools),
  };
}

export function applyAtsRules(resume: ResumeJson, analysis: AnalyzedJd, templateId: string): ResumeJson {
  const priority = [
    ...analysis.requiredSkills,
    ...analysis.preferredSkills,
    ...analysis.frameworks,
    ...analysis.cloud,
    ...analysis.databases,
    ...analysis.testing,
  ];

  return {
    ...resume,
    meta: {
      ...resume.meta,
      schemaVersion: RESUME_SCHEMA_VERSION,
      templateId,
      generatedAt: new Date().toISOString(),
    },
    skills: postProcessSkills(resume.skills, priority),
  };
}
