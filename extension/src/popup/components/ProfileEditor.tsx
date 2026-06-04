/**
 * Master profile editor. Persists to chrome.storage.local via useMasterProfile.
 *
 * Design choices:
 *  - One file with inline sub-components. The form is large but linear and
 *    easier to read in one place than spread across many tiny files.
 *  - Skills are entered as comma-separated strings, parsed to arrays on save.
 *  - Experience/Project bullets are entered one-per-line in a textarea.
 *  - JSON import/export at the bottom for power users (seeding from another
 *    resume, backing up, etc.).
 *  - Client-side validation is intentionally minimal — the backend Zod
 *    schemas are the authoritative gate. We only check fields that would
 *    otherwise produce a confusing AI failure (missing name/email/summary,
 *    empty experience bullets).
 */
import { useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import { sendToBackground } from '@/services/messaging';
import {
  EMPTY_BID_PREFERENCES,
  EMPTY_DEMOGRAPHICS,
  type BidPreferences,
  type MasterProfile,
  type ResumeContact,
  type ResumeDemographics,
  type ResumeEducation,
  type ResumeExperience,
  type ResumeProject,
  type ResumeSkills,
  type YesNoPNTS,
} from '@/types/resume';
import { useMasterProfile } from '../hooks/useStorage';

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10MB — generous for any normal resume PDF

async function readFileAsBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
  // dataUrl is "data:application/pdf;base64,XXXX..." — strip the prefix
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

const EMPTY_PROFILE: MasterProfile = {
  contact: { fullName: '', email: '' },
  summary: '',
  skills: {
    languages: [],
    frontend: [],
    backend: [],
    cloud: [],
    databases: [],
    testing: [],
    tools: [],
  },
  experience: [],
  projects: [],
  education: [],
  certifications: [],
  extras: [],
};

const EMPTY_EXPERIENCE: ResumeExperience = {
  company: '',
  title: '',
  startDate: '',
  endDate: '',
  bullets: [''],
};

const EMPTY_PROJECT: ResumeProject = {
  name: '',
  description: '',
  technologies: [],
  bullets: [],
};

const EMPTY_EDUCATION: ResumeEducation = {
  institution: '',
  degree: '',
};

const csvJoin = (arr: string[]): string => arr.join(', ');
const csvSplit = (s: string): string[] =>
  s.split(',').map((x) => x.trim()).filter(Boolean);

const linesJoin = (arr: string[]): string => arr.join('\n');
const linesSplit = (s: string): string[] =>
  s.split('\n').map((x) => x.trim()).filter(Boolean);

const undefIfEmpty = (s: string): string | undefined => (s.trim() ? s : undefined);

// ---------- atoms ----------

const Field: FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}> = ({ label, value, onChange, required, type = 'text', placeholder }) => (
  <label className="block">
    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
      {label}
      {required && <span className="text-red-500"> *</span>}
    </span>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
    />
  </label>
);

const Area: FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  help?: string;
  mono?: boolean;
}> = ({ label, value, onChange, rows = 3, placeholder, help, mono }) => (
  <label className="block">
    {label && (
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
    )}
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className={`mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none ${
        mono ? 'font-mono text-[10px]' : ''
      }`}
    />
    {help && <span className="text-[10px] text-slate-400">{help}</span>}
  </label>
);

const Select: FC<{
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => (
  <label className="block">
    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </label>
);

const Section: FC<{ title: string; subtitle?: string; children: ReactNode }> = ({
  title,
  subtitle,
  children,
}) => (
  <section className="space-y-2">
    <div>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
    </div>
    <div className="space-y-2">{children}</div>
  </section>
);

const Card: FC<{ heading: string; onRemove: () => void; children: ReactNode }> = ({
  heading,
  onRemove,
  children,
}) => (
  <div className="space-y-1 rounded border border-slate-200 bg-white p-2">
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {heading}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="text-[10px] text-red-600 hover:underline"
      >
        Remove
      </button>
    </div>
    {children}
  </div>
);

const AddButton: FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full rounded border border-dashed border-slate-300 py-2 text-xs text-slate-600 hover:border-brand-500 hover:text-brand-600"
  >
    {label}
  </button>
);

// ---------- main ----------

export const ProfileEditor: FC = () => {
  const { profile, save, saving, loading } = useMasterProfile();
  const [draft, setDraft] = useState<MasterProfile>(EMPTY_PROFILE);
  const [errors, setErrors] = useState<string[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [jsonImport, setJsonImport] = useState('');
  const [pdfImporting, setPdfImporting] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (profile) setDraft(profile);
  }, [profile]);

  const setContact = (patch: Partial<ResumeContact>): void =>
    setDraft((d) => ({ ...d, contact: { ...d.contact, ...patch } }));

  const setSkill = (key: keyof ResumeSkills, csv: string): void =>
    setDraft((d) => ({ ...d, skills: { ...d.skills, [key]: csvSplit(csv) } }));

  const patchExperience = (idx: number, patch: Partial<ResumeExperience>): void =>
    setDraft((d) => ({
      ...d,
      experience: d.experience.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }));

  const patchProject = (idx: number, patch: Partial<ResumeProject>): void =>
    setDraft((d) => ({
      ...d,
      projects: d.projects.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }));

  const patchEducation = (idx: number, patch: Partial<ResumeEducation>): void =>
    setDraft((d) => ({
      ...d,
      education: d.education.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }));

  const patchDemographics = (patch: Partial<ResumeDemographics>): void =>
    setDraft((d) => ({
      ...d,
      demographics: { ...(d.demographics ?? EMPTY_DEMOGRAPHICS), ...patch },
    }));

  const patchBidPreferences = (patch: Partial<BidPreferences>): void =>
    setDraft((d) => ({
      ...d,
      bidPreferences: { ...(d.bidPreferences ?? EMPTY_BID_PREFERENCES), ...patch },
    }));

  const showFlash = (msg: string, ms = 1800): void => {
    setFlash(msg);
    setTimeout(() => setFlash(null), ms);
  };

  const onSave = async (): Promise<void> => {
    const errs: string[] = [];
    if (!draft.contact.fullName.trim()) errs.push('Full name is required');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.contact.email)) {
      errs.push('Valid email is required');
    }
    if (!draft.summary.trim()) errs.push('Summary is required');
    draft.experience.forEach((exp, i) => {
      if (!exp.company.trim() || !exp.title.trim()) {
        errs.push(`Experience #${i + 1}: company and title required`);
      }
      if (exp.bullets.filter((b) => b.trim()).length === 0) {
        errs.push(`Experience #${i + 1}: at least one bullet required`);
      }
      if (!exp.startDate.trim() || !exp.endDate.trim()) {
        errs.push(`Experience #${i + 1}: start and end date required (use "Present" for end)`);
      }
    });
    draft.education.forEach((edu, i) => {
      if (!edu.institution.trim() || !edu.degree.trim()) {
        errs.push(`Education #${i + 1}: institution and degree required`);
      }
    });
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }

    // Drop empty bullets that linesSplit might have missed (defensive).
    const cleaned: MasterProfile = {
      ...draft,
      experience: draft.experience.map((e) => ({
        ...e,
        bullets: e.bullets.filter((b) => b.trim()),
      })),
      projects: draft.projects.map((p) => ({
        ...p,
        bullets: p.bullets.filter((b) => b.trim()),
      })),
    };

    setErrors([]);
    await save(cleaned);
    showFlash('Saved');
  };

  const onImport = (): void => {
    try {
      const parsed = JSON.parse(jsonImport) as Partial<MasterProfile>;
      setDraft({ ...EMPTY_PROFILE, ...parsed });
      setJsonImport('');
      setErrors([]);
      showFlash('Imported (not saved yet — click Save profile)');
    } catch {
      setErrors(['Invalid JSON in the import box']);
    }
  };

  const onExport = async (): Promise<void> => {
    await navigator.clipboard.writeText(JSON.stringify(draft, null, 2));
    showFlash('Copied current profile JSON');
  };

  const onPdfPicked = async (file: File): Promise<void> => {
    setErrors([]);
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrors(['Pick a PDF file (.pdf).']);
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setErrors([`PDF is larger than ${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB.`]);
      return;
    }

    setPdfImporting(true);
    try {
      const pdfBase64 = await readFileAsBase64(file);
      const result = await sendToBackground({
        type: 'BG_IMPORT_RESUME_PDF',
        payload: { pdfBase64 },
      });
      if (!result.ok) {
        setErrors([result.error.message]);
        return;
      }
      // Replace the draft entirely with the parsed profile. User must click
      // Save to persist — gives them a chance to review and edit first.
      setDraft({ ...EMPTY_PROFILE, ...result.data });
      showFlash('Imported from PDF — review the fields, then click Save profile', 4000);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'PDF import failed']);
    } finally {
      setPdfImporting(false);
      // Reset the input so the same file can be re-picked if needed.
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  if (loading) {
    return <div className="p-4 text-xs text-slate-500">Loading profile…</div>;
  }

  return (
    <div className="space-y-4 p-4 pb-20">
      {!profile && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
          No profile saved yet. Import from a PDF below, or fill in the fields manually and click <strong>Save profile</strong>.
        </div>
      )}

      {/* PDF import card — prominent so users find it before manual entry. */}
      <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-brand-900">Import from PDF resume</h3>
            <p className="mt-0.5 text-[11px] text-brand-800">
              Pick a text-based PDF — the AI parses it into the fields below. Takes ~15-30s.
              {profile && (
                <span className="block mt-0.5 text-amber-700">
                  Heads up: this <strong>replaces</strong> your current draft.
                </span>
              )}
            </p>
          </div>
        </div>
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onPdfPicked(f);
          }}
        />
        <button
          type="button"
          onClick={() => pdfInputRef.current?.click()}
          disabled={pdfImporting || saving}
          className="mt-2 w-full rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pdfImporting ? 'Parsing your resume…' : 'Choose PDF'}
        </button>
      </div>

      <Section title="Contact">
        <Field
          label="Full name"
          required
          value={draft.contact.fullName}
          onChange={(v) => setContact({ fullName: v })}
        />
        <Field
          label="Email"
          type="email"
          required
          value={draft.contact.email}
          onChange={(v) => setContact({ email: v })}
        />
        <Field
          label="Phone"
          value={draft.contact.phone ?? ''}
          onChange={(v) => setContact({ phone: undefIfEmpty(v) })}
        />
        <Field
          label="Location"
          placeholder="City, Country"
          value={draft.contact.location ?? ''}
          onChange={(v) => setContact({ location: undefIfEmpty(v) })}
        />
        <Field
          label="Website"
          value={draft.contact.website ?? ''}
          onChange={(v) => setContact({ website: undefIfEmpty(v) })}
        />
        <Field
          label="LinkedIn URL"
          value={draft.contact.linkedin ?? ''}
          onChange={(v) => setContact({ linkedin: undefIfEmpty(v) })}
        />
        <Field
          label="GitHub URL"
          value={draft.contact.github ?? ''}
          onChange={(v) => setContact({ github: undefIfEmpty(v) })}
        />
      </Section>

      <Section title="Summary" subtitle="2–4 sentences. The AI uses this verbatim as your starting point.">
        <Area
          label=""
          value={draft.summary}
          onChange={(v) => setDraft((d) => ({ ...d, summary: v }))}
          rows={4}
        />
      </Section>

      <Section title="Skills" subtitle="Comma-separated. Order doesn't matter — the AI re-orders by JD priority.">
        <Field
          label="Languages"
          placeholder="TypeScript, Python, Go"
          value={csvJoin(draft.skills.languages)}
          onChange={(v) => setSkill('languages', v)}
        />
        <Field
          label="Frontend"
          placeholder="React, Next.js, Tailwind"
          value={csvJoin(draft.skills.frontend)}
          onChange={(v) => setSkill('frontend', v)}
        />
        <Field
          label="Backend"
          placeholder="Node.js, Express, FastAPI"
          value={csvJoin(draft.skills.backend)}
          onChange={(v) => setSkill('backend', v)}
        />
        <Field
          label="Cloud"
          placeholder="AWS, GCP"
          value={csvJoin(draft.skills.cloud)}
          onChange={(v) => setSkill('cloud', v)}
        />
        <Field
          label="Databases"
          placeholder="PostgreSQL, Redis"
          value={csvJoin(draft.skills.databases)}
          onChange={(v) => setSkill('databases', v)}
        />
        <Field
          label="Testing"
          placeholder="Jest, Playwright"
          value={csvJoin(draft.skills.testing)}
          onChange={(v) => setSkill('testing', v)}
        />
        <Field
          label="Tools"
          placeholder="Docker, GitHub Actions"
          value={csvJoin(draft.skills.tools)}
          onChange={(v) => setSkill('tools', v)}
        />
      </Section>

      <Section title="Experience">
        {draft.experience.map((exp, i) => (
          <Card
            key={i}
            heading={`Role #${i + 1}`}
            onRemove={() =>
              setDraft((d) => ({
                ...d,
                experience: d.experience.filter((_, idx) => idx !== i),
              }))
            }
          >
            <Field
              label="Company"
              value={exp.company}
              onChange={(v) => patchExperience(i, { company: v })}
            />
            <Field
              label="Title"
              value={exp.title}
              onChange={(v) => patchExperience(i, { title: v })}
            />
            <Field
              label="Location"
              value={exp.location ?? ''}
              onChange={(v) => patchExperience(i, { location: undefIfEmpty(v) })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="Start"
                placeholder="2022"
                value={exp.startDate}
                onChange={(v) => patchExperience(i, { startDate: v })}
              />
              <Field
                label="End"
                placeholder="Present"
                value={exp.endDate}
                onChange={(v) => patchExperience(i, { endDate: v })}
              />
            </div>
            <Area
              label="Bullets"
              rows={4}
              value={linesJoin(exp.bullets)}
              onChange={(v) => patchExperience(i, { bullets: linesSplit(v) })}
              help="One bullet per line. Start with an action verb; include metrics where possible."
            />
          </Card>
        ))}
        <AddButton
          label="+ Add experience"
          onClick={() =>
            setDraft((d) => ({ ...d, experience: [...d.experience, { ...EMPTY_EXPERIENCE }] }))
          }
        />
      </Section>

      <Section title="Projects" subtitle="Optional. Useful for engineers with shorter employment history.">
        {draft.projects.map((p, i) => (
          <Card
            key={i}
            heading={`Project #${i + 1}`}
            onRemove={() =>
              setDraft((d) => ({ ...d, projects: d.projects.filter((_, idx) => idx !== i) }))
            }
          >
            <Field label="Name" value={p.name} onChange={(v) => patchProject(i, { name: v })} />
            <Field
              label="Link"
              value={p.link ?? ''}
              onChange={(v) => patchProject(i, { link: undefIfEmpty(v) })}
            />
            <Area
              label="Description"
              rows={2}
              value={p.description}
              onChange={(v) => patchProject(i, { description: v })}
            />
            <Field
              label="Technologies"
              placeholder="TypeScript, Postgres, Stripe"
              value={csvJoin(p.technologies)}
              onChange={(v) => patchProject(i, { technologies: csvSplit(v) })}
            />
            <Area
              label="Bullets (optional)"
              rows={3}
              value={linesJoin(p.bullets)}
              onChange={(v) => patchProject(i, { bullets: linesSplit(v) })}
            />
          </Card>
        ))}
        <AddButton
          label="+ Add project"
          onClick={() =>
            setDraft((d) => ({ ...d, projects: [...d.projects, { ...EMPTY_PROJECT }] }))
          }
        />
      </Section>

      <Section title="Education">
        {draft.education.map((edu, i) => (
          <Card
            key={i}
            heading={`Entry #${i + 1}`}
            onRemove={() =>
              setDraft((d) => ({ ...d, education: d.education.filter((_, idx) => idx !== i) }))
            }
          >
            <Field
              label="Institution"
              value={edu.institution}
              onChange={(v) => patchEducation(i, { institution: v })}
            />
            <Field
              label="Degree"
              value={edu.degree}
              onChange={(v) => patchEducation(i, { degree: v })}
            />
            <Field
              label="Field"
              value={edu.field ?? ''}
              onChange={(v) => patchEducation(i, { field: undefIfEmpty(v) })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="Start"
                value={edu.startDate ?? ''}
                onChange={(v) => patchEducation(i, { startDate: undefIfEmpty(v) })}
              />
              <Field
                label="End"
                value={edu.endDate ?? ''}
                onChange={(v) => patchEducation(i, { endDate: undefIfEmpty(v) })}
              />
            </div>
          </Card>
        ))}
        <AddButton
          label="+ Add education"
          onClick={() =>
            setDraft((d) => ({ ...d, education: [...d.education, { ...EMPTY_EDUCATION }] }))
          }
        />
      </Section>

      <Section
        title="Demographics (EEO)"
        subtitle="Optional. Filled in once, then auto-applied to every bid form that asks."
      >
        {/*
          One-click reset. Writes the typical-candidate sample answers
          (work auth = yes; sponsorship / veteran / disability / transgender
          / prior employment = no; experience = yes). Overwrites whatever
          the current state is — useful when an old import / mistaken
          selection left a field set to "yes" or "Prefer not to say".
        */}
        <div className="mb-2 flex items-center gap-2 rounded-md border border-brand-200 bg-brand-50 p-2 text-[11px]">
          <button
            type="button"
            onClick={() => {
              setDraft((d) => ({
                ...d,
                demographics: {
                  ...(d.demographics ?? EMPTY_DEMOGRAPHICS),
                  workAuthorizedUS: 'yes',
                  requiresSponsorshipUS: 'no',
                  veteran: 'I am not a protected veteran',
                  disability: 'No, I do not have a disability',
                  transgender: 'no',
                  hispanicLatino: 'no',
                  lgbtq: 'no',
                },
                bidPreferences: {
                  ...(d.bidPreferences ?? EMPTY_BID_PREFERENCES),
                  priorEmployment: 'no',
                  hasRelevantExperience: 'yes',
                  over18: 'yes',
                },
              }));
              showFlash('Demographics + bid defaults reset — click Save profile');
            }}
            className="rounded-md bg-brand-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-brand-700"
          >
            Set safe defaults
          </button>
          <span className="text-brand-900/70">
            Work auth = Yes, sponsorship/veteran/disability/transgender/prior employment = No,
            experience = Yes. Gender + race stay as-is (you fill those manually).
          </span>
        </div>
        {(() => {
          const demo = draft.demographics ?? EMPTY_DEMOGRAPHICS;
          const yesNo: ReadonlyArray<{ value: YesNoPNTS; label: string }> = [
            { value: '', label: '— Not specified —' },
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
            { value: 'prefer-not-to-say', label: 'Prefer not to say' },
          ];
          const genderOptions = [
            { value: '', label: '— Not specified —' },
            { value: 'Female', label: 'Female' },
            { value: 'Male', label: 'Male' },
            { value: 'Non-binary', label: 'Non-binary' },
            { value: 'Prefer not to say', label: 'Prefer not to say' },
          ];
          // Veteran "Yes" value uses "I am a protected veteran" — `canonicalOf`
          // maps `/^i am\b/` to "yes" so this picks the matching option on
          // forms with Yes/No or full-phrasing options. The old value
          // "I identify as a protected veteran" did NOT canonicalize and
          // caused those forms to default to "No" by mistake.
          const veteranOptions = [
            { value: '', label: '— Not specified —' },
            { value: 'I am not a protected veteran', label: 'No — I am not a protected veteran' },
            { value: 'I am a protected veteran', label: 'Yes — I am a protected veteran' },
            { value: 'Prefer not to say', label: 'Prefer not to say' },
          ];
          const disabilityOptions = [
            { value: '', label: '— Not specified —' },
            { value: 'No, I do not have a disability', label: 'No — I do not have a disability' },
            { value: 'Yes, I have a disability', label: 'Yes — I have a disability' },
            { value: "I don't wish to answer", label: 'Prefer not to say' },
          ];
          return (
            <>
              <Select
                label="Authorized to work in the US"
                value={demo.workAuthorizedUS}
                options={yesNo}
                onChange={(v) => patchDemographics({ workAuthorizedUS: v as YesNoPNTS })}
              />
              <Select
                label="Requires US visa sponsorship"
                value={demo.requiresSponsorshipUS}
                options={yesNo}
                onChange={(v) => patchDemographics({ requiresSponsorshipUS: v as YesNoPNTS })}
              />
              <Select
                label="Gender"
                value={demo.gender}
                options={genderOptions}
                onChange={(v) => patchDemographics({ gender: v })}
              />
              <Field
                label="Race / Ethnicity"
                placeholder="e.g. Asian, White, Two or more races"
                value={demo.race}
                onChange={(v) => patchDemographics({ race: v })}
              />
              <Select
                label="Veteran status"
                value={demo.veteran}
                options={veteranOptions}
                onChange={(v) => patchDemographics({ veteran: v })}
              />
              <Select
                label="Disability status"
                value={demo.disability}
                options={disabilityOptions}
                onChange={(v) => patchDemographics({ disability: v })}
              />
              <Select
                label="Do you identify as transgender?"
                value={demo.transgender}
                options={yesNo}
                onChange={(v) => patchDemographics({ transgender: v as YesNoPNTS })}
              />
              <Select
                label="Are you Hispanic / Latino?"
                value={demo.hispanicLatino}
                options={yesNo}
                onChange={(v) => patchDemographics({ hispanicLatino: v as YesNoPNTS })}
              />
              <Select
                label="Do you identify as LGBTQ?"
                value={demo.lgbtq}
                options={yesNo}
                onChange={(v) => patchDemographics({ lgbtq: v as YesNoPNTS })}
              />
              <Field
                label="Pronouns"
                placeholder="e.g. she/her, he/him, they/them"
                value={demo.pronouns}
                onChange={(v) => patchDemographics({ pronouns: v })}
              />
            </>
          );
        })()}
      </Section>

      <Section
        title="Bid form defaults"
        subtitle="Answers the extension auto-selects for common application questions. Saves a round trip to the LLM."
      >
        {(() => {
          const prefs = draft.bidPreferences ?? EMPTY_BID_PREFERENCES;
          const yesNo: ReadonlyArray<{ value: YesNoPNTS; label: string }> = [
            { value: '', label: '— Not specified —' },
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
            { value: 'prefer-not-to-say', label: 'Prefer not to say' },
          ];
          return (
            <>
              <Select
                label="Have you previously worked for this company?"
                value={prefs.priorEmployment}
                options={yesNo}
                onChange={(v) => patchBidPreferences({ priorEmployment: v as YesNoPNTS })}
              />
              <Select
                label="Do you have relevant experience for the role?"
                value={prefs.hasRelevantExperience}
                options={yesNo}
                onChange={(v) => patchBidPreferences({ hasRelevantExperience: v as YesNoPNTS })}
              />
              <Field
                label="How did you hear about this opportunity?"
                placeholder="LinkedIn, Job board, Referral, Company website, …"
                value={prefs.howDidYouHear}
                onChange={(v) => patchBidPreferences({ howDidYouHear: v })}
              />
              <Field
                label="Salary expectation"
                placeholder="e.g. $130,000 - $160,000, or Negotiable"
                value={prefs.salaryExpectation}
                onChange={(v) => patchBidPreferences({ salaryExpectation: v })}
              />
              {/*
                "Highest degree attained" — free-text so it matches any
                form's exact wording (Bachelor's Degree, M.B.A., Ph.D.,
                etc.). The engine's contains-match handles minor
                differences like "Bachelor's" vs "Bachelor of Science".
              */}
              <Field
                label="Highest degree attained"
                placeholder="e.g. Bachelor's Degree, M.B.A., Master of Science, Ph.D., …"
                value={prefs.highestDegree}
                onChange={(v) => patchBidPreferences({ highestDegree: v })}
              />
              <Select
                label="Are you 18 years of age or older?"
                value={prefs.over18}
                options={yesNo}
                onChange={(v) => patchBidPreferences({ over18: v as YesNoPNTS })}
              />
              <Field
                label="Age range (for forms that ask)"
                placeholder="e.g. 30-35, 26-29, 18-24 — match the form's wording"
                value={prefs.ageRange}
                onChange={(v) => patchBidPreferences({ ageRange: v })}
              />
            </>
          );
        })()}
      </Section>

      <Section title="Import / Export" subtitle="Paste a profile JSON to seed, or copy yours for backup.">
        <Area
          label=""
          rows={3}
          mono
          placeholder='{"contact":{"fullName":"..."}, ...}'
          value={jsonImport}
          onChange={setJsonImport}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onImport}
            disabled={!jsonImport.trim()}
            className="rounded border border-slate-300 px-2 py-1 text-[10px] hover:bg-slate-50 disabled:opacity-50"
          >
            Import JSON
          </button>
          <button
            type="button"
            onClick={() => void onExport()}
            className="rounded border border-slate-300 px-2 py-1 text-[10px] hover:bg-slate-50"
          >
            Copy current as JSON
          </button>
        </div>
      </Section>

      {errors.length > 0 && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">
          <strong>Fix these before saving:</strong>
          <ul className="mt-1 list-disc pl-4">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 flex items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-2">
        <span className="text-[11px] text-slate-500">
          {flash ? (
            <span className="font-medium text-emerald-700">✓ {flash}</span>
          ) : profile ? (
            'Saved profile loaded'
          ) : (
            'No profile saved yet'
          )}
        </span>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </div>
  );
};
