/**
 * Default ATS-safe resume template.
 *
 * Rules baked into this template (NOT negotiable for ATS compatibility):
 *   - No tables, no multi-column flexbox for content
 *   - System fonts only; text selectable in PDF
 *   - Single linear flow: header → summary → skills → experience → projects → education
 *   - Section headings use semantic h2/h3 so PDF outlines work
 */
import type { FC } from 'react';
import type { ResumeJson } from '@/types/resume';

interface Props {
  resume: ResumeJson;
}

const Section: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ marginTop: 16 }}>
    <h2
      style={{
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 1.2,
        color: '#1f2937',
        borderBottom: '1px solid #cbd5e1',
        paddingBottom: 4,
        margin: 0,
      }}
    >
      {title}
    </h2>
    <div style={{ marginTop: 8 }}>{children}</div>
  </section>
);

export const DefaultResumeTemplate: FC<Props> = ({ resume }) => {
  const { contact, summary, skills, experience, projects, education, certifications, targetTitle } =
    resume;

  return (
    <div
      id="resume-root"
      style={{
        fontFamily:
          'Inter, "Helvetica Neue", Arial, sans-serif',
        color: '#0f172a',
        background: '#ffffff',
        padding: '32px 40px',
        width: '8.5in',
        minHeight: '11in',
        boxSizing: 'border-box',
        fontSize: 11,
        lineHeight: 1.45,
      }}
    >
      <header>
        <h1 style={{ margin: 0, fontSize: 22, color: '#0b1220' }}>{contact.fullName}</h1>
        <div style={{ fontSize: 12, color: '#334155', marginTop: 2 }}>{targetTitle}</div>
        <div style={{ fontSize: 11, color: '#475569', marginTop: 6 }}>
          {[contact.email, contact.phone, contact.location, contact.website, contact.linkedin, contact.github]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </header>

      {summary && (
        <Section title="Summary">
          <p style={{ margin: 0 }}>{summary}</p>
        </Section>
      )}

      <Section title="Skills">
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {(
            [
              ['Languages', skills.languages],
              ['Frontend', skills.frontend],
              ['Backend', skills.backend],
              ['Cloud', skills.cloud],
              ['Databases', skills.databases],
              ['Testing', skills.testing],
              ['Tools', skills.tools],
            ] as const
          )
            .filter(([, arr]) => arr.length > 0)
            .map(([label, arr]) => (
              <li key={label} style={{ marginBottom: 2 }}>
                <span style={{ fontWeight: 600 }}>{label}: </span>
                <span>{arr.join(', ')}</span>
              </li>
            ))}
        </ul>
      </Section>

      {experience.length > 0 && (
        <Section title="Experience">
          {experience.map((role, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 600 }}>
                  {role.title} · {role.company}
                </div>
                <div style={{ color: '#475569' }}>
                  {role.startDate} – {role.endDate}
                </div>
              </div>
              {role.location && (
                <div style={{ color: '#64748b', fontStyle: 'italic' }}>{role.location}</div>
              )}
              <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                {role.bullets.map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      )}

      {projects.length > 0 && (
        <Section title="Projects">
          {projects.map((p, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 600 }}>
                {p.name}
                {p.link && (
                  <span style={{ fontWeight: 400, color: '#475569' }}>
                    {' '}
                    — {p.link}
                  </span>
                )}
              </div>
              <div>{p.description}</div>
              {p.technologies.length > 0 && (
                <div style={{ color: '#475569', fontStyle: 'italic' }}>
                  Stack: {p.technologies.join(', ')}
                </div>
              )}
              {p.bullets.length > 0 && (
                <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                  {p.bullets.map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </Section>
      )}

      {education.length > 0 && (
        <Section title="Education">
          {education.map((e, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 600 }}>
                {e.degree}
                {e.field ? `, ${e.field}` : ''} · {e.institution}
              </div>
              {(e.startDate || e.endDate) && (
                <div style={{ color: '#475569' }}>
                  {e.startDate ?? ''} {e.startDate && e.endDate ? '–' : ''} {e.endDate ?? ''}
                </div>
              )}
            </div>
          ))}
        </Section>
      )}

      {certifications.length > 0 && (
        <Section title="Certifications">
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {certifications.map((c, i) => (
              <li key={i}>
                {c.name} — {c.issuer}
                {c.date ? ` (${c.date})` : ''}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
};
