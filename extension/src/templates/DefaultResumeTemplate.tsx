/**
 * Default ATS-safe resume template.
 *
 * Visual style mirrors the user's sample CV (Marko Azirovic):
 *   - Centered header: bold serif name, italic target title, contact line
 *   - Section headings: uppercase, bold, with full-width horizontal rule
 *   - Experience: "Company, Title" on the left with dates right-aligned;
 *     location on its own right-aligned italic line
 *   - Skills: labeled paragraphs with parenthesized comma lists
 *
 * ATS rules baked in (NOT negotiable):
 *   - No tables, no multi-column flexbox for content (single linear flow)
 *   - System serif font for compatibility — every Chrome install has Georgia
 *     and Times New Roman
 *   - Selectable text; no images
 *   - Semantic <h1>/<h2> so PDF outlines work
 */
import type { CSSProperties, FC, ReactNode } from 'react';
import type { ResumeJson, ResumeSkills } from '@/types/resume';

interface Props {
  resume: ResumeJson;
}

const SERIF =
  'Georgia, "Times New Roman", Times, serif';

// Friendly labels for our seven skill buckets in the rendered output.
// Order also determines display order — JD-prioritized buckets float top.
const SKILL_BUCKETS: ReadonlyArray<readonly [keyof ResumeSkills, string]> = [
  ['languages', 'Languages'],
  ['frontend', 'Frontend'],
  ['backend', 'Backend'],
  ['cloud', 'Cloud & DevOps'],
  ['databases', 'Databases'],
  ['testing', 'Testing'],
  ['tools', 'Tools & Workflows'],
];

const SectionHeading: FC<{ children: ReactNode }> = ({ children }) => (
  <h2
    style={{
      fontFamily: SERIF,
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: '#000',
      margin: '14px 0 6px 0',
      paddingBottom: 3,
      borderBottom: '1px solid #000',
    }}
  >
    {children}
  </h2>
);

const RowTwoLine: FC<{ left: ReactNode; right: ReactNode; subRight?: ReactNode }> = ({
  left,
  right,
  subRight,
}) => (
  <div style={{ marginBottom: 2 }}>
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>{left}</div>
      <div style={{ fontSize: 10, whiteSpace: 'nowrap', color: '#222' }}>{right}</div>
    </div>
    {subRight && (
      <div
        style={{
          textAlign: 'right',
          fontSize: 10,
          fontStyle: 'italic',
          color: '#444',
        }}
      >
        {subRight}
      </div>
    )}
  </div>
);

export const DefaultResumeTemplate: FC<Props> = ({ resume }) => {
  const {
    contact,
    summary,
    skills,
    experience,
    projects,
    education,
    certifications,
    targetTitle,
    extras,
  } = resume;

  const containerStyle: CSSProperties = {
    fontFamily: SERIF,
    color: '#000',
    background: '#ffffff',
    padding: '0.5in 0.7in',
    width: '8.5in',
    minHeight: '11in',
    boxSizing: 'border-box',
    fontSize: 10.5,
    lineHeight: 1.45,
  };

  const contactBits = [
    contact.email,
    contact.location,
    contact.phone,
    contact.linkedin,
    contact.github,
    contact.website,
  ].filter((s): s is string => Boolean(s));

  const hasAnySkill =
    SKILL_BUCKETS.some(([key]) => skills[key].length > 0) ||
    extras.some((e) => e.items.length > 0);

  return (
    <div id="resume-root" style={containerStyle}>
      {/* Header */}
      <header style={{ textAlign: 'center', marginBottom: 4 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: 0.5,
            color: '#000',
          }}
        >
          {contact.fullName}
        </h1>
        <div
          style={{
            fontStyle: 'italic',
            fontSize: 14,
            marginTop: 2,
            color: '#222',
          }}
        >
          {targetTitle}
        </div>
        {contactBits.length > 0 && (
          <div style={{ fontSize: 11, marginTop: 6, color: '#222' }}>
            {contactBits.join('   •   ')}
          </div>
        )}
      </header>

      {summary && (
        <>
          <SectionHeading>Summary</SectionHeading>
          <p style={{ margin: 0, textAlign: 'justify' }}>{summary}</p>
        </>
      )}

      {experience.length > 0 && (
        <>
          <SectionHeading>Work Experience</SectionHeading>
          {experience.map((role, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <RowTwoLine
                left={
                  <span>
                    <strong>{role.company}</strong>
                    {', '}
                    <em>{role.title}</em>
                  </span>
                }
                right={`${role.startDate} – ${role.endDate}`}
                subRight={role.location ?? undefined}
              />
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {role.bullets.map((b, j) => (
                  <li key={j} style={{ marginBottom: 1 }}>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}

      {projects.length > 0 && (
        <>
          <SectionHeading>Projects</SectionHeading>
          {projects.map((p, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div>
                <strong>{p.name}</strong>
                {p.link && (
                  <span style={{ fontStyle: 'italic', color: '#444' }}> — {p.link}</span>
                )}
              </div>
              <div>{p.description}</div>
              {p.technologies.length > 0 && (
                <div style={{ fontStyle: 'italic', color: '#444' }}>
                  Stack: {p.technologies.join(', ')}
                </div>
              )}
              {p.bullets.length > 0 && (
                <ul style={{ margin: '3px 0 0', paddingLeft: 18 }}>
                  {p.bullets.map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </>
      )}

      {education.length > 0 && (
        <>
          <SectionHeading>Education</SectionHeading>
          {education.map((e, i) => (
            <RowTwoLine
              key={i}
              left={
                <span>
                  <strong>{e.institution}</strong>
                  {', '}
                  <em>
                    {e.degree}
                    {e.field ? `, ${e.field}` : ''}
                  </em>
                </span>
              }
              right={
                e.startDate || e.endDate
                  ? `${e.startDate ?? ''}${e.startDate && e.endDate ? ' – ' : ''}${e.endDate ?? ''}`
                  : ''
              }
            />
          ))}
        </>
      )}

      {hasAnySkill && (
        <>
          <SectionHeading>Skills</SectionHeading>
          <div>
            {SKILL_BUCKETS.filter(([key]) => skills[key].length > 0).map(([key, label]) => (
              <p key={key} style={{ margin: '2px 0' }}>
                <strong>{label}</strong> ({skills[key].join(', ')})
              </p>
            ))}
            {extras
              .filter((e) => e.items.length > 0)
              .map((extra, i) => (
                <p key={i} style={{ margin: '2px 0' }}>
                  <strong>{extra.heading}</strong> ({extra.items.join(', ')})
                </p>
              ))}
          </div>
        </>
      )}

      {certifications.length > 0 && (
        <>
          <SectionHeading>Certifications</SectionHeading>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {certifications.map((c, i) => (
              <li key={i}>
                {c.name} — {c.issuer}
                {c.date ? ` (${c.date})` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};
