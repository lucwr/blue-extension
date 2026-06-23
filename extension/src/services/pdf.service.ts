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
import type { ProposalJson } from '@/types/proposal';
import type { ResumeJson, ResumeSkills } from '@/types/resume';
import { createLogger } from '@/utils/logger';
import { MAX_SHRINK_LEVEL, shrinkResume } from './resume-shrinker';

const log = createLogger('pdf');

/** Hard cap on rendered PDF pages. Resumes exceeding this are content-trimmed
 *  by the shrinker until they fit or the maximum shrink level is reached. */
const MAX_PAGES_DEFAULT = 3;

interface DownloadOptions {
  filename?: string;
  /** Override the maximum page count (defaults to MAX_PAGES_DEFAULT). */
  maxPages?: number;
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

/**
 * Wrap `text` to `width`, advance the cursor by `lineHeight` per line.
 *
 * When `template.rules.justifyBodyText` is true, every non-final wrapped
 * line is rendered with `align: 'justify'` + `maxWidth`, stretching inter-
 * word spacing so the line reaches the right edge. The final line of each
 * paragraph stays left-aligned (standard typographic behavior).
 *
 * IMPORTANT: the wrapped lines from `splitTextToSize(text, maxWidth)`
 * already fit inside maxWidth, so passing `align: 'justify'` + the same
 * `maxWidth` does NOT cause jsPDF to internally re-wrap. (The bullet path
 * has to be more careful — see `renderBulletList`.)
 */
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
  const justify = t.rules.justifyBodyText;
  for (let i = 0; i < lines.length; i++) {
    ensureSpace(pdf, t, c, lineHeight);
    const isLast = i === lines.length - 1;
    if (justify && !isLast) {
      pdf.text(lines[i] ?? '', startX, c.y, { align: 'justify', maxWidth });
    } else {
      pdf.text(lines[i] ?? '', startX, c.y);
    }
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

  // Contact — centered. Per spec, only email, address, and LinkedIn appear.
  // Phone, GitHub, and personal website are intentionally omitted. The
  // `contact.location` field carries the address.
  const bits = [contact.email, contact.location, contact.linkedin].filter(
    (s): s is string => Boolean(s),
  );

  if (bits.length > 0) {
    applyStyle(pdf, t.styles.contact);
    const sep = t.separators.contactJoin;
    const fullLine = bits.join(sep);
    const availableWidth = t.page.width - 2 * t.page.marginX;

    if (pdf.getTextWidth(fullLine) <= availableWidth) {
      // Single line — render as before.
      pdf.text(fullLine, t.page.width / 2, c.y, { align: 'center' });
      c.y += t.spacing.afterContact;
    } else {
      // Overflow — split the bits into two centered lines, balanced by
      // measured width so the wrap point falls at a natural separator.
      // Try every split point i in [1, bits.length-1] and pick the one
      // where the longer of the two halves is shortest (most balanced),
      // tie-breaking by preferring the smaller first half (keeps email
      // on its own line when it fits).
      let bestSplit = Math.ceil(bits.length / 2);
      let bestMaxWidth = Infinity;
      for (let i = 1; i < bits.length; i += 1) {
        const top = bits.slice(0, i).join(sep);
        const bot = bits.slice(i).join(sep);
        const topW = pdf.getTextWidth(top);
        const botW = pdf.getTextWidth(bot);
        const maxW = Math.max(topW, botW);
        if (maxW < bestMaxWidth) {
          bestMaxWidth = maxW;
          bestSplit = i;
        }
      }
      const topLine = bits.slice(0, bestSplit).join(sep);
      const botLine = bits.slice(bestSplit).join(sep);
      pdf.text(topLine, t.page.width / 2, c.y, { align: 'center' });
      c.y += t.spacing.bodyLineHeight;
      pdf.text(botLine, t.page.width / 2, c.y, { align: 'center' });
      c.y += t.spacing.afterContact;
    }
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
  const totalMaxWidth = contentWidth(t) - t.indents.bulletInsetRight;
  const justify = t.rules.justifyBodyText;

  // Measure the bullet prefix and reserve that much width on the left of
  // every line. The continuation indent is sized to match the prefix so
  // wrapped lines align under the first character of the first-line content.
  //
  // CRITICAL: pre-wrap the CONTENT (without prefix) to `contentMaxWidth`, then
  // render the prefix as a separate text call. If we instead rendered
  // "${prefix}${line}" in one call with `align: 'justify'` + maxWidth, jsPDF
  // sees the prefixed text overflow maxWidth, internally re-wraps it, and
  // emits multiple lines at successive y positions — but our cursor only
  // advances by ONE bodyLineHeight per outer-loop iteration, causing the
  // next bullet to render on top of the previous bullet's continuation line.
  const prefixWidth = pdf.getTextWidth(t.separators.bulletPrefix);
  const contentStartX = startX + prefixWidth;
  const contentMaxWidth = totalMaxWidth - prefixWidth;

  for (const bullet of bullets) {
    const lines = pdf.splitTextToSize(bullet, contentMaxWidth) as string[];
    for (let i = 0; i < lines.length; i++) {
      ensureSpace(pdf, t, c, t.spacing.bodyLineHeight);
      const prefix = i === 0 ? t.separators.bulletPrefix : t.separators.bulletContinuation;
      pdf.text(prefix, startX, c.y);

      const lineContent = lines[i] ?? '';
      const isLast = i === lines.length - 1;
      if (justify && !isLast) {
        pdf.text(lineContent, contentStartX, c.y, {
          align: 'justify',
          maxWidth: contentMaxWidth,
        });
      } else {
        pdf.text(lineContent, contentStartX, c.y);
      }
      c.y += t.spacing.bodyLineHeight;
    }
  }
}

/**
 * Largest scale factor in [minScale, 1.0] at which the four-part role-header
 * line (bold company + italic role + right-aligned date/location) fits within
 * `availableWidth`. Steps DOWN from 1.0 by `step` until either the line fits
 * or we hit `minScale`. If even `minScale` is too wide, returns `minScale`
 * (jsPDF will then wrap — still better than wrapping at the default size,
 * which can split mid-token like "AI 04/2024").
 *
 * Why scale (instead of shrinking only the role/title chunk): the line mixes
 * four different styles at two different sizes. Scaling all four chunks by
 * the same factor preserves the relative visual hierarchy (company stays
 * bolder/bigger than the date) while guaranteeing the width math is linear.
 */
function fitRoleHeaderScale(
  pdf: jsPDF,
  t: ResumeTemplate,
  leftCompany: string,
  leftRole: string,
  rightSide: string,
  availableWidth: number,
  minScale = 0.75,
  step = 0.025,
): number {
  // Measure each chunk once at its base style; chunk widths scale linearly
  // with font size, so width(scale) = width(1.0) * scale.
  applyStyle(pdf, t.styles.company);
  const wCompany = pdf.getTextWidth(leftCompany);
  applyStyle(pdf, t.styles.role);
  const wRole = pdf.getTextWidth(leftRole);
  applyStyle(pdf, t.styles.date);
  const wRight = pdf.getTextWidth(rightSide);

  const baseTotal = wCompany + wRole + wRight;
  if (baseTotal <= availableWidth) return 1.0;

  // Step DOWN from 1.0 by `step` until the scaled total fits or we hit minScale.
  for (let scale = 1.0 - step; scale >= minScale; scale -= step) {
    if (baseTotal * scale <= availableWidth) return scale;
  }
  return minScale;
}

/** Scale every numeric `size` on a TextStyle by `factor` (family/weight unchanged). */
function scaleStyle(style: TextStyle, factor: number): TextStyle {
  return { family: style.family, size: style.size * factor, weight: style.weight };
}

function renderExperience(
  pdf: jsPDF,
  t: ResumeTemplate,
  c: Cursor,
  experience: ResumeJson['experience'],
): void {
  if (experience.length === 0) return;
  renderSectionHeading(pdf, t, c, 'Work Experience');

  const available = contentWidth(t);

  for (const role of experience) {
    ensureSpace(pdf, t, c, t.spacing.beforeSectionGuard);

    // Role header — all on ONE line:
    //   [bold company][, italic role]                          [date | location]
    //
    // Compose the three chunks first so we can measure them, then pick the
    // largest font scale at which they all fit on a single line. This avoids
    // jsPDF wrapping the right-aligned date INTO the role text (the bug where
    // "AI 04/2024" got mashed together mid-line).
    const companyText = role.company;
    const roleText = `${t.separators.companyRoleJoin}${role.title}`;
    const dateText = `${role.startDate}${t.separators.dateRange}${role.endDate}`;
    const rightSide = role.location
      ? `${dateText}${t.separators.dateLocationJoin}${role.location}`
      : dateText;

    const scale = fitRoleHeaderScale(pdf, t, companyText, roleText, rightSide, available);

    // Draw company (bold) at the scaled style. Measure width AT the scaled
    // style so the role chunk that follows starts at the correct x.
    applyStyle(pdf, scaleStyle(t.styles.company, scale));
    pdf.text(companyText, t.page.marginX, c.y);
    const companyW = pdf.getTextWidth(companyText);

    // Draw role (italic) at the scaled style.
    applyStyle(pdf, scaleStyle(t.styles.role, scale));
    pdf.text(roleText, t.page.marginX + companyW, c.y);

    // Draw the right-aligned date/location at the scaled style.
    applyStyle(pdf, scaleStyle(t.styles.date, scale));
    pdf.text(rightSide, t.page.width - t.page.marginX, c.y, { align: 'right' });

    // No font restore needed — `renderBulletList` below calls applyStyle()
    // with t.styles.bullet (the unscaled bullet style) before drawing.
    c.y += t.spacing.afterRoleHeader;

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

/**
 * Build the PDF filename in the form `Firstname_Lastname_CV_Role.pdf`.
 * Examples:
 *   contact.fullName = "Marko Azirovic"
 *   targetTitle      = "AI Full Stack Engineer"
 *   → "Marko_Azirovic_CV_AIFullStackEngineer.pdf"
 *
 * Rules:
 *  - first + last name only (middle names dropped — keeps the slug short)
 *  - role is CamelConcatenated (spaces removed, capitalization preserved)
 *  - illegal-on-disk chars (\ / : * ? " < > |) stripped from each part
 *  - falls back to a single-token name / "Resume" / "CV" if pieces missing
 */
function buildResumeFilename(fullName: string, targetTitle: string): string {
  const stripIllegal = (s: string): string => s.replace(/[\\/:*?"<>|]/g, '');

  const nameTokens = stripIllegal(fullName).trim().split(/\s+/).filter(Boolean);
  const first = nameTokens[0] ?? 'Resume';
  const last = nameTokens.length > 1 ? nameTokens[nameTokens.length - 1] : '';

  const roleSlug = stripIllegal(targetTitle).replace(/\s+/g, '');
  const role = roleSlug.length > 0 ? roleSlug : 'CV';

  const namePart = last ? `${first}_${last}` : first;
  return `${namePart}_CV_${role}.pdf`.slice(0, 160);
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

/**
 * Render the resume and, if it exceeds `maxPages`, progressively shrink
 * the content (extras tail → older bullets → projects → summary length)
 * and re-render until it fits or the maximum shrink level is reached.
 *
 * The popup's stored resume is NEVER mutated — only the local working copy
 * passed into jsPDF is trimmed. The PDF saved to disk reflects the trimmed
 * version; the popup keeps showing the full content.
 */
function renderResumeToFit(
  resume: ResumeJson,
  template: ResumeTemplate,
  maxPages: number,
): { pdf: jsPDF; finalLevel: number; finalPages: number } {
  for (let level = 0; level <= MAX_SHRINK_LEVEL; level += 1) {
    const working = level === 0 ? resume : shrinkResume(resume, level);
    const pdf = renderResumeToPdf(working, template);
    const pages = pdf.getNumberOfPages();
    if (pages <= maxPages || level === MAX_SHRINK_LEVEL) {
      return { pdf, finalLevel: level, finalPages: pages };
    }
    log.info('PDF too long — escalating shrink level', { level: level + 1, pages, maxPages });
  }
  // Unreachable — loop always returns when level === MAX_SHRINK_LEVEL.
  /* istanbul ignore next */
  return {
    pdf: renderResumeToPdf(resume, template),
    finalLevel: 0,
    finalPages: 0,
  };
}

/**
 * Render the resume to a base64-encoded PDF + filename pair, WITHOUT
 * triggering a browser download. Used by the autofill engine so a "Resume"
 * file-upload field on a bid page can be filled programmatically instead
 * of forcing the user to download and re-upload.
 */
export function renderResumePdfBase64(resume: ResumeJson, maxPages = MAX_PAGES_DEFAULT): {
  filename: string;
  base64: string;
} {
  const filename = buildResumeFilename(resume.contact.fullName, resume.targetTitle);
  const { pdf } = renderResumeToFit(resume, ATS_TEMPLATE, maxPages);
  // jsPDF's `datauristring` returns "data:application/pdf;filename=…;base64,<b64>"
  // — strip the prefix so consumers get the raw base64.
  const dataUri = pdf.output('datauristring');
  const base64 = dataUri.replace(/^data:application\/pdf[^,]*,/, '');
  return { filename, base64 };
}

/**
 * Render a minimal cover-letter PDF from a generated proposal. Plain text
 * mode, ATS-readable, letter format. Used by the autofill engine when a
 * REQUIRED cover-letter file-upload field is detected on a bid page.
 *
 * Layout: name + contact line at top, optional subject line, then opener,
 * body paragraphs, highlights bullets, closer. All using the same template
 * primitives the resume renderer uses so font/spacing decisions stay in
 * one place.
 */
export function renderCoverLetterPdfBase64(
  proposal: ProposalJson,
  resume: ResumeJson,
): { filename: string; base64: string } {
  const t = ATS_TEMPLATE;
  const pdf = new jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait' });
  const cursor: Cursor = { y: t.page.marginTop };

  // Header: name + email | phone | linkedin. Mirror the resume layout so
  // both documents look like they came from the same person.
  applyStyle(pdf, t.styles.name);
  cursor.y += t.spacing.headerFirstBaseline;
  pdf.text(resume.contact.fullName, t.page.width / 2, cursor.y, { align: 'center' });
  cursor.y += t.spacing.afterName;

  const contactBits = [
    resume.contact.email,
    resume.contact.location,
    resume.contact.linkedin,
  ].filter((s): s is string => Boolean(s));
  if (contactBits.length > 0) {
    applyStyle(pdf, t.styles.contact);
    pdf.text(contactBits.join(t.separators.contactJoin), t.page.width / 2, cursor.y, {
      align: 'center',
    });
    cursor.y += t.spacing.afterContact;
  }

  applyStyle(pdf, t.styles.body);

  if (proposal.subject) {
    pdf.text(`Subject: ${proposal.subject}`, t.page.marginX, cursor.y);
    cursor.y += t.spacing.bodyLineHeight * 1.5;
  }

  const width = contentWidth(t);
  writeWrapped(pdf, t, cursor, proposal.opener, t.page.marginX, width, t.spacing.bodyLineHeight);
  cursor.y += t.spacing.bodyLineHeight * 0.5;

  for (const para of proposal.body) {
    writeWrapped(pdf, t, cursor, para, t.page.marginX, width, t.spacing.bodyLineHeight);
    cursor.y += t.spacing.bodyLineHeight * 0.5;
  }

  if (proposal.highlights.length > 0) {
    renderBulletList(pdf, t, cursor, proposal.highlights);
    cursor.y += t.spacing.bodyLineHeight * 0.5;
  }

  if (proposal.closer) {
    applyStyle(pdf, t.styles.body);
    writeWrapped(pdf, t, cursor, proposal.closer, t.page.marginX, width, t.spacing.bodyLineHeight);
  }

  // Filename mirrors the resume's: Firstname_Lastname_CoverLetter_Role.pdf
  const tokens = resume.contact.fullName
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = tokens[0] ?? 'CoverLetter';
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : '';
  const roleSlug =
    resume.targetTitle.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '') || 'Role';
  const namePart = last ? `${first}_${last}` : first;
  const filename = `${namePart}_CoverLetter_${roleSlug}.pdf`.slice(0, 160);

  const dataUri = pdf.output('datauristring');
  const base64 = dataUri.replace(/^data:application\/pdf[^,]*,/, '');
  return { filename, base64 };
}

/** Strip on-disk-illegal chars and collapse whitespace into single spaces. */
function sanitizePathSegment(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Zero-pad and assemble a filesystem-safe local timestamp `YYYY-MM-DD_HHMMSS`.
 * Local time (not UTC) so the stamp matches the user's wall clock.
 */
function timestampSlug(when: Date): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, '0');
  const date = `${when.getFullYear()}-${p(when.getMonth() + 1)}-${p(when.getDate())}`;
  const time = `${p(when.getHours())}${p(when.getMinutes())}${p(when.getSeconds())}`;
  return `${date}_${time}`;
}

/**
 * Build the ARCHIVE filename — deliberately distinct from the upload filename
 * (`buildResumeFilename`) so the saved copy is identifiable per application:
 *   `Firstname_Lastname_CV_Role__Company_YYYY-MM-DD_HHMMSS.pdf`
 * Company is omitted when unknown. All parts are sanitized for disk.
 */
function buildArchiveResumeFilename(
  fullName: string,
  targetTitle: string,
  company: string | null,
  when: Date,
): string {
  const stripIllegal = (s: string): string => s.replace(/[\\/:*?"<>|]/g, '');

  const nameTokens = stripIllegal(fullName).trim().split(/\s+/).filter(Boolean);
  const first = nameTokens[0] ?? 'Resume';
  const last = nameTokens.length > 1 ? nameTokens[nameTokens.length - 1] : '';
  const namePart = last ? `${first}_${last}` : first;

  const roleSlug = stripIllegal(targetTitle).replace(/\s+/g, '') || 'CV';
  const companySlug = company ? stripIllegal(company).replace(/\s+/g, '') : '';
  const companyPart = companySlug ? `_${companySlug}` : '';

  return `${namePart}_CV_${roleSlug}_${companyPart}_${timestampSlug(when)}.pdf`
    .replace(/__+/g, '_')
    .slice(0, 200);
}

interface ArchiveOptions {
  /** Hiring company name — used in the archive filename. */
  company: string | null;
  /** Downloads sub-folder root (Settings.resumeSaveFolder). */
  folder: string;
  /** Pre-rendered PDF bytes (base64). Reuses the same bytes uploaded to the form. */
  base64: string;
  fullName: string;
  targetTitle: string;
  /** Defaults to now — injectable for deterministic tests. */
  when?: Date;
}

/**
 * Auto-archive a copy of the generated resume into
 * `Downloads/<folder>/<Company>/<archive-filename>.pdf` via chrome.downloads.
 *
 * Silent (no Save-As dialog), non-destructive (uniquifies on name clash), and
 * best-effort: callers should swallow errors so a failed archive never blocks
 * the autofill/upload flow. Returns the relative download path on success.
 *
 * Browser sandbox note: `filename` is always relative to the Downloads dir —
 * absolute paths and `..` segments are rejected by the API, so each segment is
 * sanitized first. Reuses the already-rendered `base64` (identical to the
 * uploaded bytes); only the filename differs. Files are saved flat into
 * `<folder>` — no per-company sub-folder; the company is in the filename.
 */
export async function archiveResumePdf(options: ArchiveOptions): Promise<string> {
  const when = options.when ?? new Date();
  const filename = buildArchiveResumeFilename(
    options.fullName,
    options.targetTitle,
    options.company,
    when,
  );

  const root = sanitizePathSegment(options.folder);
  const relativePath = [root, filename].filter(Boolean).join('/');

  const url = `data:application/pdf;base64,${options.base64}`;
  const downloadId = await chrome.downloads.download({
    url,
    filename: relativePath,
    conflictAction: 'uniquify',
    saveAs: false,
  });

  log.info('resume archived', { downloadId, relativePath });
  return relativePath;
}

export async function downloadResumePdf(
  resume: ResumeJson,
  options: DownloadOptions = {},
): Promise<void> {
  const filename =
    options.filename ?? buildResumeFilename(resume.contact.fullName, resume.targetTitle);
  const maxPages = options.maxPages ?? MAX_PAGES_DEFAULT;

  log.info('rendering PDF', { filename, maxPages });

  const { pdf, finalLevel, finalPages } = renderResumeToFit(resume, ATS_TEMPLATE, maxPages);
  pdf.save(filename);

  if (finalLevel === 0) {
    log.info('PDF downloaded (no shrink needed)', { filename, pages: finalPages });
  } else {
    log.info('PDF downloaded (content trimmed to fit pages)', {
      filename,
      pages: finalPages,
      shrinkLevel: finalLevel,
      maxLevel: MAX_SHRINK_LEVEL,
    });
  }
}
