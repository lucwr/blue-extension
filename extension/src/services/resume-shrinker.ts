/**
 * Progressive resume content shrinker.
 *
 * Given a resume that's rendered too long, produce a content-trimmed copy
 * that fits in fewer pages. Each shrink "level" applies progressively more
 * aggressive cuts. Trimming priority (from least painful to most):
 *
 *   1. Cap extras items per bucket  (least visible — these are tail items)
 *   2. Cap older-role bullets       (older roles are less load-bearing)
 *   3. Cap project bullets           (project description carries the gist)
 *   4. Cap recent-role bullets       (load-bearing — only cut later)
 *   5. Truncate summary              (last resort — summary is high signal)
 *   6. Drop projects entirely        (only at extreme shrink levels)
 *   7. Drop the oldest role(s)       (emergency only)
 *
 * Truth-preserving: never invents content. Trimming only — companies,
 * dates, and the candidate's identity are never altered. The first role
 * (most recent) always keeps at least 4 bullets so the resume still
 * carries the candidate's primary signal.
 *
 * Schema-safe: every produced shape stays within the backend's Zod limits
 * (bullets[].min(1), summary.min(40), etc.).
 */
import type { ResumeJson } from '@/types/resume';

interface ShrinkLevel {
  /** Max items per extras entry (Soft Skills / AI/ML / Security / etc.). */
  extrasItems: number;
  /** Max bullets on the MOST RECENT role. */
  recentBullets: number;
  /** Max bullets on every other role. */
  olderBullets: number;
  /** Max bullets per project. */
  projectBullets: number;
  /** Max number of projects shown (extras dropped from the tail). */
  maxProjects: number;
  /** Max number of experience entries — oldest dropped first. */
  maxExperience: number;
  /** Soft cap on summary character count (preserves sentence boundaries). */
  summaryMaxChars: number;
}

// Level 0 = no shrinking (passthrough). Levels 1..6 progressively aggressive.
const LEVELS: readonly ShrinkLevel[] = [
  // 0 — passthrough
  { extrasItems: 999, recentBullets: 999, olderBullets: 999, projectBullets: 999, maxProjects: 999, maxExperience: 999, summaryMaxChars: 999_999 },
  // 1 — gentle: cap extras tail
  { extrasItems: 14,  recentBullets: 8,   olderBullets: 5,   projectBullets: 3,   maxProjects: 8,   maxExperience: 999, summaryMaxChars: 700 },
  // 2 — trim older roles + extras
  { extrasItems: 10,  recentBullets: 7,   olderBullets: 4,   projectBullets: 2,   maxProjects: 6,   maxExperience: 999, summaryMaxChars: 600 },
  // 3 — start trimming recent role too
  { extrasItems: 8,   recentBullets: 6,   olderBullets: 3,   projectBullets: 2,   maxProjects: 4,   maxExperience: 999, summaryMaxChars: 500 },
  // 4 — heavier cuts; drop projects' bullets, cap older harder
  { extrasItems: 6,   recentBullets: 5,   olderBullets: 3,   projectBullets: 1,   maxProjects: 3,   maxExperience: 999, summaryMaxChars: 450 },
  // 5 — drop projects' bullets entirely, drop oldest role if 5+ roles
  { extrasItems: 5,   recentBullets: 5,   olderBullets: 2,   projectBullets: 0,   maxProjects: 2,   maxExperience: 5,   summaryMaxChars: 400 },
  // 6 — emergency: drop projects + tail of experience, tight everything
  { extrasItems: 4,   recentBullets: 4,   olderBullets: 2,   projectBullets: 0,   maxProjects: 0,   maxExperience: 4,   summaryMaxChars: 350 },
];

export const MAX_SHRINK_LEVEL = LEVELS.length - 1;

/**
 * Truncate `summary` to ~`maxChars` characters, preferring to cut on a
 * sentence boundary. Keeps the summary above the schema's 40-char minimum.
 */
function truncateSummary(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  const cut = s.slice(0, maxChars);
  const lastSentence = cut.lastIndexOf('. ');
  if (lastSentence > maxChars * 0.55) {
    return cut.slice(0, lastSentence + 1).trim();
  }
  return cut.trimEnd().replace(/[,;:]$/, '') + '…';
}

/**
 * Apply shrink at `level` (0..MAX_SHRINK_LEVEL). Always idempotent against
 * the original — calling `shrinkResume(r, k)` repeatedly produces the same
 * result. To escalate, call with a higher level.
 */
export function shrinkResume(resume: ResumeJson, level: number): ResumeJson {
  const clamped = Math.max(0, Math.min(level, LEVELS.length - 1));
  const p = LEVELS[clamped] as ShrinkLevel;

  return {
    ...resume,
    summary: truncateSummary(resume.summary, p.summaryMaxChars),
    experience: resume.experience.slice(0, p.maxExperience).map((role, i) => ({
      ...role,
      bullets: role.bullets.slice(0, i === 0 ? p.recentBullets : p.olderBullets),
    })),
    projects: resume.projects.slice(0, p.maxProjects).map((proj) => ({
      ...proj,
      bullets: proj.bullets.slice(0, p.projectBullets),
    })),
    extras: resume.extras.map((extra) => ({
      ...extra,
      items: extra.items.slice(0, p.extrasItems),
    })),
  };
}
