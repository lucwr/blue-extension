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
  | 'transgender'
  | 'pronouns'
  | 'prior-employment'
  | 'relevant-experience'
  | 'how-did-you-hear'
  | 'salary-expectation'
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
  {
    category: 'transgender',
    re: /\b(transgender|trans[-_ ]?(identity|gender)?|identify[-_ ]?as[-_ ]?trans)\b/,
    weight: 130,
  },
  { category: 'pronouns', re: /\bpronouns?\b/, weight: 100 },

  // Common-but-non-EEO custom questions on Greenhouse / Lever / Workable.
  // Deterministic so the user's bidPreferences answer wins without an LLM hop.
  {
    category: 'prior-employment',
    re: /\b(previously[-_ ]?worked[-_ ]?(for|at|with)|ever[-_ ]?worked[-_ ]?(for|at)|formerly[-_ ]?(employed|worked)|prior[-_ ]?employment|worked[-_ ]?(for|at)[-_ ]?(us|this[-_ ]?company))\b/,
    weight: 120,
  },
  {
    category: 'relevant-experience',
    re: /\b(do[-_ ]?you[-_ ]?have[-_ ]?(any[-_ ]?|relevant[-_ ]?|prior[-_ ]?)?experience[-_ ]?(in|with)?|have[-_ ]?you[-_ ]?worked[-_ ]?(in|with)|are[-_ ]?you[-_ ]?experienced)\b/,
    weight: 95,
  },
  {
    category: 'how-did-you-hear',
    re: /\b(how[-_ ]?did[-_ ]?you[-_ ]?hear|how[-_ ]?did[-_ ]?you[-_ ]?find|where[-_ ]?did[-_ ]?you[-_ ]?(hear|find)|source[-_ ]?of[-_ ]?application|referral[-_ ]?source)\b/,
    weight: 120,
  },
  {
    category: 'salary-expectation',
    re: /\b(salary[-_ ]?(expectation|requirement|range)|compensation[-_ ]?(expectation|requirement)|expected[-_ ]?(salary|compensation|pay)|desired[-_ ]?(salary|compensation|pay)|pay[-_ ]?expectation|what[-_ ]?(are[-_ ]?your[-_ ]?)?(pay|salary))\b/,
    weight: 110,
  },

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
const QUESTION_RE = /\?$|\?\s*\*?\s*$|^(why|how|what|describe|tell|explain|provide|share|do you|are you|have you|would you|could you|when|where|please|by submitting|i (?:consent|agree)|consent|acknowledge)\b/i;

function isQuestionLike(labelText: string): boolean {
  const t = labelText.trim().toLowerCase();
  if (!t) return false;
  if (t.includes('?')) return true;
  if (t.length > 10 && QUESTION_RE.test(t)) return true;
  return false;
}

/**
 * Pull the meaningful option texts off a SELECT for the LLM to choose from.
 * Strips placeholder/empty options ("Select…", "-- choose --") so the LLM
 * can't pick a no-op value that the writer would reject anyway.
 */
function getSelectOptionTexts(el: HTMLSelectElement): string[] {
  const out: string[] = [];
  for (const opt of Array.from(el.options)) {
    if (opt.disabled) continue;
    const text = (opt.textContent ?? '').trim();
    if (!text) continue;
    // Skip leading placeholder rows. Greenhouse / Workable / Lever all use
    // either an empty-value placeholder OR a "Select…" / "-- choose --"
    // first option.
    if (!opt.value && /^(select|choose|please|--|—)/i.test(text)) continue;
    out.push(text);
  }
  return out;
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

  // For ANY unknown field (textarea, input, select), flag whether the label
  // looks like a real question. `queueAsLLMQuestion` then decides whether
  // to forward it to the LLM based on the field kind + this flag.
  if (best.category === 'unknown') {
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
    case 'transgender':
      return yesNoLabel(data.demographics?.transgender ?? '');
    case 'pronouns':
      return data.demographics?.pronouns ?? '';
    // Bid preferences — user-configurable defaults so common Greenhouse
    // custom questions never need an LLM round trip.
    case 'prior-employment':
      return yesNoLabel(data.bidPreferences?.priorEmployment ?? 'no');
    case 'relevant-experience':
      return yesNoLabel(data.bidPreferences?.hasRelevantExperience ?? 'yes');
    case 'how-did-you-hear':
      return data.bidPreferences?.howDidYouHear ?? '';
    case 'salary-expectation':
      return data.bidPreferences?.salaryExpectation ?? '';
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
 * Synonym groups for common Yes/No/gender/decline answers. The setSelectValue
 * matcher expands the input through this table so a profile value of "no"
 * still matches options like "No, I have not", "Not at this time", or "N",
 * and "Male" matches "Man" / "M".
 *
 * Each entry: canonical form → set of accepted variants (lowercase, no
 * trailing punctuation). The matcher fires when the input AND an option
 * each map to the same canonical form.
 */
const OPTION_SYNONYMS: ReadonlyArray<{ canonical: string; variants: RegExp[] }> = [
  {
    canonical: 'yes',
    variants: [
      /^y$/,
      /^yes\b/,
      /^true$/,
      /^affirmative$/,
      /^i (am|do|have|will|consent|agree)\b/,
      /^yes,?\s/,
    ],
  },
  {
    canonical: 'no',
    variants: [
      /^n$/,
      /^no\b/,
      /^false$/,
      /^negative$/,
      /^i (do not|don't|have not|haven't|am not|will not|won't)\b/,
      /^no,?\s/,
      /^not (at this time|currently|yet)\b/,
    ],
  },
  {
    canonical: 'prefer-not-to-say',
    variants: [
      /^prefer (not|to not)\b/,
      /^decline (to )?answer\b/,
      /^i (don't|do not) wish to answer\b/,
      /^choose not\b/,
      /^rather not\b/,
    ],
  },
  {
    canonical: 'male',
    variants: [/^m$/, /^male$/, /^man$/, /^cisgender male$/],
  },
  {
    canonical: 'female',
    variants: [/^f$/, /^w$/, /^female$/, /^woman$/, /^cisgender female$/],
  },
];

function normalizeForMatch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[.,;:!?*]+$/, '')
    .replace(/\s+/g, ' ');
}

function canonicalOf(s: string): string | null {
  const norm = normalizeForMatch(s);
  for (const grp of OPTION_SYNONYMS) {
    for (const re of grp.variants) {
      if (re.test(norm)) return grp.canonical;
    }
  }
  return null;
}

/**
 * Pick the option whose text best matches `value` and set the select's
 * selectedIndex. Match ladder, broadest first to most permissive last:
 *   1. Exact normalized text equality
 *   2. Exact normalized value attribute equality
 *   3. Synonym-canonical equality — covers "Yes"↔"Yes, I am", "Male"↔"Man",
 *      "no"↔"No, I have not", "prefer not to say"↔"Decline to answer", etc.
 *   4. Option text contains the input value
 *   5. Input value contains the option text (handles "White" → "White
 *      (Not Hispanic or Latino)" being authoritative)
 *   6. Token prefix match — last resort for partial matches.
 *
 * Disabled options and empty-value placeholders are skipped at every step.
 */
function setSelectValue(el: HTMLSelectElement, value: string): boolean {
  if (!value) return false;
  const norm = normalizeForMatch(value);
  if (!norm) return false;

  const candidates = Array.from(el.options)
    .map((opt, idx) => ({
      idx,
      opt,
      text: normalizeForMatch(opt.textContent ?? ''),
      value: normalizeForMatch(opt.value ?? ''),
    }))
    .filter((c) => !c.opt.disabled && c.text && c.opt.value !== '');

  const inputCanonical = canonicalOf(value);

  // 1. Exact text match
  let hit = candidates.find((c) => c.text === norm);
  // 2. Exact value attribute match
  if (!hit) hit = candidates.find((c) => c.value === norm);
  // 3. Synonym-canonical equality
  if (!hit && inputCanonical) {
    hit = candidates.find((c) => canonicalOf(c.opt.textContent ?? '') === inputCanonical);
  }
  // 4. Option text contains input
  if (!hit) hit = candidates.find((c) => c.text.includes(norm));
  // 5. Input value contains option text — but only for option texts that
  // are at least 2 chars to avoid matching one-letter abbreviations.
  if (!hit) hit = candidates.find((c) => c.text.length >= 2 && norm.includes(c.text));
  // 6. Token prefix — "yes" → "Yes, …", "no" → "No, …"
  if (!hit) hit = candidates.find((c) => c.text.startsWith(`${norm} `));

  if (!hit) return false;

  if (el.multiple) {
    // "Select all that apply" — don't clobber other selections, just
    // toggle this option on.
    hit.opt.selected = true;
  } else {
    el.selectedIndex = hit.idx;
  }
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

/** Hard cap on per-frame LLM questions — keeps the batch tractable. */
const MAX_PENDING_PER_FRAME = 20;

/**
 * Decide whether (and how) an unmatched field should be answered by the LLM.
 * Returns the queue entry to push, or `null` to treat the field as truly
 * unmatched.
 *
 * NOTE: SELECTS never go to the LLM. They're handled by the deterministic
 * `pickSelectDefault` path in the main loop so the engine always picks one
 * of the dropdown's real options — no risk of AI-generated text drifting
 * off the option list and leaving the field blank.
 *
 * TEXTAREA — queue when the label looks like a question.
 *
 * INPUT  — queue when the label looks like a question AND the field is a
 *   short text/number/url type. Catches "What are your salary expectations?",
 *   "When can you start?", etc.
 */
function queueAsLLMQuestion(
  el: EditableField,
  cls: ClassifiedField,
  fieldIndex: number,
): AutofillPendingQuestion | null {
  if (!cls.labelText) return null;
  // Selects never go to the LLM — handled by pickSelectDefault.
  if (el.tagName === 'SELECT') return null;

  if (el.tagName === 'TEXTAREA') {
    if (!cls.questionLike) return null;
    return {
      fieldIndex,
      question: cls.labelText,
      hint: cls.hint,
      fieldKind: 'textarea',
    };
  }

  if (el.tagName === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    // Only short text-ish inputs make sense for free-form answers.
    if (!['text', 'tel', 'url', 'search', 'number', ''].includes(type)) return null;
    if (!cls.questionLike) return null;
    return {
      fieldIndex,
      question: cls.labelText,
      hint: cls.hint,
      fieldKind: 'input',
    };
  }

  return null;
}

// ---------- deterministic select fallback ----------

/**
 * Find the first option text in `options` that satisfies `matcher`. Returns
 * the option's full text, since `setSelectValue` does the actual matching
 * against the live option list.
 */
function pickOption(options: string[], matcher: (lower: string) => boolean): string | null {
  for (const o of options) {
    if (matcher(o.trim().toLowerCase())) return o;
  }
  return null;
}

const RE_YES = /^y(?:es\b|$)/;
const RE_NO = /^n(?:o\b|$)|^no,|^i (?:am )?not\b/;
const RE_PNTS = /prefer not|decline|do not wish|don['’]t wish|rather not|wish to self-?identify/;

/**
 * Pick a sensible existing option for a SELECT whose label matches a common
 * application-form pattern. Runs whenever the user's profile doesn't supply
 * a value (or the value doesn't match an option). Defaults bias toward
 * answers that are safe across most US/Canada forms:
 *
 *   - EEO questions (race, gender, transgender, sexual orientation, age,
 *     disability, veteran, pronouns) → "Prefer not to say" if present;
 *     for the binary EEO ones (disability/veteran/transgender) fall back
 *     to "No".
 *   - "Have you previously worked here / ever worked at <X>?" → No.
 *   - "Are you authorized to work…?" → Yes (the candidate is applying, so
 *     in the freelance / professional case Yes is the right default).
 *   - "Do you require sponsorship / visa / work permit?" → No.
 *   - "Do you have experience with X?" / "Are you experienced?" → Yes.
 *   - Consent / acknowledgement → Yes.
 *
 * Returns null if no pattern matches, so the field stays unmatched and the
 * user can fill it manually.
 */
function pickSelectDefault(el: HTMLSelectElement, labelText: string): string | null {
  if (!labelText) return null;
  const options = getSelectOptionTexts(el);
  if (options.length === 0) return null;
  const label = labelText.toLowerCase();

  // EEO-style → "Prefer not to say" first.
  const isEEO =
    /\b(race|ethnicity|gender|sex(?:ual)?|transgender|orientation|disability|veteran|protected[-_ ]?veteran|age|pronouns?)\b/.test(
      label,
    );
  if (isEEO) {
    const pnts = pickOption(options, (s) => RE_PNTS.test(s));
    if (pnts) return pnts;
    // Binary EEO (disability / veteran / transgender) → "No"
    if (/\b(disability|disabled|veteran|protected|transgender)\b/.test(label)) {
      const no = pickOption(options, (s) => RE_NO.test(s));
      if (no) return no;
    }
  }

  // "Have you previously / ever worked at …" → No
  if (/\b(previously[-_ ]?worked|ever[-_ ]?worked|prior[-_ ]?employment|formerly[-_ ]?(worked|employed)|worked[-_ ]?(for|at)[-_ ]?(us|this[-_ ]?company))\b/.test(label)) {
    const no = pickOption(options, (s) => RE_NO.test(s));
    if (no) return no;
  }

  // Work auth → Yes
  if (/\b(authorized[-_ ]?to[-_ ]?work|legally[-_ ]?authorized|eligible[-_ ]?to[-_ ]?work|right[-_ ]?to[-_ ]?work)\b/.test(label)) {
    const yes = pickOption(options, (s) => RE_YES.test(s));
    if (yes) return yes;
  }

  // Sponsorship / visa → No
  if (/\b(sponsorship|require[-_ ]?(any[-_ ]?form[-_ ]?of[-_ ]?)?(visa|work[-_ ]?permit)|h[-_ ]?1[-_ ]?b)\b/.test(label)) {
    const no = pickOption(options, (s) => RE_NO.test(s));
    if (no) return no;
  }

  // Consent / agreement → Yes
  if (/\b(consent|i[-_ ]?(hereby[-_ ]?)?agree|acknowledge|by[-_ ]?submitting)\b/.test(label)) {
    const yes = pickOption(options, (s) => RE_YES.test(s));
    if (yes) return yes;
  }

  // Experience-yes-no → Yes (the candidate applied — they presumably have it)
  if (/\b(do[-_ ]?you[-_ ]?have[-_ ]?(any[-_ ]?|relevant[-_ ]?|prior[-_ ]?)?experience|have[-_ ]?you[-_ ]?worked[-_ ]?(in|with)|are[-_ ]?you[-_ ]?experienced)\b/.test(label)) {
    const yes = pickOption(options, (s) => RE_YES.test(s));
    if (yes) return yes;
  }

  return null;
}

/**
 * Try to populate a SELECT field. Two layers:
 *   1. The classifier's category → masterProfile / bidPreferences value.
 *      `setSelectValue` runs the value through the synonym/contains ladder.
 *   2. If that misses, the label-based deterministic fallback above. We
 *      never queue selects for the LLM — there's no good reason to spend
 *      a model call to pick "Yes" vs "No".
 *
 * Returns the value actually written, or null if nothing matched.
 */
function fillSelectField(
  el: HTMLSelectElement,
  cls: ClassifiedField,
  data: BidPayload,
): string | null {
  if (cls.category !== 'unknown') {
    const value = valueForCategory(cls.category, data);
    if (value && setSelectValue(el, value)) return value;
  }
  const fallback = pickSelectDefault(el, cls.labelText);
  if (fallback && setSelectValue(el, fallback)) return fallback;
  return null;
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

  const queue = (q: AutofillPendingQuestion | null): void => {
    if (!q) {
      unmatched += 1;
      return;
    }
    if (pending.length >= MAX_PENDING_PER_FRAME) {
      unmatched += 1;
      return;
    }
    pending.push(q);
  };

  for (let i = 0; i < candidates.length; i += 1) {
    const el = candidates[i];
    if (!el) continue;
    if (el.disabled || (el as HTMLInputElement).readOnly) continue;
    if (!isVisible(el)) continue;
    // Don't overwrite a user-entered value. For selects, also skip if a
    // non-placeholder option is already selected.
    if (el.tagName === 'SELECT') {
      const sel = el as HTMLSelectElement;
      const cur = sel.options[sel.selectedIndex];
      if (cur && cur.value && cur.value.length > 0) continue;
    } else if ((el as HTMLInputElement).value?.length > 0) {
      continue;
    }

    const cls = classifyField(el);

    // ----- SELECT path: always deterministic, never LLM -----
    if (el.tagName === 'SELECT') {
      if (cls.category !== 'unknown' && writtenOnce.has(cls.category) && !allowDuplicates.has(cls.category)) {
        continue;
      }
      const written = fillSelectField(el as HTMLSelectElement, cls, data);
      if (written) {
        if (cls.category !== 'unknown') writtenOnce.add(cls.category);
        filled.push({
          category: cls.category === 'unknown' ? 'eeo-default' : cls.category,
          preview: written.length > 80 ? `${written.slice(0, 77)}…` : written,
          selectorHint: cls.hint,
        });
      } else {
        unmatched += 1;
      }
      continue;
    }

    // ----- INPUT / TEXTAREA path: existing logic, may queue for LLM -----
    if (cls.category === 'unknown') {
      queue(queueAsLLMQuestion(el, cls, i));
      continue;
    }
    if (writtenOnce.has(cls.category) && !allowDuplicates.has(cls.category)) continue;

    const value = valueForCategory(cls.category, data);
    if (!value) {
      // Matcher hit but the user has no value — queue the textarea/input
      // for LLM Q&A (selects already returned above).
      queue(queueAsLLMQuestion(el, cls, i));
      continue;
    }

    const ok = writeField(cls, value);
    if (!ok) {
      queue(queueAsLLMQuestion(el, cls, i));
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
 * `pendingQuestions` with the generated `answer`. Dispatches SELECT vs
 * INPUT/TEXTAREA writers so the Greenhouse custom-question selects also
 * get filled.
 */
export function fillAnswers(answers: Array<{ fieldIndex: number; answer: string }>): number {
  const fields = selectAllFields();
  let filled = 0;
  for (const { fieldIndex, answer } of answers) {
    if (!answer) continue;
    const el = fields[fieldIndex];
    if (!el) continue;
    if (el.disabled || (el as HTMLInputElement).readOnly) continue;
    if (el.tagName === 'SELECT') {
      if (setSelectValue(el as HTMLSelectElement, answer)) filled += 1;
      continue;
    }
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      setNativeInputValue(el as HTMLInputElement | HTMLTextAreaElement, answer);
      filled += 1;
    }
  }
  return filled;
}
