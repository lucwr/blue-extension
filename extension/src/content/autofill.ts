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
  AutofillUnmatchedField,
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
  | 'hispanic-latino'
  | 'pronouns'
  | 'prior-employment'
  | 'relevant-experience'
  | 'how-did-you-hear'
  | 'salary-expectation'
  | 'highest-degree'
  | 'age-over-18'
  | 'age-range'
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
    // Any mention of sponsorship on a job application is a visa-sponsorship
    // question. Also catches H-1B, change of status, and "work visa" /
    // "work permit" phrasings used by employers like ezCater.
    //
    // Weight 150 (above the 130 used by `work-authorized`) because verbose
    // sponsorship labels (e.g. "Will you require sponsorship for work
    // authorization?") also contain the work-auth keyword — sponsorship is
    // the more specific intent and must win the tie.
    re: /\b(sponsorship|h[-_ ]?1[-_ ]?b|change[-_ ]?of[-_ ]?status|work[-_ ]?(visa|permit)|permanent[-_ ]?residence)\b/,
    weight: 150,
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
  {
    // Hispanic/Latino is a SEPARATE EEO question from race on US forms;
    // weight above race (100) so the more specific intent wins when both
    // keywords appear in the same label (e.g. "Race / Ethnicity / Hispanic").
    category: 'hispanic-latino',
    re: /\b(hispanic|latino|latinx|latin[-_ ]?(american|x))\b/,
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

  // Highest degree attained — Bachelor's / Master's / Ph.D. / M.B.A. picker.
  // The `\bdegree\b` matcher fires whenever the haystack mentions "degree"
  // as a standalone word (group label or input id). Safe even with the
  // permissive match because writtenOnce dedupes if multiple selects on
  // the same form happen to share the keyword.
  {
    category: 'highest-degree',
    re: /\b(highest[-_ ]?(degree|education|level[-_ ]?of[-_ ]?education)|degree[-_ ]?(attained|earned|completed|level)|education[-_ ]?level|what[-_ ]?(is[-_ ]?your[-_ ]?)?degree|\bdegree\b)\b/,
    weight: 100,
  },
  // "Are you 18 years of age or older?" — work-eligibility age question.
  // Anchored phrasings only, so we don't accidentally hit other "18"
  // mentions on the page.
  {
    category: 'age-over-18',
    re: /\b(18[-_ ]?(years?[-_ ]?of[-_ ]?age|years?[-_ ]?old|or[-_ ]?older|or[-_ ]?over|\+)|of[-_ ]?legal[-_ ]?(working[-_ ]?)?age|at[-_ ]?least[-_ ]?18|over[-_ ]?18|minimum[-_ ]?age)\b/,
    weight: 110,
  },
  // "What is your age range?" — picks the user's saved bucket (e.g. "30-35").
  // Weight above age-over-18 so verbose labels that mention both win this
  // category; demographics.age-over-18 stays handled by the simpler regex.
  {
    category: 'age-range',
    re: /\b(age[-_ ]?(range|bracket|group)|how[-_ ]?old[-_ ]?are[-_ ]?you|date[-_ ]?of[-_ ]?birth|year[-_ ]?of[-_ ]?birth|dob|birthdate)\b/,
    weight: 125,
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
    case 'hispanic-latino':
      return yesNoLabel(data.demographics?.hispanicLatino ?? '');
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
    case 'highest-degree':
      return data.bidPreferences?.highestDegree ?? '';
    case 'age-over-18':
      return yesNoLabel(data.bidPreferences?.over18 ?? 'yes');
    case 'age-range':
      return data.bidPreferences?.ageRange ?? '';
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
// IMPORTANT: NO comes BEFORE YES. Sentences like "I do not identify…" match
// the yes pattern /^i do\b/ on "do" before "not" is even considered. By
// checking no patterns first, the more-specific "i do not" / "i did not" /
// "i don't" forms canonicalize correctly to "no" instead of accidentally
// being labelled "yes".
const OPTION_SYNONYMS: ReadonlyArray<{ canonical: string; variants: RegExp[] }> = [
  {
    canonical: 'no',
    variants: [
      /^n$/,
      /^no\b/,
      /^false$/,
      /^negative$/,
      /^i (do not|don't|have not|haven't|am not|will not|won't|did not|didn't|cannot|can't)\b/,
      /^i'm not\b/,
      /^no,?\s/,
      /^not (a |at this time|currently|yet|today|in the (past|future)|interested)\b/,
      // EEO-specific: "Not Hispanic or Latino" is the No-equivalent on the
      // old US-EEO 2-question race form. Without this, "no" had no canonical
      // match and the contains-fallback would mis-match "Hispanic or Latino"
      // via the substring "latino" → "no".
      /^not hispanic\b/,
      /^not latino\b/,
      /^never\b/,
      /^none\b/,
      /^disagree\b/,
    ],
  },
  {
    canonical: 'yes',
    variants: [
      /^y$/,
      /^yes\b/,
      /^true$/,
      /^affirmative$/,
      // "i do not / i don't" canonicalize to "no" via the rule above, which
      // is checked FIRST so this pattern can't accidentally swallow them.
      /^i (am|do|have|will|consent|agree)\b/,
      /^yes,?\s/,
    ],
  },
  {
    canonical: 'prefer-not-to-say',
    variants: [
      /^prefer (not|to not)\b/,
      /^decline\b/, // Covers "Decline", "Decline To Self Identify", "Decline to answer", etc.
      /^i (don't|do not) wish to answer\b/,
      /^i (don't|do not) (want|wish) to (answer|disclose|say|share|provide|self-?identify)\b/,
      /^i (prefer|wish) not to\b/,
      /^choose not\b/,
      /^rather not\b/,
      /^not (specified|disclosed|provided|stated)\b/,
      /^will not (answer|disclose|say)\b/,
      /^opt out\b/,
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
 * Should the contains-match steps in the match ladders be SKIPPED for this
 * input value? True when the value is a short yes/no token whose substring
 * appears inside unrelated EEO option texts — e.g. "no" inside "Hispanic or
 * Latino" via the trailing "latino" → "no", or "yes" inside "yesterday".
 *
 * For those, only exact / value / canonical / synonym matches are safe;
 * contains and reverse-contains create false positives that route the
 * wrong demographic answer onto an unrelated dropdown.
 */
function shouldSkipContains(value: string, canonical: string | null): boolean {
  const norm = normalizeForMatch(value);
  if (norm.length > 3) return false;
  return canonical === 'yes' || canonical === 'no';
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
  // 4, 5, 6 — substring fallbacks. Skip them for short yes/no tokens to
  // avoid e.g. "no" matching "Hispanic or Latino" via the "latino" → "no"
  // substring.
  const skipContains = shouldSkipContains(value, inputCanonical);
  if (!hit && !skipContains) hit = candidates.find((c) => c.text.includes(norm));
  if (!hit && !skipContains) hit = candidates.find((c) => c.text.length >= 2 && norm.includes(c.text));
  if (!hit && !skipContains) hit = candidates.find((c) => c.text.startsWith(`${norm} `));

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
    // Radios are excluded — handled by the dedicated radio-group pass.
    // Per-radio classification doesn't see the group label, so the group's
    // category never gets identified there.
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="reset"]):not([type="image"]):not([type="file"]):not([type="radio"])',
    'textarea',
    'select',
  ].join(', ');
  // Exclude react-select's combobox <input>. It's a text field used to drive
  // the dropdown — setting its value does nothing useful (react-select
  // ignores it) and treating it as a question-like input would queue the
  // wrong thing for the LLM. The dedicated react-select pass handles these.
  return Array.from(document.querySelectorAll<EditableField>(selector))
    .filter((el) => {
      if (el.tagName !== 'INPUT') return true;
      const inp = el as HTMLInputElement;
      if (inp.getAttribute('role') === 'combobox') return false;
      // Class-based detection for the Greenhouse / Lever react-select skin.
      if (inp.classList.contains('select__input')) return false;
      return true;
    })
    .slice(0, 500);
}

// ---------- react-select v5 (Greenhouse job-boards) ----------

/**
 * One react-select dropdown discovered on the page.
 *
 * Greenhouse's new job-boards UI is built on Remix + react-select v5. There
 * are NO native `<select>` elements — the visible widget is:
 *
 *   <div class="select-shell">
 *     <label for="{id}" id="{id}-label">…</label>
 *     <div class="select__control">
 *       <input class="select__input" id="{id}" role="combobox" aria-haspopup="true"
 *              aria-labelledby="{id}-label">
 *       <div class="select__placeholder">Select…</div>
 *       <div class="select__indicators">…chevron…</div>
 *     </div>
 *     (after open) <div class="select__menu"><div class="select__menu-list">
 *                    <div class="select__option" id="…-option-N">Label</div>
 *                  </div></div>
 *   </div>
 *
 * react-select listens to `mousedown` (not `click`) on the option, and the
 * menu is only rendered AFTER the control is clicked, so the engine has to
 * (1) mousedown the control, (2) wait for the menu, (3) mousedown the
 * matching option.
 */
interface ReactSelectWidget {
  input: HTMLInputElement;
  control: HTMLElement;
  shell: HTMLElement;
  labelText: string;
  multiple: boolean;
}

function findReactSelectWidgets(): ReactSelectWidget[] {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input[role="combobox"][aria-haspopup="true"], input.select__input',
    ),
  );
  const widgets: ReactSelectWidget[] = [];
  for (const input of inputs) {
    const control =
      input.closest<HTMLElement>('.select__control') ?? input.parentElement?.parentElement ?? null;
    const shell =
      input.closest<HTMLElement>('.select-shell, .select__container, .select') ??
      control?.parentElement ??
      null;
    if (!control || !shell) continue;
    if (!isVisible(input) && !isVisible(control)) continue;
    const labelText = labelForReactSelect(input);
    if (!labelText) continue;
    const multiple = /select__control--is-multi|--is-multi\b/.test(control.className);
    widgets.push({ input, control, shell, labelText, multiple });
  }
  return widgets.slice(0, 80);
}

function labelForReactSelect(input: HTMLInputElement): string {
  // 1. aria-labelledby is the canonical hook for react-select.
  const labelledby = input.getAttribute('aria-labelledby');
  if (labelledby) {
    const parts = labelledby
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean);
    if (parts.length > 0) {
      // Strip trailing "*" required marker.
      return parts.join(' ').replace(/\s*\*\s*$/, '').trim();
    }
  }
  // 2. for=id
  const id = input.id;
  if (id) {
    try {
      const lab = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      const t = lab?.textContent?.trim();
      if (t) return t.replace(/\s*\*\s*$/, '').trim();
    } catch {
      /* ignore */
    }
  }
  // 3. Parent walk — same strategy as findLabelText.
  return findLabelText(input);
}

function dispatchMouseSequence(el: HTMLElement): void {
  // react-select responds to mousedown. We send the full sequence anyway
  // so widgets that listen to click (or pointer events) also fire.
  const opts: MouseEventInit = { bubbles: true, cancelable: true, button: 0, view: window };
  el.dispatchEvent(new MouseEvent('pointerdown', opts));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new MouseEvent('pointerup', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.dispatchEvent(new MouseEvent('click', opts));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for react-select's menu (`.select__menu-list`) to mount with at
 * least one option. Polls on each animation frame up to `timeoutMs`. The
 * menu is portalled into the same shell, so we search there first; some
 * setups portal it to body, so we also fall back to document.
 */
async function waitForReactSelectMenu(
  widget: ReactSelectWidget,
  timeoutMs = 700,
): Promise<HTMLElement | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const inShell = widget.shell.querySelector<HTMLElement>(
      '.select__menu-list, [class*="menu-list"]',
    );
    if (inShell && inShell.children.length > 0) return inShell;
    // Fallback: react-select with menuPortalTarget renders into document.body.
    const inBody = document.querySelector<HTMLElement>(
      '.select__menu-portal .select__menu-list, [class*="MenuPortal"] [class*="menu-list"]',
    );
    if (inBody && inBody.children.length > 0) return inBody;
    await wait(16);
  }
  return null;
}

function readReactSelectOptions(menu: HTMLElement): Array<{ el: HTMLElement; text: string }> {
  const optionEls = Array.from(
    menu.querySelectorAll<HTMLElement>(
      '.select__option, [class*="select__option"], [role="option"]',
    ),
  );
  return optionEls
    .map((el) => ({ el, text: (el.textContent ?? '').trim() }))
    .filter((o) => o.text && !/^(select|choose|please|--|—)/i.test(o.text));
}

/**
 * Match `value` to an option text using the same ladder as setSelectValue:
 * exact → synonym-canonical → contains → reverse-contains → token prefix.
 */
function matchReactSelectOption(
  options: Array<{ el: HTMLElement; text: string }>,
  value: string,
): { el: HTMLElement; text: string } | null {
  if (!value) return null;
  const norm = normalizeForMatch(value);
  if (!norm) return null;
  const inputCanonical = canonicalOf(value);

  for (const o of options) {
    if (normalizeForMatch(o.text) === norm) return o;
  }
  if (inputCanonical) {
    for (const o of options) {
      if (canonicalOf(o.text) === inputCanonical) return o;
    }
  }
  // Substring fallbacks — skipped for short yes/no tokens (see shouldSkipContains).
  if (!shouldSkipContains(value, inputCanonical)) {
    for (const o of options) {
      if (normalizeForMatch(o.text).includes(norm)) return o;
    }
    for (const o of options) {
      const t = normalizeForMatch(o.text);
      if (t.length >= 2 && norm.includes(t)) return o;
    }
    for (const o of options) {
      if (normalizeForMatch(o.text).startsWith(`${norm} `)) return o;
    }
  }
  return null;
}

/**
 * Open the react-select menu, mousedown the option whose text matches
 * `optionText`, then close the menu. Extracted from `fillReactSelectWidget`
 * so the second-pass `fillUnmatched` can target a known option without
 * re-running the classifier.
 *
 * Returns the option text actually clicked, or null on miss / no menu.
 */
async function pickReactSelectOption(
  widget: ReactSelectWidget,
  optionText: string,
): Promise<string | null> {
  // 1. Open the menu.
  widget.input.focus();
  dispatchMouseSequence(widget.control);
  const menu = await waitForReactSelectMenu(widget);
  if (!menu) {
    widget.input.blur();
    return null;
  }
  const options = readReactSelectOptions(menu);
  if (options.length === 0) {
    widget.input.blur();
    return null;
  }

  // 2. Find the option by text (use the same match ladder so chips chosen
  // from a synonym still hit the right row).
  const pick = matchReactSelectOption(options, optionText);
  if (!pick) {
    widget.input.blur();
    return null;
  }

  // 3. Mousedown commits the selection in react-select v5.
  dispatchMouseSequence(pick.el);
  await wait(16);
  return pick.text;
}

/**
 * Open the menu, find the option matching `desired`, mousedown it. Returns
 * the actual text written, or null if nothing matched.
 *
 * Falls back to `pickSelectDefault`-style logic when `desired` isn't in
 * the option list — same deterministic behavior as native selects.
 */
async function fillReactSelectWidget(
  widget: ReactSelectWidget,
  category: Category,
  data: BidPayload,
): Promise<string | null> {
  // 1. Open the menu.
  widget.input.focus();
  dispatchMouseSequence(widget.control);
  const menu = await waitForReactSelectMenu(widget);
  if (!menu) {
    widget.input.blur();
    return null;
  }
  const options = readReactSelectOptions(menu);
  if (options.length === 0) {
    widget.input.blur();
    return null;
  }

  // 2. Resolve target option.
  let pick: { el: HTMLElement; text: string } | null = null;
  if (category !== 'unknown') {
    const desired = valueForCategory(category, data);
    if (desired) {
      pick = matchReactSelectOption(options, desired);
    }
  }
  if (!pick) {
    // Label-based fallback. Reuse pickSelectDefault by feeding it a tiny
    // synthetic <select> built from our options so the same regex layer
    // gets to decide.
    const fallbackText = pickReactSelectDefault(widget.labelText, options);
    if (fallbackText) {
      pick = options.find((o) => o.text === fallbackText) ?? null;
    }
  }
  if (!pick) {
    // Close the menu by mousedown-ing outside (blur is enough for react-select).
    widget.input.blur();
    return null;
  }

  // 3. Click the option. react-select v5 commits on mousedown.
  dispatchMouseSequence(pick.el);
  // Give react a tick to apply state, then verify by looking for the value.
  await wait(16);
  return pick.text;
}

/**
 * Mirror of pickSelectDefault for react-select widgets. Takes the literal
 * option text strings (already extracted from the open menu).
 */
function pickReactSelectDefault(
  labelText: string,
  options: Array<{ el: HTMLElement; text: string }>,
): string | null {
  if (!labelText) return null;
  if (options.length === 0) return null;
  const label = labelText.toLowerCase();

  const optTexts = options.map((o) => o.text);
  const pickByMatcher = (m: (s: string) => boolean): string | null => {
    for (const t of optTexts) {
      if (m(t.trim().toLowerCase())) return t;
    }
    return null;
  };
  // Same predicates as the native picker — go through canonicalOf so the
  // synonym layer covers "I do not have a disability", "I am not a
  // protected veteran", "I prefer not to answer", etc.
  const isNo = (s: string): boolean => canonicalOf(s) === 'no' || RE_NO.test(s);
  const isYes = (s: string): boolean => canonicalOf(s) === 'yes' || RE_YES.test(s);
  const isPnts = (s: string): boolean =>
    canonicalOf(s) === 'prefer-not-to-say' || RE_PNTS.test(s);

  // Age over 18 first — beats the generic isEEO/PNTS branch.
  if (
    /\b(18[-_ ]?(years?[-_ ]?of[-_ ]?age|years?[-_ ]?old|or[-_ ]?older|or[-_ ]?over|\+)|of[-_ ]?legal[-_ ]?(working[-_ ]?)?age|at[-_ ]?least[-_ ]?18|over[-_ ]?18|minimum[-_ ]?age)\b/.test(
      label,
    )
  ) {
    const yes = pickByMatcher(isYes);
    if (yes) return yes;
  }
  const isEEO =
    /\b(race|ethnicity|gender|sex(?:ual)?|transgender|orientation|disability|veteran|protected[-_ ]?veteran|age|pronouns?|hispanic|latino|latinx)\b/.test(
      label,
    );
  if (isEEO) {
    if (
      /\b(disability|disabled|veteran|protected|transgender|hispanic|latino|latinx)\b/.test(label)
    ) {
      const no = pickByMatcher(isNo);
      if (no) return no;
      const pnts = pickByMatcher(isPnts);
      if (pnts) return pnts;
    }
    const pnts = pickByMatcher(isPnts);
    if (pnts) return pnts;
  }
  if (
    /\b(previously[-_ ]?worked|ever[-_ ]?worked|prior[-_ ]?employment|formerly[-_ ]?(worked|employed)|worked[-_ ]?(for|at)[-_ ]?(us|this[-_ ]?company))\b/.test(
      label,
    )
  ) {
    const no = pickByMatcher(isNo);
    if (no) return no;
  }
  if (
    /\b(authorized[-_ ]?to[-_ ]?work|legally[-_ ]?authorized|eligible[-_ ]?to[-_ ]?work|right[-_ ]?to[-_ ]?work)\b/.test(
      label,
    )
  ) {
    const yes = pickByMatcher(isYes);
    if (yes) return yes;
  }
  if (
    /\b(sponsorship|require[-_ ]?(any[-_ ]?form[-_ ]?of[-_ ]?)?(visa|work[-_ ]?permit)|h[-_ ]?1[-_ ]?b)\b/.test(
      label,
    )
  ) {
    const no = pickByMatcher(isNo);
    if (no) return no;
  }
  if (/\b(consent|i[-_ ]?(hereby[-_ ]?)?agree|acknowledge|by[-_ ]?submitting)\b/.test(label)) {
    const yes = pickByMatcher(isYes);
    if (yes) return yes;
  }
  if (
    /\b(do[-_ ]?you[-_ ]?have[-_ ]?(any[-_ ]?|relevant[-_ ]?|prior[-_ ]?)?experience|have[-_ ]?you[-_ ]?worked[-_ ]?(in|with)|are[-_ ]?you[-_ ]?experienced)\b/.test(
      label,
    )
  ) {
    const yes = pickByMatcher(isYes);
    if (yes) return yes;
  }
  return null;
}

/**
 * Run the react-select pass over every widget on the page. Sequential,
 * not parallel — opening multiple menus at once causes race conditions
 * where the first menu collapses before its option is clicked.
 *
 * Failed widgets are returned as AutofillUnmatchedField descriptors keyed
 * by their index in `findReactSelectWidgets()` — the popup can offer the
 * user a manual pick that re-runs the same lookup. Note that `options` is
 * intentionally omitted: peeking at the menu requires opening it, which
 * causes a visible flicker on the page. The popup falls back to the
 * "open the page and fill manually" hint for react-select misses.
 */
async function autofillReactSelects(data: BidPayload): Promise<{
  filled: AutofillFilled[];
  totalFields: number;
  unmatched: AutofillUnmatchedField[];
  pendingQuestions: AutofillPendingQuestion[];
}> {
  const widgets = findReactSelectWidgets();
  const filled: AutofillFilled[] = [];
  const unmatched: AutofillUnmatchedField[] = [];
  const writtenOnce = new Set<Category>();

  for (let widgetIndex = 0; widgetIndex < widgets.length; widgetIndex += 1) {
    const widget = widgets[widgetIndex]!;
    // Synthesize a ClassifiedField using the existing matcher layer.
    const haystack = [
      widget.input.name ?? '',
      widget.input.id ?? '',
      widget.input.getAttribute('aria-label') ?? '',
      widget.labelText,
    ]
      .join(' ')
      .toLowerCase()
      .replace(/\s+/g, ' ');
    let category: Category = 'unknown';
    let best = 0;
    for (const m of MATCHERS) {
      if (m.re.test(haystack) && m.weight > best) {
        best = m.weight;
        category = m.category;
      }
    }
    if (category !== 'unknown' && writtenOnce.has(category)) continue;

    const written = await fillReactSelectWidget(widget, category, data);
    if (written) {
      if (category !== 'unknown') writtenOnce.add(category);
      filled.push({
        category: category === 'unknown' ? 'eeo-default' : category,
        preview: written.length > 80 ? `${written.slice(0, 77)}…` : written,
        selectorHint: widget.labelText.slice(0, 60),
      });
    } else {
      unmatched.push({
        fieldKey: `rs:${widgetIndex}`,
        label: widget.labelText,
        fieldKind: 'react-select',
        selectorHint: widget.labelText.slice(0, 60),
        // `options` deliberately omitted — opening the menu just to peek
        // would flicker the page.
        reason: category === 'unknown' ? 'no-classification' : 'no-value',
      });
    }
  }
  return { filled, totalFields: widgets.length, unmatched, pendingQuestions: [] };
}

// ---------- native radio groups + Yes/No button groups ----------

/**
 * A radio group OR a "button group" (Yes/No boxes styled as buttons) that
 * acts as a single multi-choice answer. `options` carries the visible text
 * of each option in parallel with `elements` (the clickable element per
 * option — radio input or button).
 */
interface ChoiceGroup {
  /** Stable key used to dedupe groups across the page (radio name, or a synthetic id for button groups). */
  key: string;
  /** Text used to classify the group ("Gender", "Are you authorized to work?", etc.). */
  groupLabel: string;
  /** One entry per option, in DOM order. */
  options: Array<{ el: HTMLElement; text: string }>;
  /** True if any option is already selected (we won't overwrite user input). */
  anySelected: boolean;
}

/**
 * Walk up from a radio (or button) to find the group's label. Tries, in
 * order: fieldset > legend, role="radiogroup" aria-labelledby/aria-label,
 * heading sibling above the wrapper, parent's first label/legend/heading.
 */
function findRadioGroupLabel(el: HTMLElement): string {
  // 1. fieldset > legend
  const fs = el.closest('fieldset');
  if (fs) {
    const legend = fs.querySelector(':scope > legend');
    const t = legend?.textContent?.trim();
    if (t) return t;
  }
  // 2. role="radiogroup"
  const rg = el.closest<HTMLElement>('[role="radiogroup"], [role="group"]');
  if (rg) {
    const labelledby = rg.getAttribute('aria-labelledby');
    if (labelledby) {
      const parts = labelledby
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .filter(Boolean);
      if (parts.length > 0) return parts.join(' ');
    }
    const ariaLabel = rg.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
  }
  // 3. Walk up to 4 parents; for each, scan previous-sibling elements for
  // a heading / legend / label / strong / div-with-label-class.
  let p: HTMLElement | null = el.parentElement;
  let hops = 0;
  while (p && hops < 4) {
    let prev = p.previousElementSibling;
    let scans = 0;
    while (prev && scans < 4) {
      const tag = prev.tagName.toLowerCase();
      const cls = (prev.className ?? '').toString().toLowerCase();
      const looksLikeLabel =
        ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'legend', 'label', 'strong', 'b'].includes(tag) ||
        /label|title|question|heading|prompt/.test(cls);
      if (looksLikeLabel) {
        const t = prev.textContent?.trim();
        if (t && t.length > 0 && t.length < 300) return t;
      }
      prev = prev.previousElementSibling;
      scans += 1;
    }
    // Also check the parent's first non-form-child label/heading.
    for (const child of Array.from(p.children)) {
      if (child === el || (child as HTMLElement).contains(el)) continue;
      const tag = child.tagName.toLowerCase();
      const cls = ((child as HTMLElement).className ?? '').toString().toLowerCase();
      if (
        ['legend', 'label', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'p'].includes(
          tag,
        ) ||
        /label|title|question|heading|prompt/.test(cls)
      ) {
        const t = child.textContent?.trim();
        if (t && t.length > 0 && t.length < 300) return t;
      }
    }
    p = p.parentElement;
    hops += 1;
  }
  return '';
}

/**
 * Enumerate every native radio group on the page. Radios are grouped by
 * `name` attribute (the standard browser grouping). Anonymous radios — no
 * `name` — are skipped (rare and can't be safely picked anyway).
 */
function findNativeRadioGroups(): ChoiceGroup[] {
  const radios = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
  ).filter((r) => {
    if (r.disabled) return false;
    if (!r.name) return false;
    // Forms commonly hide the native radio with CSS (`appearance: none` +
    // 1×1 absolute) and show a styled label — accept the radio if either
    // it OR its wrapping label is visible.
    if (isVisible(r)) return true;
    if (r.parentElement && isVisible(r.parentElement)) return true;
    return false;
  });

  const byName = new Map<string, HTMLInputElement[]>();
  for (const r of radios) {
    if (!byName.has(r.name)) byName.set(r.name, []);
    byName.get(r.name)!.push(r);
  }

  const groups: ChoiceGroup[] = [];
  for (const [name, members] of byName) {
    const first = members[0];
    if (!first) continue;
    const groupLabel = findRadioGroupLabel(first);
    const options = members.map((r) => ({
      el: r as HTMLElement,
      text: optionLabelForRadio(r),
    }));
    groups.push({
      key: `radio:${name}`,
      groupLabel,
      options,
      anySelected: members.some((r) => r.checked),
    });
  }
  return groups;
}

/**
 * Group native <input type="checkbox"> elements by name attribute, the same
 * way findNativeRadioGroups does. Each group is treated as one ChoiceGroup
 * so it flows through autofillChoiceGroups uniformly — classify by group
 * label, match the user's value against option labels, click the matching
 * checkbox(es). For "select all that apply" groups where the user has a
 * single value (e.g. demographics.race = "White"), only the matching
 * checkbox is clicked; siblings stay unchecked, which is the intended
 * behaviour. Standalone checkboxes without a `name` attribute are skipped
 * (they're usually one-off consent boxes).
 */
function findNativeCheckboxGroups(): ChoiceGroup[] {
  const boxes = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  ).filter((c) => {
    if (c.disabled) return false;
    if (!c.name) return false;
    if (isVisible(c)) return true;
    if (c.parentElement && isVisible(c.parentElement)) return true;
    return false;
  });

  const byName = new Map<string, HTMLInputElement[]>();
  for (const c of boxes) {
    if (!byName.has(c.name)) byName.set(c.name, []);
    byName.get(c.name)!.push(c);
  }

  const groups: ChoiceGroup[] = [];
  for (const [name, members] of byName) {
    const first = members[0];
    if (!first) continue;
    const groupLabel = findRadioGroupLabel(first);
    // Use the same label-finder helpers as radios — checkbox-and-label
    // patterns are identical at the DOM level (label[for=id], wrapping
    // <label>, aria-label, value, name).
    const options = members.map((c) => ({
      el: c as HTMLElement,
      text: optionLabelForRadio(c),
    }));
    groups.push({
      key: `checkbox:${name}`,
      groupLabel,
      options,
      anySelected: members.some((c) => c.checked),
    });
  }
  return groups;
}

/** Best-effort label for a single radio: associated <label>, wrapping label, value, name. */
function optionLabelForRadio(r: HTMLInputElement): string {
  // <label for="id">
  if (r.id) {
    try {
      const lab = document.querySelector(`label[for="${CSS.escape(r.id)}"]`);
      const t = lab?.textContent?.trim();
      if (t) return t;
    } catch {
      /* ignore */
    }
  }
  // Wrapping <label>
  const wrap = r.closest('label');
  if (wrap?.textContent?.trim()) return wrap.textContent.trim();
  // aria-label
  const aria = r.getAttribute('aria-label')?.trim();
  if (aria) return aria;
  // value attribute
  if (r.value) return r.value;
  return '';
}

/**
 * Discover "button groups" — clusters of <button type="button"> (or
 * role="button" / role="radio") elements that look like an answer picker.
 * Common case: Yes / No box pair under a label.
 *
 * Heuristic: a parent element that:
 *   - contains 2-6 button-like elements with SHORT text (≤30 chars)
 *   - has a label/heading ancestor or sibling identifying the question
 *
 * Returns the group keyed by a synthetic id. Skips groups that include
 * native form-submit buttons (those wouldn't be answer pickers).
 */
function findButtonGroups(): ChoiceGroup[] {
  // Broad candidate set: <button> (any type except submit/reset), elements
  // with explicit button-like roles, anchors-as-buttons, and divs/spans
  // marked tabbable that look like answer pills.
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      [
        'button',
        '[role="button"]',
        '[role="radio"]',
        '[role="option"]',
        'a[role="button"]',
        // Common pattern: clickable <div>/<span> with a class hinting at "option"/"button"/"pill"/"choice".
        'div[class*="option" i], div[class*="button" i], div[class*="pill" i], div[class*="choice" i], div[class*="answer" i]',
        'span[class*="option" i], span[class*="button" i], span[class*="pill" i], span[class*="choice" i]',
      ].join(', '),
    ),
  ).filter((b) => {
    if ((b as HTMLButtonElement).disabled) return false;
    if (!isVisible(b)) return false;
    const tag = b.tagName.toLowerCase();
    // Only reject EXPLICIT type="submit"/"reset" — many ATS forms (Ashby,
    // Workday-style, custom React) use plain <button> with no type
    // attribute for Yes/No pickers. Per the HTML spec, those report
    // `.type === "submit"` via the IDL property, but the literal attribute
    // is null and they're NOT real form submitters in those custom forms.
    if (tag === 'button') {
      const typeAttr = b.getAttribute('type');
      if (typeAttr === 'submit' || typeAttr === 'reset') return false;
    }
    const text = (b.textContent ?? '').trim();
    if (!text) return false;
    if (text.length > 80) return false;
    // Reject obvious form-submit / navigation text so a real submit
    // button never gets grouped with an adjacent button by accident.
    const lower = text.toLowerCase();
    if (
      /^(submit|apply|send|continue|next|save|cancel|back|previous|close|skip|reset|clear|upload|browse|choose file|drag|drop)\b/.test(
        lower,
      )
    ) {
      return false;
    }
    // Drop the parent if it contains another candidate — we want the most
    // specific clickable, not the wrapper.
    if (b.querySelector('button, [role="button"], [role="radio"], [role="option"]')) {
      return false;
    }
    // Drop icon-only / single-char chevrons / close X.
    if (/^[×✕✖xX✗✘+\-→←↑↓]$/.test(text)) return false;
    const aria = b.getAttribute('aria-label')?.toLowerCase() ?? '';
    if (
      /close|toggle|menu|navigation|search|expand|collapse|next|prev|previous|open|dismiss|upload/.test(
        aria,
      )
    ) {
      return false;
    }
    // Drop link buttons that navigate elsewhere.
    if (tag === 'a' && (b as HTMLAnchorElement).href && !/^javascript:/.test((b as HTMLAnchorElement).href)) {
      return false;
    }
    return true;
  });

  // Group by nearest common ancestor that contains 2-4 candidates AND has
  // a label-shaped element above. Capping at 4 (was 6) makes the heuristic
  // stricter — almost every real Yes/No / Yes/No/PNTS picker has exactly
  // 2-3 options. Wider sets are usually unrelated UI buttons.
  const seen = new Set<HTMLElement>();
  const groups: ChoiceGroup[] = [];
  let idx = 0;
  for (const btn of candidates) {
    if (seen.has(btn)) continue;
    let parent: HTMLElement | null = btn.parentElement;
    let chosen: { parent: HTMLElement; siblings: HTMLElement[] } | null = null;
    let lvl = 0;
    while (parent && lvl < 6) {
      const inThisParent = candidates.filter((c) => parent!.contains(c));
      if (inThisParent.length > 4) break; // Too broad to be a single answer group.
      if (inThisParent.length >= 2) {
        chosen = { parent, siblings: inThisParent };
        break;
      }
      parent = parent.parentElement;
      lvl += 1;
    }
    if (!chosen) continue;
    // Require a question-shaped label nearby — drops random pairs of
    // unrelated buttons (e.g. "Edit"/"Delete" toolbars).
    const groupLabel = findRadioGroupLabel(btn);
    if (!groupLabel || groupLabel.length < 4) continue;
    chosen.siblings.forEach((b) => seen.add(b));
    const options = chosen.siblings.map((b) => ({
      el: b,
      text: (b.textContent ?? '').trim() || (b.getAttribute('aria-label') ?? '').trim(),
    }));
    groups.push({
      key: `buttons:${idx++}`,
      groupLabel,
      options,
      anySelected: chosen.siblings.some((b) => {
        if (b.getAttribute('aria-pressed') === 'true') return true;
        if (b.getAttribute('aria-selected') === 'true') return true;
        if (b.getAttribute('aria-checked') === 'true') return true;
        const cls = b.className.toString().toLowerCase();
        if (/\b(selected|active|chosen|checked|on)\b/.test(cls)) return true;
        return false;
      }),
    });
  }
  return groups;
}

/**
 * Find the option whose text best matches `value` using the same ladder
 * as `setSelectValue` / `matchReactSelectOption`. Returns the index or -1.
 */
function findOptionMatch(options: Array<{ text: string }>, value: string): number {
  if (!value) return -1;
  const norm = normalizeForMatch(value);
  if (!norm) return -1;
  const inputCanonical = canonicalOf(value);

  // 1. Exact text match
  let idx = options.findIndex((o) => normalizeForMatch(o.text) === norm);
  if (idx >= 0) return idx;
  // 2. Synonym canonical
  if (inputCanonical) {
    idx = options.findIndex((o) => canonicalOf(o.text) === inputCanonical);
    if (idx >= 0) return idx;
  }
  // 3, 4, 5 — substring fallbacks, skipped for short yes/no tokens.
  if (shouldSkipContains(value, inputCanonical)) return -1;
  idx = options.findIndex((o) => normalizeForMatch(o.text).includes(norm));
  if (idx >= 0) return idx;
  idx = options.findIndex((o) => {
    const t = normalizeForMatch(o.text);
    return t.length >= 2 && norm.includes(t);
  });
  if (idx >= 0) return idx;
  idx = options.findIndex((o) => normalizeForMatch(o.text).startsWith(`${norm} `));
  return idx;
}

/**
 * Same EEO / yes-no fallback as the select pickers, but takes a flat list
 * of option texts (the radio/button options).
 */
function pickGroupDefault(labelText: string, optionTexts: string[]): string | null {
  if (!labelText || optionTexts.length === 0) return null;
  const label = labelText.toLowerCase();

  const isNo = (s: string): boolean => canonicalOf(s) === 'no' || RE_NO.test(s);
  const isYes = (s: string): boolean => canonicalOf(s) === 'yes' || RE_YES.test(s);
  const isPnts = (s: string): boolean =>
    canonicalOf(s) === 'prefer-not-to-say' || RE_PNTS.test(s);
  const pick = (m: (s: string) => boolean): string | null => {
    for (const t of optionTexts) {
      if (m(t.trim().toLowerCase())) return t;
    }
    return null;
  };

  // Age over 18 first — must beat the generic isEEO/PNTS branch since
  // "age" is in the EEO regex.
  if (
    /\b(18[-_ ]?(years?[-_ ]?of[-_ ]?age|years?[-_ ]?old|or[-_ ]?older|or[-_ ]?over|\+)|of[-_ ]?legal[-_ ]?(working[-_ ]?)?age|at[-_ ]?least[-_ ]?18|over[-_ ]?18|minimum[-_ ]?age)\b/.test(
      label,
    )
  ) {
    const yes = pick(isYes);
    if (yes) return yes;
  }
  const isEEO =
    /\b(race|ethnicity|gender|sex(?:ual)?|transgender|orientation|disability|veteran|protected[-_ ]?veteran|age|pronouns?|hispanic|latino|latinx)\b/.test(
      label,
    );
  if (isEEO) {
    if (
      /\b(disability|disabled|veteran|protected|transgender|hispanic|latino|latinx)\b/.test(label)
    ) {
      const no = pick(isNo);
      if (no) return no;
      const pnts = pick(isPnts);
      if (pnts) return pnts;
    }
    const pnts = pick(isPnts);
    if (pnts) return pnts;
  }
  if (
    /\b(previously[-_ ]?worked|ever[-_ ]?worked|prior[-_ ]?employment|formerly[-_ ]?(worked|employed)|worked[-_ ]?(for|at)[-_ ]?(us|this[-_ ]?company))\b/.test(
      label,
    )
  ) {
    const no = pick(isNo);
    if (no) return no;
  }
  if (
    /\b(authorized[-_ ]?to[-_ ]?work|legally[-_ ]?authorized|eligible[-_ ]?to[-_ ]?work|right[-_ ]?to[-_ ]?work|work[-_ ]?(lawfully|authorization))\b/.test(
      label,
    )
  ) {
    const yes = pick(isYes);
    if (yes) return yes;
  }
  if (
    /\b(sponsorship|require[-_ ]?(any[-_ ]?form[-_ ]?of[-_ ]?)?(visa|work[-_ ]?permit)|h[-_ ]?1[-_ ]?b|change[-_ ]?of[-_ ]?status|immigration[-_ ]?sponsorship|permanent[-_ ]?residence)\b/.test(
      label,
    )
  ) {
    const no = pick(isNo);
    if (no) return no;
  }
  if (/\b(consent|i[-_ ]?(hereby[-_ ]?)?agree|acknowledge|by[-_ ]?submitting)\b/.test(label)) {
    const yes = pick(isYes);
    if (yes) return yes;
  }
  if (
    /\b(do[-_ ]?you[-_ ]?have[-_ ]?(any[-_ ]?|relevant[-_ ]?|prior[-_ ]?)?experience|have[-_ ]?you[-_ ]?worked[-_ ]?(in|with)|are[-_ ]?you[-_ ]?experienced)\b/.test(
      label,
    )
  ) {
    const yes = pick(isYes);
    if (yes) return yes;
  }
  return null;
}

/**
 * Run the radio + button-group pass. For each group: classify by the
 * group label, resolve a value from data, pick the matching option and
 * click it. Falls back to label-based deterministic defaults like the
 * select handlers do — never queues for the LLM.
 */
function autofillChoiceGroups(data: BidPayload): {
  filled: AutofillFilled[];
  totalFields: number;
  unmatched: AutofillUnmatchedField[];
  pendingQuestions: AutofillPendingQuestion[];
} {
  const groups = [
    ...findNativeRadioGroups(),
    ...findNativeCheckboxGroups(),
    ...findButtonGroups(),
  ];
  const filled: AutofillFilled[] = [];
  const unmatched: AutofillUnmatchedField[] = [];
  const writtenOnce = new Set<Category>();

  for (const group of groups) {
    if (group.anySelected) continue;

    // Two-stage classification:
    //   1. Match against the GROUP LABEL only. This is the strongest signal
    //      ("Race / Ethnicity", "Veteran Status") and avoids false positives
    //      where option texts ("Hispanic or Latino" inside a race group)
    //      misroute the entire group.
    //   2. If the label gives nothing, fall back to label + option texts so
    //      generic wrappers ("Choose one") still classify when the options
    //      themselves carry the keywords ("authorized to work").
    const labelHaystack = group.groupLabel.toLowerCase().replace(/\s+/g, ' ');
    let category: Category = 'unknown';
    let best = 0;
    for (const m of MATCHERS) {
      if (m.re.test(labelHaystack) && m.weight > best) {
        best = m.weight;
        category = m.category;
      }
    }
    if (category === 'unknown') {
      const fullHaystack = [group.groupLabel, ...group.options.map((o) => o.text)]
        .join(' ')
        .toLowerCase()
        .replace(/\s+/g, ' ');
      for (const m of MATCHERS) {
        if (m.re.test(fullHaystack) && m.weight > best) {
          best = m.weight;
          category = m.category;
        }
      }
    }
    if (category !== 'unknown' && writtenOnce.has(category)) continue;

    const optionTexts = group.options.map((o) => o.text);
    let chosenIdx = -1;
    let chosenText = '';

    if (category !== 'unknown') {
      const desired = valueForCategory(category, data);
      if (desired) {
        chosenIdx = findOptionMatch(group.options, desired);
        if (chosenIdx >= 0) chosenText = optionTexts[chosenIdx]!;
      }
    }
    if (chosenIdx < 0) {
      const fallback = pickGroupDefault(group.groupLabel, optionTexts);
      if (fallback) {
        chosenIdx = optionTexts.indexOf(fallback);
        if (chosenIdx >= 0) chosenText = fallback;
      }
    }

    if (chosenIdx >= 0) {
      const target = group.options[chosenIdx]!.el;
      // Full mouse-event sequence — react-select v5 (and many other React
      // widgets) commit on `mousedown` rather than `click`, so a plain
      // `.click()` silently no-ops on them.
      try {
        dispatchMouseSequence(target);
      } catch {
        try {
          target.click();
        } catch {
          /* ignore */
        }
      }
      // For native radios, also dispatch input + change so frameworks
      // listening for those events update their state.
      if (target.tagName === 'INPUT') {
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (category !== 'unknown') writtenOnce.add(category);
      filled.push({
        category: category === 'unknown' ? 'eeo-default' : category,
        preview: chosenText.length > 80 ? `${chosenText.slice(0, 77)}…` : chosenText,
        selectorHint: group.groupLabel.slice(0, 60) || group.key,
      });
    } else {
      unmatched.push({
        fieldKey: group.key,
        label: group.groupLabel,
        fieldKind: group.key.startsWith('radio:')
          ? 'radio'
          : group.key.startsWith('checkbox:')
            ? 'checkbox'
            : 'button-group',
        selectorHint: group.groupLabel.slice(0, 60) || group.key,
        options: group.options.map((o) => o.text).filter((t) => t.length > 0),
        reason: category === 'unknown' ? 'no-classification' : 'no-value',
      });
    }
  }
  return { filled, totalFields: groups.length, unmatched, pendingQuestions: [] };
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

  // Picker predicates use the synonym canonicalizer so "I do not have a
  // disability" / "I am not a protected veteran" / "I prefer not to say"
  // all classify correctly without each variant being hand-rolled here.
  const isNo = (s: string): boolean => canonicalOf(s) === 'no' || RE_NO.test(s);
  const isYes = (s: string): boolean => canonicalOf(s) === 'yes' || RE_YES.test(s);
  const isPnts = (s: string): boolean =>
    canonicalOf(s) === 'prefer-not-to-say' || RE_PNTS.test(s);

  // Age over 18 — "Are you 18 years of age or older?" → Yes (virtually
  // every candidate is). Must run BEFORE the generic isEEO/PNTS branch,
  // which would otherwise hit on the word "age" and default to PNTS.
  if (
    /\b(18[-_ ]?(years?[-_ ]?of[-_ ]?age|years?[-_ ]?old|or[-_ ]?older|or[-_ ]?over|\+)|of[-_ ]?legal[-_ ]?(working[-_ ]?)?age|at[-_ ]?least[-_ ]?18|over[-_ ]?18|minimum[-_ ]?age)\b/.test(
      label,
    )
  ) {
    const yes = pickOption(options, isYes);
    if (yes) return yes;
  }

  // EEO-style fallback. Hispanic/Latino is a distinct EEO question — list
  // it explicitly so the binary No-default path runs (rather than
  // PNTS-default for unrecognized EEO).
  const isEEO =
    /\b(race|ethnicity|gender|sex(?:ual)?|transgender|orientation|disability|veteran|protected[-_ ]?veteran|age|pronouns?|hispanic|latino|latinx)\b/.test(
      label,
    );
  if (isEEO) {
    // Binary EEO ("Are you a veteran?", "Do you identify as transgender?",
    // "Do you have a disability?", "Are you Hispanic/Latino?") → "No" first,
    // PNTS as the fallback.
    if (/\b(disability|disabled|veteran|protected|transgender|hispanic|latino|latinx)\b/.test(label)) {
      const no = pickOption(options, isNo);
      if (no) return no;
      const pnts = pickOption(options, isPnts);
      if (pnts) return pnts;
    }
    // Non-binary EEO (race, gender, orientation, age, pronouns) → PNTS.
    const pnts = pickOption(options, isPnts);
    if (pnts) return pnts;
  }

  if (
    /\b(previously[-_ ]?worked|ever[-_ ]?worked|prior[-_ ]?employment|formerly[-_ ]?(worked|employed)|worked[-_ ]?(for|at)[-_ ]?(us|this[-_ ]?company))\b/.test(
      label,
    )
  ) {
    const no = pickOption(options, isNo);
    if (no) return no;
  }
  if (
    /\b(authorized[-_ ]?to[-_ ]?work|legally[-_ ]?authorized|eligible[-_ ]?to[-_ ]?work|right[-_ ]?to[-_ ]?work)\b/.test(
      label,
    )
  ) {
    const yes = pickOption(options, isYes);
    if (yes) return yes;
  }
  if (
    /\b(sponsorship|require[-_ ]?(any[-_ ]?form[-_ ]?of[-_ ]?)?(visa|work[-_ ]?permit)|h[-_ ]?1[-_ ]?b)\b/.test(
      label,
    )
  ) {
    const no = pickOption(options, isNo);
    if (no) return no;
  }
  if (/\b(consent|i[-_ ]?(hereby[-_ ]?)?agree|acknowledge|by[-_ ]?submitting)\b/.test(label)) {
    const yes = pickOption(options, isYes);
    if (yes) return yes;
  }
  if (
    /\b(do[-_ ]?you[-_ ]?have[-_ ]?(any[-_ ]?|relevant[-_ ]?|prior[-_ ]?)?experience|have[-_ ]?you[-_ ]?worked[-_ ]?(in|with)|are[-_ ]?you[-_ ]?experienced)\b/.test(
      label,
    )
  ) {
    const yes = pickOption(options, isYes);
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
 * Sync core: fill every native form field (text inputs, textareas, native
 * selects, radios). Returns a report with `pendingQuestions` for the
 * textareas / inputs that still need an LLM answer.
 *
 * `autofillBidForm` wraps this and runs the async react-select pass on
 * top — together they cover both legacy (Lever, old Greenhouse boards)
 * and the new job-boards.greenhouse.io React UI.
 */
function autofillNativeFields(data: BidPayload): {
  filled: AutofillFilled[];
  totalFields: number;
  unmatched: AutofillUnmatchedField[];
  pendingQuestions: AutofillPendingQuestion[];
} {
  const candidates = selectAllFields();
  const filled: AutofillFilled[] = [];
  const pending: AutofillPendingQuestion[] = [];
  const unmatched: AutofillUnmatchedField[] = [];

  const writtenOnce = new Set<Category>();
  const allowDuplicates = new Set<Category>(['cover-letter', 'summary']);

  /** Push an unmatched descriptor for an input/textarea at index `i`. */
  const pushUnmatched = (
    el: EditableField,
    cls: ClassifiedField,
    i: number,
    reason: AutofillUnmatchedField['reason'],
  ): void => {
    const tag = el.tagName;
    let kind: AutofillUnmatchedField['fieldKind'] = 'input';
    if (tag === 'TEXTAREA') kind = 'textarea';
    else if (tag === 'SELECT') kind = 'select';
    const desc: AutofillUnmatchedField = {
      fieldKey: `native:${i}`,
      label: cls.labelText || cls.hint,
      fieldKind: kind,
      selectorHint: cls.hint,
      reason,
    };
    if (tag === 'SELECT') {
      desc.options = getSelectOptionTexts(el as HTMLSelectElement);
    }
    unmatched.push(desc);
  };

  const queue = (
    q: AutofillPendingQuestion | null,
    el: EditableField,
    cls: ClassifiedField,
    i: number,
  ): void => {
    if (!q) {
      // Not question-shaped or not a queueable kind — surface for manual pick.
      pushUnmatched(el, cls, i, cls.category === 'unknown' ? 'no-classification' : 'no-value');
      return;
    }
    if (pending.length >= MAX_PENDING_PER_FRAME) {
      pushUnmatched(el, cls, i, 'over-cap');
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
        pushUnmatched(
          el,
          cls,
          i,
          cls.category === 'unknown' ? 'no-classification' : 'option-mismatch',
        );
      }
      continue;
    }

    // ----- INPUT / TEXTAREA path: existing logic, may queue for LLM -----
    if (cls.category === 'unknown') {
      queue(queueAsLLMQuestion(el, cls, i), el, cls, i);
      continue;
    }
    if (writtenOnce.has(cls.category) && !allowDuplicates.has(cls.category)) continue;

    const value = valueForCategory(cls.category, data);
    if (!value) {
      // Matcher hit but the user has no value — queue the textarea/input
      // for LLM Q&A (selects already returned above).
      queue(queueAsLLMQuestion(el, cls, i), el, cls, i);
      continue;
    }

    const ok = writeField(cls, value);
    if (!ok) {
      queue(queueAsLLMQuestion(el, cls, i), el, cls, i);
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
  };
}

/**
 * Public entry point: runs the sync native pass and the async react-select
 * pass and merges the reports. Async because react-select forces us to wait
 * for the dropdown menu to render after we open it.
 *
 * Native and react-select widgets are disjoint by construction
 * (`selectAllFields` filters out the react-select combobox input), so
 * concatenating the `filled` arrays is safe — no double counting.
 */
export async function autofillBidForm(data: BidPayload): Promise<AutofillReport> {
  // Many ATS forms (Ashby, Workday-style, custom React) render Yes/No
  // pickers as plain <button> with no explicit `type` attribute. Per HTML
  // spec, that defaults to `type="submit"` inside a <form>, so a synthetic
  // click would trigger form submission — destroying state mid-autofill.
  // Block submit events during the autofill window. Real form-submit
  // intent only happens after the user clicks "Apply" later, well after
  // this function has returned and the listener has been removed.
  const blockSubmit = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
  };
  document.addEventListener('submit', blockSubmit, true);
  try {
    const native = autofillNativeFields(data);
    const choice = autofillChoiceGroups(data);
    const react = await autofillReactSelects(data);
    return {
      filled: [...native.filled, ...choice.filled, ...react.filled],
      totalFields: native.totalFields + choice.totalFields + react.totalFields,
      unmatchedFields: [...native.unmatched, ...choice.unmatched, ...react.unmatched],
      pendingQuestions: [
        ...native.pendingQuestions,
        ...choice.pendingQuestions,
        ...react.pendingQuestions,
      ],
      ranAt: new Date().toISOString(),
    };
  } finally {
    document.removeEventListener('submit', blockSubmit, true);
  }
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

/**
 * Third-pass writer: apply user-chosen values for fields the engine flagged
 * as `unmatchedFields` on the first pass. Picks are dispatched by
 * `fieldKey` prefix so each pass's id space stays isolated:
 *
 *   - `native:<i>`   — write through the native-input/select writer
 *   - `radio:<name>` — re-find the radio group, click the option whose text
 *                      matches via `findOptionMatch`
 *   - `buttons:<idx>` — re-find the button group, same dispatch as radio
 *   - `rs:<i>`       — re-find the react-select widget, open + pick + close
 *
 * Wrapped in the same submit-blocking guard as `autofillBidForm` so a
 * synthetic click on a typeless `<button>` doesn't submit the form
 * mid-fill. Returns the count of fields actually written.
 */
export async function fillUnmatched(
  picks: Array<{ fieldKey: string; value: string }>,
): Promise<{ filled: number }> {
  const blockSubmit = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
  };
  document.addEventListener('submit', blockSubmit, true);
  try {
    let filled = 0;
    for (const { fieldKey, value } of picks) {
      if (!value) continue;
      if (fieldKey.startsWith('native:')) {
        const idx = Number(fieldKey.slice('native:'.length));
        if (!Number.isFinite(idx)) continue;
        const el = selectAllFields()[idx];
        if (!el) continue;
        if (el.disabled || (el as HTMLInputElement).readOnly) continue;
        if (el.tagName === 'SELECT') {
          if (setSelectValue(el as HTMLSelectElement, value)) filled += 1;
        } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          setNativeInputValue(el as HTMLInputElement | HTMLTextAreaElement, value);
          filled += 1;
        }
        continue;
      }

      if (fieldKey.startsWith('radio:')) {
        const groups = findNativeRadioGroups();
        const group = groups.find((g) => g.key === fieldKey);
        if (!group) continue;
        const chosenIdx = findOptionMatch(group.options, value);
        if (chosenIdx < 0) continue;
        const target = group.options[chosenIdx]!.el;
        try {
          dispatchMouseSequence(target);
        } catch {
          try {
            target.click();
          } catch {
            /* ignore */
          }
        }
        if (target.tagName === 'INPUT') {
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
        }
        filled += 1;
        continue;
      }

      if (fieldKey.startsWith('checkbox:')) {
        // Mirrors the radio path. For "select all that apply" the popup
        // sends one CS_FILL_UNMATCHED per chosen option, so click here is
        // a single toggle — no multi-pick logic needed at this layer.
        const groups = findNativeCheckboxGroups();
        const group = groups.find((g) => g.key === fieldKey);
        if (!group) continue;
        const chosenIdx = findOptionMatch(group.options, value);
        if (chosenIdx < 0) continue;
        const target = group.options[chosenIdx]!.el;
        try {
          dispatchMouseSequence(target);
        } catch {
          try {
            target.click();
          } catch {
            /* ignore */
          }
        }
        if (target.tagName === 'INPUT') {
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
        }
        filled += 1;
        continue;
      }

      if (fieldKey.startsWith('buttons:')) {
        const groups = findButtonGroups();
        const group = groups.find((g) => g.key === fieldKey);
        if (!group) continue;
        const chosenIdx = findOptionMatch(group.options, value);
        if (chosenIdx < 0) continue;
        const target = group.options[chosenIdx]!.el;
        try {
          dispatchMouseSequence(target);
        } catch {
          try {
            target.click();
          } catch {
            /* ignore */
          }
        }
        if (target.tagName === 'INPUT') {
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
        }
        filled += 1;
        continue;
      }

      if (fieldKey.startsWith('rs:')) {
        const idx = Number(fieldKey.slice('rs:'.length));
        if (!Number.isFinite(idx)) continue;
        const widgets = findReactSelectWidgets();
        const widget = widgets[idx];
        if (!widget) continue;
        const written = await pickReactSelectOption(widget, value);
        if (written) filled += 1;
        continue;
      }
    }
    return { filled };
  } finally {
    document.removeEventListener('submit', blockSubmit, true);
  }
}
