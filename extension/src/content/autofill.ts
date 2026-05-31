/**
 * Bid-form autofill engine — runs in the content-script context.
 *
 * Pipeline:
 *   1. Enumerate every editable form field + visible click-target option group.
 *   2. For each, collect identifying signals (label, name, id, placeholder,
 *      aria-label, autocomplete) using a DOM walk that handles non-sibling
 *      labels (modern form-library layouts where label and input share a
 *      parent container but aren't adjacent siblings).
 *   3. Classify against ~20 categories: contact, name parts (first/last),
 *      demographics (work auth, sponsorship, gender, race, veteran,
 *      disability, pronouns), cover letter, summary, subject, …
 *   4. For matched fields: write the value through a React/Vue-compatible
 *      native setter. For <select>, find the matching option. For radio
 *      groups, click the matching label.
 *   5. For unmatched textareas / long inputs that look like questions
 *      ("why do you want to…", "describe a time…"), return them as
 *      `pendingQuestions` so the popup can batch them to the LLM and fill
 *      the answers in a second pass.
 *
 * Out of scope: file inputs, multi-step wizards.
 */
import type {
  AutofillFilled,
  AutofillPendingQuestion,
  AutofillReport,
  BidPayload,
} from '@/types/messages';

type EditableField =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement;

type Category =
  | 'full-name'
  | 'first-name'
  | 'last-name'
  | 'email'
  | 'phone'
  | 'location'
  | 'city'
  | 'country'
  | 'linkedin'
  | 'github'
  | 'website'
  | 'title'
  | 'years-experience'
  | 'subject'
  | 'cover-letter'
  | 'summary'
  | 'work-authorized'
  | 'requires-sponsorship'
  | 'gender'
  | 'race'
  | 'veteran-status'
  | 'disability-status'
  | 'pronouns'
  | 'unknown';

interface ClassifiedField {
  el: EditableField;
  category: Category;
  score: number;
  /** Short label for the report. */
  hint: string;
  /** True if the field looks like a free-text question for the LLM to answer. */
  questionLike: boolean;
  /** Best-effort label text (used as the question to the LLM). */
  labelText: string;
}

// Matchers are ordered ROUGHLY most-specific first. Each match adds its
// weight; the highest-scoring category wins. Demographics use high weights
// because they're often missed by generic "name"/"summary" patterns.
const MATCHERS: ReadonlyArray<{ category: Category; re: RegExp; weight: number }> = [
  // Email + URL: very high — `type="email"` overrides below
  { category: 'email', re: /\be[-_ ]?mail\b/, weight: 100 },
  { category: 'linkedin', re: /linkedin/, weight: 100 },
  { category: 'github', re: /github/, weight: 100 },

  // Name parts — first/last must beat the generic "name" matcher
  {
    category: 'first-name',
    re: /\b(first[-_ ]?name|given[-_ ]?name|forename|fname)\b/,
    weight: 110,
  },
  {
    category: 'last-name',
    re: /\b(last[-_ ]?name|family[-_ ]?name|surname|second[-_ ]?name|lname)\b/,
    weight: 110,
  },
  {
    category: 'full-name',
    re: /\b(full[-_ ]?name|your[-_ ]?name|applicant[-_ ]?name|legal[-_ ]?name|complete[-_ ]?name)\b|^name$/,
    weight: 100,
  },

  // Phone
  { category: 'phone', re: /\b(phone|mobile|cell|tel)\b/, weight: 90 },

  // Demographics — EEO fields commonly seen on US bid forms
  {
    category: 'work-authorized',
    re: /\b(legally[-_ ]?authorized|authorized[-_ ]?to[-_ ]?work|work[-_ ]?authorization|right[-_ ]?to[-_ ]?work|eligible[-_ ]?to[-_ ]?work)\b/,
    weight: 130,
  },
  {
    category: 'requires-sponsorship',
    re: /\b(require[-_ ]?(visa[-_ ]?)?sponsorship|require[-_ ]?(any[-_ ]?form[-_ ]?of[-_ ]?)?sponsorship|need[-_ ]?sponsorship|require[-_ ]?(work[-_ ]?)?visa|h[-_ ]?1[-_ ]?b)\b/,
    weight: 130,
  },
  { category: 'gender', re: /\b(gender|sex)\b/, weight: 100 },
  { category: 'race', re: /\b(race|ethnicity|ethnic[-_ ]?origin|racial)\b/, weight: 100 },
  {
    category: 'veteran-status',
    re: /\b(veteran|military[-_ ]?service|protected[-_ ]?veteran)\b/,
    weight: 100,
  },
  {
    category: 'disability-status',
    re: /\b(disability|disabled|disab(ility|led)[-_ ]?status)\b/,
    weight: 100,
  },
  { category: 'pronouns', re: /\bpronouns?\b/, weight: 100 },

  // Years of experience
  {
    category: 'years-experience',
    re: /(years[-_ ]?of[-_ ]?experience|years[-_ ]?experience|experience[-_ ]?\(years\)|how[-_ ]?many[-_ ]?years)/,
    weight: 90,
  },

  // Title / position
  {
    category: 'title',
    re: /\b(current[-_ ]?title|job[-_ ]?title|position[-_ ]?title|desired[-_ ]?title|role[-_ ]?title)\b/,
    weight: 70,
  },

  // Website / portfolio
  {
    category: 'website',
    re: /\b(website|portfolio|personal[-_ ]?url|homepage|blog)\b/,
    weight: 80,
  },

  // Location parts (more specific beats generic)
  { category: 'country', re: /\b(country)\b/, weight: 75 },
  { category: 'city', re: /\b(city|town)\b/, weight: 70 },
  { category: 'location', re: /\b(location|address|region|state|province)\b/, weight: 60 },

  // Cover letter / proposal
  {
    category: 'cover-letter',
    re: /\b(cover[-_ ]?letter|proposal|why[-_ ]?(you|fit|interested|join|us|this)|introduction|introduce[-_ ]?yourself|tell[-_ ]?us|describe[-_ ]?yourself|pitch|message[-_ ]?to[-_ ]?(client|hiring))\b/,
    weight: 80,
  },

  // Subject line
  {
    category: 'subject',
    re: /\b(subject|title[-_ ]?of[-_ ]?message|message[-_ ]?title|heading)\b/,
    weight: 60,
  },

  // Summary / bio
  {
    category: 'summary',
    re: /\b(summary|bio|about[-_ ]?you|professional[-_ ]?summary|profile[-_ ]?summary)\b/,
    weight: 60,
  },
];

// Question-like indicators on free-text fields — these stay UNMATCHED and
// flow to the LLM Q&A round trip.
const QUESTION_RE = /\?$|^(why|how|what|describe|tell|explain|provide|share|do you|are you|have you|would you|could you|when|where)\b/i;

function isQuestionLike(labelText: string): boolean {
  const t = labelText.trim().toLowerCase();
  if (!t) return false;
  if (t.length > 12 && QUESTION_RE.test(t)) return true;
  if (t.includes('?')) return true;
  return false;
}

// ---------- DOM helpers ----------

function isVisible(el: HTMLElement): boolean {
  if (el.hidden) return false;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
  if (el.offsetParent === null && cs.position !== 'fixed') return false;
  return true;
}

/**
 * Robust label finder — handles modern form-library DOMs where the label
 * and input share a container but aren't direct siblings.
 *
 * Tries (in order):
 *   1. `<label for="<id>">…</label>` anywhere in the doc
 *   2. Wrapping `<label>`
 *   3. `aria-labelledby` (multiple ids supported)
 *   4. `aria-label` attribute
 *   5. Previous sibling that's a label/span/div/p with short text
 *   6. PARENT or grandparent's first label/span/div with short text — handles
 *      the common React Hook Form layout `<div><label>…</label><div><input/></div></div>`
 *   7. data-label / data-field-label attributes (some component libs)
 */
function findLabelText(el: HTMLElement): string {
  // 1. for=id
  const inputId = (el as HTMLInputElement).id;
  if (inputId) {
    try {
      const lab = document.querySelector(`label[for="${CSS.escape(inputId)}"]`);
      const t = lab?.textContent?.trim();
      if (t) return t;
    } catch {
      /* CSS.escape can throw on weird ids */
    }
  }
  // 2. wrapping label
  const wrap = el.closest('label');
  if (wrap?.textContent?.trim()) return wrap.textContent.trim();
  // 3. aria-labelledby
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const txts = labelledby
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean);
    if (txts.length > 0) return txts.join(' ');
  }
  // 4. aria-label
  const ariaLabel = el.getAttribute('aria-label')?.trim();
  if (ariaLabel) return ariaLabel;
  // 5. immediate previous sibling
  let prev = el.previousElementSibling;
  let hops = 0;
  while (prev && hops < 3) {
    const tag = prev.tagName.toLowerCase();
    if (tag === 'label' || tag === 'span' || tag === 'div' || tag === 'p') {
      const t = prev.textContent?.trim();
      if (t && t.length < 100) return t;
    }
    prev = prev.previousElementSibling;
    hops += 1;
  }
  // 6. walk up to 3 parents, look for nearest label/span/div with short text
  let parent: HTMLElement | null = el.parentElement;
  let lvl = 0;
  while (parent && lvl < 3) {
    const candidates = parent.querySelectorAll<HTMLElement>('label, [class*="label" i], [class*="Label"]');
    for (const c of candidates) {
      if (c.contains(el)) continue;
      const t = c.textContent?.trim();
      if (t && t.length > 0 && t.length < 120) return t;
    }
    // Also try the parent's FIRST direct text-bearing child
    for (const child of Array.from(parent.children)) {
      if (child.contains(el)) continue;
      const tag = child.tagName.toLowerCase();
      if (['label', 'span', 'div', 'p', 'strong', 'h3', 'h4', 'h5'].includes(tag)) {
        const t = child.textContent?.trim();
        if (t && t.length > 0 && t.length < 120) return t;
      }
    }
    parent = parent.parentElement;
    lvl += 1;
  }
  // 7. data-* hints
  for (const attr of ['data-label', 'data-field-label', 'data-name', 'data-test-label']) {
    const v = el.getAttribute(attr);
    if (v) return v;
  }
  return '';
}

function fieldSignals(el: EditableField, labelText: string): string {
  return [
    el.name,
    el.id,
    el.getAttribute('placeholder') ?? '',
    el.getAttribute('aria-label') ?? '',
    el.getAttribute('autocomplete') ?? '',
    labelText,
  ]
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function classifyField(el: EditableField): ClassifiedField {
  const labelText = findLabelText(el);
  const haystack = fieldSignals(el, labelText);

  let best: ClassifiedField = {
    el,
    category: 'unknown',
    score: 0,
    hint: labelText.slice(0, 60) || el.name || el.id || '(unlabeled)',
    questionLike: false,
    labelText,
  };

  for (const m of MATCHERS) {
    if (m.re.test(haystack)) {
      let s = m.weight;
      if (el.tagName === 'TEXTAREA' && (m.category === 'cover-letter' || m.category === 'summary')) {
        s += 10;
      }
      if (s > best.score) {
        best = { ...best, category: m.category, score: s };
      }
    }
  }

  // type="email" trumps everything
  if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'email') {
    best = { ...best, category: 'email', score: 200 };
  }
  // type="tel" reinforces phone
  if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'tel') {
    best = { ...best, category: 'phone', score: Math.max(best.score, 110) };
  }
  // type="url" reinforces website
  if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'url' && best.category === 'unknown') {
    best = { ...best, category: 'website', score: 80 };
  }

  // If still unknown and it's a textarea: flag as question for LLM Q&A.
  if (best.category === 'unknown' && el.tagName === 'TEXTAREA') {
    best = { ...best, questionLike: isQuestionLike(labelText) };
  }

  return best;
}

// ---------- value resolution ----------

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0] ?? '', last: '' };
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') };
}

function coverLetterText(data: BidPayload): string {
  if (!data.proposal) return data.summary;
  const parts: string[] = [data.proposal.opener, ...data.proposal.body];
  if (data.proposal.highlights.length > 0) {
    parts.push('Highlights:');
    for (const h of data.proposal.highlights) parts.push(`- ${h}`);
  }
  parts.push(data.proposal.closer);
  return parts.filter(Boolean).join('\n\n');
}

function yesNoLabel(v: 'yes' | 'no' | 'prefer-not-to-say' | ''): string {
  switch (v) {
    case 'yes':
      return 'Yes';
    case 'no':
      return 'No';
    case 'prefer-not-to-say':
      return 'Prefer not to say';
    default:
      return '';
  }
}

function valueForCategory(category: Category, data: BidPayload): string {
  const split = splitName(data.contact.fullName);
  switch (category) {
    case 'full-name':
      return data.contact.fullName;
    case 'first-name':
      return split.first;
    case 'last-name':
      return split.last;
    case 'email':
      return data.contact.email;
    case 'phone':
      return data.contact.phone ?? '';
    case 'location':
      return data.contact.location ?? '';
    case 'city':
      // contact.location often contains "City, Country" — take the first part
      return data.contact.location?.split(',')[0]?.trim() ?? '';
    case 'country':
      return data.contact.location?.split(',').slice(-1)[0]?.trim() ?? '';
    case 'linkedin':
      return data.contact.linkedin ?? '';
    case 'github':
      return data.contact.github ?? '';
    case 'website':
      return data.contact.website ?? '';
    case 'title':
      return data.targetTitle;
    case 'years-experience':
      return String(data.yearsOfExperience);
    case 'subject':
      return data.proposal?.subject ?? data.targetTitle;
    case 'cover-letter':
      return coverLetterText(data);
    case 'summary':
      return data.summary;
    case 'work-authorized':
      return yesNoLabel(data.demographics?.workAuthorizedUS ?? '');
    case 'requires-sponsorship':
      return yesNoLabel(data.demographics?.requiresSponsorshipUS ?? '');
    case 'gender':
      return data.demographics?.gender ?? '';
    case 'race':
      return data.demographics?.race ?? '';
    case 'veteran-status':
      return data.demographics?.veteran ?? '';
    case 'disability-status':
      return data.demographics?.disability ?? '';
    case 'pronouns':
      return data.demographics?.pronouns ?? '';
    case 'unknown':
    default:
      return '';
  }
}

// ---------- field writers ----------

/**
 * React-compatible value setter for <input> / <textarea>. Writes through the
 * prototype setter so frameworks that patch the instance setter still pick
 * up the change via the dispatched events.
 */
function setNativeInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const protoSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (protoSetter) protoSetter.call(el, value);
  else (el as { value: string }).value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Pick the option whose text best matches `value` and set the select's
 * selectedIndex. Match is case-insensitive substring / equality, with
 * yes/no/prefer-not-to-say special-cased to find the closest option.
 */
function setSelectValue(el: HTMLSelectElement, value: string): boolean {
  if (!value) return false;
  const norm = value.trim().toLowerCase();
  const options = Array.from(el.options);

  // 1. Exact text match
  let idx = options.findIndex((o) => (o.textContent ?? '').trim().toLowerCase() === norm);
  // 2. Exact value attribute match
  if (idx < 0) idx = options.findIndex((o) => o.value.trim().toLowerCase() === norm);
  // 3. Contains
  if (idx < 0) {
    idx = options.findIndex((o) => (o.textContent ?? '').toLowerCase().includes(norm));
  }
  // 4. Yes/No special case — match starts-with
  if (idx < 0 && (norm === 'yes' || norm === 'no')) {
    idx = options.findIndex((o) => (o.textContent ?? '').trim().toLowerCase().startsWith(norm));
  }
  if (idx < 0) return false;

  // Skip placeholder options like "-- No answer --" / disabled / empty value
  const target = options[idx];
  if (!target) return false;
  if (target.disabled) return false;

  el.selectedIndex = idx;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/**
 * Click the radio (or radio-like button) whose label matches `value`.
 * Returns true if one was clicked.
 */
function clickRadioByLabel(name: string, value: string): boolean {
  if (!value || !name) return false;
  const norm = value.trim().toLowerCase();
  const radios = Array.from(
    document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(name)}"]`),
  );
  for (const r of radios) {
    const lab = findLabelText(r).trim().toLowerCase();
    if (lab === norm || lab.startsWith(norm) || r.value.toLowerCase() === norm) {
      r.click();
      return true;
    }
  }
  return false;
}

function writeField(field: ClassifiedField, value: string): boolean {
  if (!value) return false;
  const { el } = field;
  if (el.tagName === 'SELECT') {
    return setSelectValue(el as HTMLSelectElement, value);
  }
  if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'radio') {
    return clickRadioByLabel((el as HTMLInputElement).name, value);
  }
  setNativeInputValue(el as HTMLInputElement | HTMLTextAreaElement, value);
  return true;
}

// ---------- pipeline ----------

function selectAllFields(): EditableField[] {
  const selector = [
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="reset"]):not([type="image"]):not([type="file"])',
    'textarea',
    'select',
  ].join(', ');
  return Array.from(document.querySelectorAll<EditableField>(selector)).slice(0, 500);
}

/**
 * Scan + classify + fill known categories. Returns the report PLUS the
 * still-unmatched question-like fields so the popup can batch-send them to
 * the LLM Q&A endpoint and then call back with answers.
 */
export function autofillBidForm(data: BidPayload): AutofillReport {
  const candidates = selectAllFields();
  const filled: AutofillFilled[] = [];
  const pending: AutofillPendingQuestion[] = [];
  let unmatched = 0;

  const writtenOnce = new Set<Category>();
  const allowDuplicates = new Set<Category>(['cover-letter', 'summary']);

  for (let i = 0; i < candidates.length; i += 1) {
    const el = candidates[i];
    if (!el) continue;
    if (el.disabled || (el as HTMLInputElement).readOnly) continue;
    if (!isVisible(el)) continue;
    // Don't overwrite a user-entered value.
    if (el.tagName !== 'SELECT' && (el as HTMLInputElement).value?.length > 0) continue;

    const cls = classifyField(el);

    if (cls.category === 'unknown') {
      // Question-like textarea → queue for LLM Q&A
      if (cls.questionLike && el.tagName === 'TEXTAREA') {
        pending.push({
          fieldIndex: i,
          question: cls.labelText,
          hint: cls.hint,
        });
      } else {
        unmatched += 1;
      }
      continue;
    }
    if (writtenOnce.has(cls.category) && !allowDuplicates.has(cls.category)) continue;

    const value = valueForCategory(cls.category, data);
    if (!value) {
      unmatched += 1;
      continue;
    }

    const ok = writeField(cls, value);
    if (!ok) {
      unmatched += 1;
      continue;
    }

    writtenOnce.add(cls.category);
    filled.push({
      category: cls.category,
      preview: value.length > 80 ? `${value.slice(0, 77)}…` : value,
      selectorHint: cls.hint,
    });
  }

  return {
    filled,
    totalFields: candidates.length,
    unmatched,
    pendingQuestions: pending,
    ranAt: new Date().toISOString(),
  };
}

/**
 * Second-pass filler: write LLM-generated answers into the previously
 * detected question-like fields. Each entry pairs the `fieldIndex` from
 * `pendingQuestions` with the generated `answer`.
 */
export function fillAnswers(answers: Array<{ fieldIndex: number; answer: string }>): number {
  const fields = selectAllFields();
  let filled = 0;
  for (const { fieldIndex, answer } of answers) {
    if (!answer) continue;
    const el = fields[fieldIndex];
    if (!el) continue;
    if (el.disabled || (el as HTMLInputElement).readOnly) continue;
    if (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT') continue;
    setNativeInputValue(el as HTMLInputElement | HTMLTextAreaElement, answer);
    filled += 1;
  }
  return filled;
}
