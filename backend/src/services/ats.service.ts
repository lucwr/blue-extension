/**
 * Deterministic post-processor for AI-generated resumes.
 *
 * Previously this layer also reordered skill buckets by JD priority, but
 * the analysis pre-pass that drove that has been removed — the resume prompt
 * now tells the model to prioritize JD-required skills first inside each
 * bucket itself. What remains here is the parts the model can't reliably do:
 *
 *   1. Deduplicate skill entries (case-insensitive) — defends against
 *      "TypeScript" + "typescript" appearing in the same bucket.
 *   2. Stamp `meta.schemaVersion`, `meta.templateId`, and `meta.generatedAt`
 *      so they're always correct regardless of what the model emitted.
 */
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

function dedupeSkills(skills: ResumeSkills): ResumeSkills {
  return {
    languages: dedupePreservingOrder(skills.languages),
    frontend: dedupePreservingOrder(skills.frontend),
    backend: dedupePreservingOrder(skills.backend),
    cloud: dedupePreservingOrder(skills.cloud),
    databases: dedupePreservingOrder(skills.databases),
    testing: dedupePreservingOrder(skills.testing),
    tools: dedupePreservingOrder(skills.tools),
  };
}

export function applyAtsRules(resume: ResumeJson, templateId: string): ResumeJson {
  return {
    ...resume,
    meta: {
      ...resume.meta,
      schemaVersion: RESUME_SCHEMA_VERSION,
      templateId,
      generatedAt: new Date().toISOString(),
    },
    skills: dedupeSkills(resume.skills),
  };
}
