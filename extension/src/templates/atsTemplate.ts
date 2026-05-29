/**
 * ATS Resume Template — single source of truth for visual structure.
 *
 *   Every visual decision a generated resume can make lives in this file:
 *   page geometry, every typographic style, every spacing distance, every
 *   separator string, the section-rule line weight, and the bullet glyph.
 *
 *   The PDF renderer (pdf.service.ts) is a pure (template, content) function:
 *   it consults this template for every layout decision. It holds ZERO
 *   magic numbers and ZERO typography choices.
 *
 *   To change how generated resumes look, edit THIS file and only this file.
 *   The renderer must never inline a font size, font weight, gap, indent,
 *   line width, separator, or alignment value.
 *
 *   The values below were tuned to match the user's sample CV (Marko
 *   Azirovic) — generous side margins, ample top margin, generous line
 *   height for body text, visible gaps between roles, hyphen-prefix bullets.
 */

// ---------- low-level types ----------

export type FontFamily = 'times' | 'helvetica' | 'courier';
export type FontWeight = 'normal' | 'bold' | 'italic' | 'bolditalic';
export type HAlign = 'left' | 'right' | 'center';

/** A complete typographic style — family + size (pt) + weight. */
export interface TextStyle {
  family: FontFamily;
  /** Size in points (jsPDF unit). */
  size: number;
  weight: FontWeight;
}

// ---------- template shape ----------

export interface ResumeTemplate {
  /** Page geometry, all in inches. */
  page: {
    width: number;
    height: number;
    marginX: number;
    marginTop: number;
    marginBottom: number;
  };

  /**
   * Every text style used anywhere in the document. The renderer picks one
   * of these per render call — it never constructs a TextStyle inline.
   */
  styles: {
    /** Centered bold name at the top. */
    name: TextStyle;
    /** Centered italic target title below the name. */
    targetTitle: TextStyle;
    /** Centered contact line. */
    contact: TextStyle;
    /** UPPERCASE bold section heading ("SUMMARY", "WORK EXPERIENCE", …). */
    sectionHeading: TextStyle;
    /** Default body text — summary paragraphs, default bullet text. */
    body: TextStyle;
    /** Bold company name on the role header line. */
    company: TextStyle;
    /** Italic job title following the company. */
    role: TextStyle;
    /** Right-aligned date range on the role header line. */
    date: TextStyle;
    /** Right-aligned italic location line below the role header. */
    location: TextStyle;
    /** Body text for bullets — same family as body but tracked separately. */
    bullet: TextStyle;
    /** Bold institution name on the education line. */
    institution: TextStyle;
    /** Italic degree text following the institution. */
    degree: TextStyle;
    /** Bold project name. */
    projectName: TextStyle;
    /** Italic project link suffix. */
    projectLink: TextStyle;
    /** Italic project "Stack:" line. */
    projectStack: TextStyle;
    /** Bold skill bucket label. */
    skillLabel: TextStyle;
    /** Normal skill items inside parentheses. */
    skillItems: TextStyle;
  };

  /** Vertical spacing distances in inches. */
  spacing: {
    /** From top-margin baseline, drop before the first name baseline. */
    headerFirstBaseline: number;
    /** After name baseline, before target title baseline. */
    afterName: number;
    /** After target title baseline, before contact baseline. */
    afterTitle: number;
    /** After contact baseline, before first section. */
    afterContact: number;
    /** Reserved guard before any section heading. */
    beforeSectionGuard: number;
    /** Before a section heading baseline (top padding of the section). */
    beforeSectionHeading: number;
    /** Between section-heading text baseline and the horizontal rule below it. */
    sectionTextToRule: number;
    /** Below the horizontal rule, before the first content line. */
    afterSectionRule: number;
    /** Line height for body text (one body line advances c.y this much). */
    bodyLineHeight: number;
    /** Line height for small italic lines (locations, project stack). */
    smallLineHeight: number;
    /** After a role-header line ("Company, Title    dates"), before location/bullets. */
    afterRoleHeader: number;
    /** After a location line, before the first bullet. */
    afterLocation: number;
    /** When no location is present, gap from role-header to first bullet. */
    afterRoleHeaderNoLocation: number;
    /** Between two roles (after last bullet of role N, before role N+1 header). */
    betweenRoles: number;
    /** Between two skill bucket rows. */
    betweenSkillRows: number;
    /** Between two education entries. */
    betweenEducationEntries: number;
    /** Between two projects. */
    betweenProjects: number;
    /** After a project name/link line. */
    afterProjectHeader: number;
  };

  /** Section rule (horizontal line under each section heading). */
  sectionRule: {
    /** jsPDF line width in inches. */
    lineWidth: number;
  };

  /** Reusable separator / prefix strings. */
  separators: {
    /** Joiner for the centered contact line. */
    contactJoin: string;
    /** Between company and role on the role-header line. */
    companyRoleJoin: string;
    /** Between institution and degree on the education line. */
    institutionDegreeJoin: string;
    /** Between role startDate and endDate on the role-header line. */
    dateRange: string;
    /** Between education startDate and endDate. */
    educationDateRange: string;
    /** First-line bullet prefix. */
    bulletPrefix: string;
    /** Continuation indent for wrapped bullet lines (must match prefix width). */
    bulletContinuation: string;
  };

  /** Indents in inches. */
  indents: {
    /** Bullet text start X = marginX + this. */
    bullet: number;
    /** Bullet text max width is reduced by this on the right edge for visual balance. */
    bulletInsetRight: number;
  };

  /** Hard rules for section behaviors — bake the user's "section uppercase" rule into the template. */
  rules: {
    /** When true, section-heading text is rendered as `text.toUpperCase()`. */
    sectionHeadingUppercase: boolean;
    /**
     * When true, the Skills section will start on a fresh page if its
     * estimated height does not fit on the current page. Prevents the
     * skill rows from being split across two pages.
     */
    keepSkillsOnOnePage: boolean;
  };
}

// ---------- the ATS template (the active one) ----------

export const ATS_TEMPLATE: ResumeTemplate = {
  page: {
    width: 8.5,
    height: 11,
    // Side margins tightened a touch — gives ~7.3" content width instead of 7.16"
    marginX: 0.7,
    // Top tightened, bottom widened for more "settled" bottom-of-page feel
    marginTop: 0.7,
    marginBottom: 0.75,
  },

  styles: {
    // Header pieces stay where they were — only the body content scales up.
    name: { family: 'times', size: 26, weight: 'bold' },
    targetTitle: { family: 'times', size: 16, weight: 'italic' },
    contact: { family: 'times', size: 12, weight: 'normal' },
    // Section headings stay one size above body so the hierarchy still reads.
    sectionHeading: { family: 'times', size: 13, weight: 'bold' },
    // Body / bullets / inline content all scale +2.
    body: { family: 'times', size: 11, weight: 'normal' },
    company: { family: 'times', size: 13, weight: 'bold' },
    role: { family: 'times', size: 13, weight: 'italic' },
    date: { family: 'times', size: 11, weight: 'normal' },
    location: { family: 'times', size: 11, weight: 'italic' },
    bullet: { family: 'times', size: 13, weight: 'normal' },
    institution: { family: 'times', size: 13, weight: 'bold' },
    degree: { family: 'times', size: 13, weight: 'italic' },
    projectName: { family: 'times', size: 12, weight: 'bold' },
    projectLink: { family: 'times', size: 10, weight: 'italic' },
    projectStack: { family: 'times', size: 10, weight: 'italic' },
    skillLabel: { family: 'times', size: 12, weight: 'bold' },
    skillItems: { family: 'times', size: 11, weight: 'normal' },
  },

  spacing: {
    headerFirstBaseline: 0.3,
    afterName: 0.34,
    afterTitle: 0.3,
    afterContact: 0.16,
    beforeSectionGuard: 0.6,
    beforeSectionHeading: 0.24,
    sectionTextToRule: 0.06,
    // Larger gap after the rule — "increase the spacing after line on work experiences"
    afterSectionRule: 0.26,
    // Body grew from 11pt to 13pt; line height bumps proportionally (~1.35× size).
    bodyLineHeight: 0.22,
    smallLineHeight: 0.18,
    afterRoleHeader: 0.24,
    afterLocation: 0.22,
    afterRoleHeaderNoLocation: 0.06,
    // Tighter gap between roles — "reduce the spacing between work experiences"
    betweenRoles: 0.12,
    betweenSkillRows: 0.26,
    betweenEducationEntries: 0.28,
    betweenProjects: 0.22,
    afterProjectHeader: 0.24,
  },

  sectionRule: {
    lineWidth: 0.012,
  },

  separators: {
    contactJoin: '   |   ',
    companyRoleJoin: ', ',
    institutionDegreeJoin: ', ',
    dateRange: ' – ', // U+2013 en dash
    educationDateRange: ' – ',
    bulletPrefix: '- ',
    bulletContinuation: '  ',
  },

  indents: {
    bullet: 0.1,
    bulletInsetRight: 0.18,
  },

  rules: {
    sectionHeadingUppercase: true,
    keepSkillsOnOnePage: true,
  },
};
