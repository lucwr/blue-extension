/**
 * In-popup PDF generation. Renderer for resume JSON in text mode.
 *
 *   ┌──────────────────┐     ┌──────────────────────┐     ┌──────────┐
 *   │  Content layer   │     │   Template layer     │     │  jsPDF   │
 *   │  (ResumeJson)    │ ──► │   (ResumeTemplate)   │ ──► │  output  │
 *   │  dynamic data    │     │   FROZEN visual spec │     │          │
 *   └──────────────────┘     └──────────────────────┘     └──────────┘
 *
 * Strict layer rules enforced in this file:
 *
 *   1. ZERO magic numbers. Every visual distance, font size, font weight,
 *      separator, indent, line width, and uppercase rule comes from
 *      `template.*`. Search this file for a number literal — there should
 *      be none in the rendering logic (only structural constants like 0,
 *      cursor.y arithmetic operations, and array indices).
 *   2. The renderer never picks a font or font-size; it calls `applyStyle`
 *      with a `template.styles.<role>` value.
 *   3. The renderer never decides spacing; it advances `cursor.y` by a
 *      `template.spacing.<name>` value.
 *   4. The content layer (ResumeJson) is purely data — no rendering hints.
 *
 *   To change how a generated resume LOOKS, edit `atsTemplate.ts`. Do not
 *   modify this file for visual changes.
 *
 *   The PDF is text-mode (selectable text, ATS-readable). The rendered
 *   PDF is deterministic given the same (template, content) pair.
 */
import { jsPDF } from 'jspdf';
import { ATS_TEMPLATE, type ResumeTemplate, type TextStyle } from '@/templates/atsTemplate';
import type { ResumeJson, ResumeSkills } from '@/types/resume';
import { createLogger } from '@/utils/logger';

const log = createLogger('pdf');

interface DownloadOptions {
  filename?: string;
}

interface Cursor {
  y: number;
}

// Friendly labels for our seven skill buckets. Order is the display order.
// (These are content-layer labels, not template choices — they map the
//  schema's bucket names to the words shown in the rendered resume.)
const SKILL_BUCKET_LABELS: ReadonlyArray<readonly [keyof ResumeSkills, string]> = [
  ['languages', 'Languages'],
  ['frontend', 'Frontend'],
  ['backend', 'Backend'],
  ['cloud', 'Cloud & DevOps'],
  ['databases', 'Databases'],
  ['testing', 'Testing'],
  ['tools', 'Tools & Workflows'],
];

// ----- low-level template-driven primitives -----

/** Apply one of the template's text styles to the current jsPDF context. */
function applyStyle(pdf: jsPDF, style: TextStyle): void {
  pdf.setFont(style.family, style.weight);
  pdf.setFontSize(style.size);
}

/** Advance the page if `needed` inches would overflow the bottom margin. */
function ensureSpace(pdf: jsPDF, t: ResumeTemplate, c: Cursor, needed: number): void {
  if (c.y + needed > t.page.height - t.page.marginBottom) {
    pdf.addPage();
    c.y = t.page.marginTop;
  }
}

/** Width of the content area (page width minus side margins). */
function contentWidth(t: ResumeTemplate): number {
  return t.page.width - 2 * t.page.marginX;
}

/** Wrap `text` to `width`, advance the cursor by `lineHeight` per line. */
function writeWrapped(
  pdf: jsPDF,
  t: ResumeTemplate,
  c: Cursor,
  text: string,
  startX: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const lines = pdf.splitTextToSize(text, maxWidth) as string[];
  for (const line of lines) {
    ensureSpace(pdf, t, c, lineHeight);
    pdf.text(line, startX, c.y);
    c.y += lineHeight;
  }
}

/** Render a section heading: bold text + horizontal rule. Purely template-driven. */
function renderSectionHeading(pdf: jsPDF, t: ResumeTemplate, c: Cursor, text: string): void {
  ensureSpace(pdf, t, c, t.spacing.beforeSectionGuard);
  c.y += t.spacing.beforeSectionHeading;
  applyStyle(pdf, t.styles.sectionHeading);
  const displayed = t.rules.sectionHeadingUppercase ? text.toUpperCase() : text;
  pdf.text(displayed, t.page.marginX, c.y);
  c.y += t.spacing.sectionTextToRule;
  pdf.setLineWidth(t.sectionRule.lineWidth);
  pdf.line(t.page.marginX, c.y, t.page.width - t.page.marginX, c.y);
  c.y += t.spacing.afterSectionRule;
}

// ----- section renderers (each takes template + content + cursor) -----

function renderHeader(pdf: jsPDF, t: ResumeTemplate, c: Cursor, resume: ResumeJson): void {
  const { contact, targetTitle } = resume;

  // Name — centered, drops by the template's first-baseline value.
  applyStyle(pdf, t.styles.name);
  c.y += t.spacing.headerFirstBaseline;
  pdf.text(contact.fullName, t.page.width / 2, c.y, { align: 'center' });
  c.y += t.spacing.afterName;

  // Target title — centered.
  applyStyle(pdf, t.styles.targetTitle);
  pdf.text(targetTitle, t.page.width / 2, c.y, { align: 'center' });
  c.y += t.spacing.afterTitle;

  // Contact — centered, joined with the template's separator.
  const bits = [
    contact.email,
    contact.location,
    contact.phone,
    contact.linkedin,
    contact.github,
    contact.website,
  ].filter((s): s is string => Boolean(s));

  if (bits.length > 0) {
    applyStyle(pdf, t.styles.contact);
    pdf.text(bits.join(t.separators.contactJoin), t.page.width / 2, c.y, { align: 'center' });
    c.y += t.spacing.afterContact;
  }
}

function renderSummary(pdf: jsPDF, t: ResumeTemplate, c: Cursor, summary: string): void {
  renderSectionHeading(pdf, t, c, 'Summary');
  applyStyle(pdf, t.styles.body);
  writeWrapped(pdf, t, c, summary, t.page.marginX, contentWidth(t), t.spacing.bodyLineHeight);
}

function renderBulletList(
  pdf: jsPDF,
  t: ResumeTemplate,
  c: Cursor,
  bullets: readonly string[],
): void {
  applyStyle(pdf, t.styles.bullet);
  const startX = t.page.marginX + t.indents.bullet;
  const maxWidth = contentWidth(t) - t.indents.bulletInsetRight;
  for (const bullet of bullets) {
    const lines = pdf.splitTextToSize(bullet, maxWidth) as string[];
    for (let i = 0; i < lines.length; i++) {
      ensureSpace(pdf, t, c, t.spacing.bodyLineHeight);
      const prefix = i === 0 ? t.separators.bulletPrefix : t.separators.bulletContinuation;
      pdf.text(`${prefix}${lines[i] ?? ''}`, startX, c.y);
      c.y += t.spacing.bodyLineHeight;
    }
  }
}

function renderExperience(
  pdf: jsPDF,
  t: ResumeTemplate,
  c: Cursor,
  experience: ResumeJson['experience'],
): void {
  if (experience.length === 0) return;
  renderSectionHeading(pdf, t, c, 'Work Experience');

  for (const role of experience) {
    ensureSpace(pdf, t, c, t.spacing.beforeSectionGuard);

    // Role header line: bold company + italic role on the left, date on the right.
    applyStyle(pdf, t.styles.company);
    pdf.text(role.company, t.page.marginX, c.y);
    const companyW = pdf.getTextWidth(role.company);

    applyStyle(pdf, t.styles.role);
    pdf.text(`${t.separators.companyRoleJoin}${role.title}`, t.page.marginX + companyW, c.y);

    applyStyle(pdf, t.styles.date);
    pdf.text(
      `${role.startDate}${t.separators.dateRange}${role.endDate}`,
      t.page.width - t.page.marginX,
      c.y,
      { align: 'right' },
    );
    c.y += t.spacing.afterRoleHeader;

    // Optional location line (italic, right-aligned).
    if (role.location) {
      applyStyle(pdf, t.styles.location);
      pdf.text(role.location, t.page.width - t.page.marginX, c.y, { align: 'right' });
      c.y += t.spacing.afterLocation;
    } else {
      c.y += t.spacing.afterRoleHeaderNoLocation;
    }

    renderBulletList(pdf, t, c, role.bullets);
    c.y += t.spacing.betweenRoles;
  }
}

function renderProjects(
  pdf: jsPDF,
  t: ResumeTemplate,
  c: Cursor,
  projects: ResumeJson['projects'],
): void {
  if (projects.length === 0) return;
  renderSectionHeading(pdf, t, c, 'Projects');

  for (const p of projects) {
    ensureSpace(pdf, t, c, t.spacing.beforeSectionGuard);

    // Project name + optional link.
    applyStyle(pdf, t.styles.projectName);
    pdf.text(p.name, t.page.marginX, c.y);
    if (p.link) {
      const nameW = pdf.getTextWidth(p.name);
      applyStyle(pdf, t.styles.projectLink);
      pdf.text(` — ${p.link}`, t.page.marginX + nameW, c.y);
    }
    c.y += t.spacing.afterProjectHeader;

    if (p.description) {
      applyStyle(pdf, t.styles.body);
      writeWrapped(pdf, t, c, p.description, t.page.marginX, contentWidth(t), t.spacing.bodyLineHeight);
    }

    if (p.technologies.length > 0) {
      applyStyle(pdf, t.styles.projectStack);
      writeWrapped(
        pdf,
        t,
        c,
        `Stack: ${p.technologies.join(', ')}`,
        t.page.marginX,
        contentWidth(t),
        t.spacing.smallLineHeight,
      );
    }

    if (p.bullets.length > 0) renderBulletList(pdf, t, c, p.bullets);
    c.y += t.spacing.betweenProjects;
  }
}

function renderEducation(
  pdf: jsPDF,
  t: ResumeTemplate,
  c: Cursor,
  education: ResumeJson['education'],
): void {
  if (education.length === 0) return;
  renderSectionHeading(pdf, t, c, 'Education');

  for (const e of education) {
    ensureSpace(pdf, t, c, t.spacing.afterRoleHeader);

    applyStyle(pdf, t.styles.institution);
    pdf.text(e.institution, t.page.marginX, c.y);
    const instW = pdf.getTextWidth(e.institution);

    applyStyle(pdf, t.styles.degree);
    const degreeText = `${t.separators.institutionDegreeJoin}${e.degree}${e.field ? `, ${e.field}` : ''}`;
    pdf.text(degreeText, t.page.marginX + instW, c.y);

    const hasDate = Boolean(e.startDate ?? e.endDate);
    if (hasDate) {
      applyStyle(pdf, t.styles.date);
      const dateText = `${e.startDate ?? ''}${
        e.startDate && e.endDate ? t.separators.educationDateRange : ''
      }${e.endDate ?? ''}`;
      pdf.text(dateText, t.page.width - t.page.marginX, c.y, { align: 'right' });
    }
    c.y += t.spacing.betweenEducationEntries;
  }
}

function renderSkillRow(
  pdf: jsPDF,
  t: ResumeTemplate,
  c: Cursor,
  label: string,
  items: readonly string[],
): void {
  applyStyle(pdf, t.styles.skillLabel);
  pdf.text(label, t.page.marginX, c.y);
  const labelW = pdf.getTextWidth(label);

  applyStyle(pdf, t.styles.skillItems);
  const tail = ` (${items.join(', ')})`;
  const lines = pdf.splitTextToSize(tail, contentWidth(t) - labelW) as string[];
  for (let i = 0; i < lines.length; i++) {
    if (i === 0) {
      pdf.text(lines[i] ?? '', t.page.marginX + labelW, c.y);
    } else {
      ensureSpace(pdf, t, c, t.spacing.bodyLineHeight);
      c.y += t.spacing.bodyLineHeight;
      pdf.text(lines[i] ?? '', t.page.marginX, c.y);
    }
  }
  c.y += t.spacing.betweenSkillRows;
}

/**
 * Estimate the height in inches the entire Skills section will consume.
 *
 * Uses jsPDF's real text-measurement (splitTextToSize) for each skill row so
 * the estimate is accurate to within one line height. Used by `renderSkills`
 * when `template.rules.keepSkillsOnOnePage` is true to decide whether to
 * page-break BEFORE starting the section.
 */
function estimateSkillsHeight(
  pdf: jsPDF,
  t: ResumeTemplate,
  rows: ReadonlyArray<{ label: string; items: readonly string[] }>,
): number {
  // Section heading area: pre-gap + heading line + rule + post-gap.
  let height =
    t.spacing.beforeSectionHeading +
    t.spacing.bodyLineHeight +
    t.spacing.sectionTextToRule +
    t.spacing.afterSectionRule;

  // Each row: measure label width with skillLabel style, then split the
  // " (item1, item2, ...)" tail at skillItems style and accumulate.
  const innerWidth = contentWidth(t);
  for (const row of rows) {
    applyStyle(pdf, t.styles.skillLabel);
    const labelW = pdf.getTextWidth(row.label);
    applyStyle(pdf, t.styles.skillItems);
    const tail = ` (${row.items.join(', ')})`;
    const lines = pdf.splitTextToSize(tail, innerWidth - labelW) as string[];
    height += lines.length * t.spacing.bodyLineHeight + t.spacing.betweenSkillRows;
  }

  return height;
}

function renderSkills(pdf: jsPDF, t: ResumeTemplate, c: Cursor, resume: ResumeJson): void {
  const rows: Array<{ label: string; items: readonly string[] }> = [];
  for (const [key, label] of SKILL_BUCKET_LABELS) {
    if (resume.skills[key].length === 0) continue;
    rows.push({ label, items: resume.skills[key] });
  }
  for (const extra of resume.extras) {
    if (extra.items.length === 0) continue;
    rows.push({ label: extra.heading, items: extra.items });
  }
  if (rows.length === 0) return;

  // Template rule: keep the whole Skills section on a single page.
  // If it won't fit on the current page, start a fresh page first.
  if (t.rules.keepSkillsOnOnePage) {
    const needed = estimateSkillsHeight(pdf, t, rows);
    const remaining = t.page.height - t.page.marginBottom - c.y;
    if (needed > remaining) {
      pdf.addPage();
      c.y = t.page.marginTop;
    }
  }

  renderSectionHeading(pdf, t, c, 'Skills');
  for (const row of rows) {
    renderSkillRow(pdf, t, c, row.label, row.items);
  }
}

function renderCertifications(
  pdf: jsPDF,
  t: ResumeTemplate,
  c: Cursor,
  certs: ResumeJson['certifications'],
): void {
  if (certs.length === 0) return;
  renderSectionHeading(pdf, t, c, 'Certifications');
  // Use the same bullet-list renderer for consistency — certs are just bullets.
  renderBulletList(
    pdf,
    t,
    c,
    certs.map((cert) =>
      cert.date
        ? `${cert.name} — ${cert.issuer} (${cert.date})`
        : `${cert.name} — ${cert.issuer}`,
    ),
  );
}

// ----- public surface -----

function sanitizeFilename(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

/**
 * Render `resume` into a PDF using `template`. Pure function over the two
 * layers — same inputs produce byte-identical output.
 */
export function renderResumeToPdf(resume: ResumeJson, template: ResumeTemplate): jsPDF {
  const pdf = new jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait' });
  const cursor: Cursor = { y: template.page.marginTop };

  renderHeader(pdf, template, cursor, resume);
  if (resume.summary) renderSummary(pdf, template, cursor, resume.summary);
  renderExperience(pdf, template, cursor, resume.experience);
  renderProjects(pdf, template, cursor, resume.projects);
  renderEducation(pdf, template, cursor, resume.education);
  renderSkills(pdf, template, cursor, resume);
  renderCertifications(pdf, template, cursor, resume.certifications);

  return pdf;
}

export async function downloadResumePdf(
  resume: ResumeJson,
  options: DownloadOptions = {},
): Promise<void> {
  const filename =
    options.filename ??
    `${sanitizeFilename(resume.contact.fullName)}_${sanitizeFilename(resume.targetTitle)}.pdf`;

  log.info('rendering PDF', { filename });

  const pdf = renderResumeToPdf(resume, ATS_TEMPLATE);
  pdf.save(filename);

  log.info('PDF downloaded', { filename, pages: pdf.getNumberOfPages() });
}
