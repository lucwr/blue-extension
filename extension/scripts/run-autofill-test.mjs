/**
 * Smoke test for the bid-form autofill engine against a Greenhouse-shaped
 * application form rendered inside a cross-origin-style iframe (srcdoc).
 *
 * Pipeline:
 *   1. esbuild bundles src/content/autofill.ts as an IIFE that assigns
 *      the engine onto window.__autofillEngine.
 *   2. puppeteer-core launches Chrome and opens a generated HTML page whose
 *      iframe holds the form.
 *   3. The bundle is injected into the iframe via page.frames()[1].evaluate.
 *   4. autofillBidForm(data) runs inside the iframe and the test reads the
 *      resulting field values + the returned report.
 *
 * Usage:  node extension/scripts/run-autofill-test.mjs
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import esbuild from 'esbuild';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');

// ----- 1. Build the autofill engine as an IIFE -----
const buildResult = await esbuild.build({
  entryPoints: [path.join(PKG_ROOT, 'src/content/autofill.ts')],
  bundle: true,
  format: 'iife',
  globalName: '__autofillEngine',
  platform: 'browser',
  target: 'chrome114',
  write: false,
  tsconfig: path.join(PKG_ROOT, 'tsconfig.json'),
});
const engineSrc = buildResult.outputFiles[0].text;
console.log(`Built engine bundle: ${engineSrc.length} chars`);

// ----- 2. Test page with a Greenhouse-shaped form in an iframe -----
const SAMPLE_DATA = {
  contact: {
    fullName: 'Jane Q. Doe',
    email: 'jane.doe@example.com',
    phone: '+1 (415) 555-0142',
    location: 'San Francisco, USA',
    linkedin: 'https://linkedin.com/in/janedoe',
    github: 'https://github.com/janedoe',
    website: 'https://janedoe.dev',
  },
  targetTitle: 'Senior Software Engineer',
  summary: 'Engineer with 10y building distributed systems.',
  yearsOfExperience: 10,
  proposal: {
    subject: 'Application — Senior Software Engineer',
    opener: 'I read the role with interest.',
    body: ['Body paragraph one.', 'Body paragraph two.'],
    highlights: ['Built X', 'Shipped Y'],
    closer: 'Happy to chat further.',
  },
  // Matches the user's sample answer set verbatim:
  //   gender: man  → "Male" via Male/Man synonym
  //   disability: no, veteran: no, transgender: no, sponsorship: no
  //   work auth (Canada/USA): yes
  //   race: White
  demographics: {
    workAuthorizedUS: 'yes',
    requiresSponsorshipUS: 'no',
    gender: 'Male',
    race: 'White',
    veteran: 'no',
    disability: 'no',
    transgender: 'no',
    hispanicLatino: 'no',
    pronouns: 'he/him',
  },
  // Defaults for the non-EEO custom questions:
  //   prior employment: no, relevant experience: yes,
  //   how did you hear: Job board, degree: Bachelor's, over18: yes
  bidPreferences: {
    priorEmployment: 'no',
    hasRelevantExperience: 'yes',
    howDidYouHear: 'Job board',
    salaryExpectation: '$130,000 - $160,000',
    highestDegree: "Bachelor's Degree",
    over18: 'yes',
    ageRange: '30-35',
  },
};

const TEST_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>autofill test</title></head>
<body>
  <div id="status">running…</div>
  <iframe id="appform" style="width:100%;height:1200px;border:1px solid #ccc" srcdoc='
    <!doctype html>
    <html><head><meta charset="utf-8"></head><body>
      <form id="application">
        <div><label for="first_name">First Name *</label>
          <input id="first_name" name="job_application[first_name]" type="text"></div>
        <div><label for="last_name">Last Name *</label>
          <input id="last_name" name="job_application[last_name]" type="text"></div>
        <div><label for="email">Email *</label>
          <input id="email" name="job_application[email]" type="email"></div>
        <div><label for="phone">Phone</label>
          <input id="phone" name="job_application[phone]" type="tel"></div>
        <div><label for="linkedin">LinkedIn Profile</label>
          <input id="linkedin" name="job_application[urls][LinkedIn]" type="url"></div>
        <div><label for="website">Website</label>
          <input id="website" name="job_application[urls][Website]" type="url"></div>
        <!-- "Do you identify as transgender?" — separate Greenhouse question -->
        <div><label for="transgender">Do you identify as transgender?</label>
          <select id="transgender" name="job_application[transgender]">
            <option value="">Select…</option>
            <option value="1">Yes</option>
            <option value="2">No</option>
            <option value="3">Prefer not to say</option>
          </select></div>
        <!-- Sponsorship — phrased differently than the work-auth question above -->
        <div><label for="sponsorship">Will you, now or in the future, require sponsorship for employment visa status (e.g. H-1B)? *</label>
          <select id="sponsorship" name="job_application[sponsorship]">
            <option value="">Select…</option>
            <option value="1">Yes</option>
            <option value="2">No</option>
          </select></div>
        <!-- "Do you have experience with X?" — relevant-experience matcher -->
        <div><label for="exp_in">Do you have experience in distributed systems and cloud platforms? *</label>
          <select id="exp_in" name="job_application[experience_yes_no]">
            <option value="">Select…</option>
            <option value="1">Yes</option>
            <option value="2">No</option>
          </select></div>
        <div><label for="why">Why are you interested in this role at Tucows?</label>
          <textarea id="why" name="job_application[why]" rows="5"></textarea></div>
        <div><label for="cover">Cover Letter</label>
          <textarea id="cover" name="job_application[cover_letter_text]" rows="8"></textarea></div>
        <div><label for="canusa_auth">Are you legally authorized to work in either Canada or the USA for any employer, for up to 37.5 hours per week? *</label>
          <select id="canusa_auth" name="job_application[answers_attributes][0][text_value]">
            <option value="">Select…</option>
            <option value="1">Yes</option>
            <option value="2">No</option>
          </select></div>
        <div><label for="prior_tucows">Have you previously worked for Tucows or any of its subsidiaries (Ting, Domains, Wavelo) directly or through an agency/contractor? *</label>
          <select id="prior_tucows" name="job_application[answers_attributes][1][text_value]">
            <option value="">Select…</option>
            <option value="1">Yes</option>
            <option value="2">No</option>
          </select></div>
        <div><label for="hear">How did you hear about the opportunity? *</label>
          <select id="hear" name="job_application[answers_attributes][2][text_value]">
            <option value="">Select…</option>
            <option value="1">LinkedIn</option>
            <option value="2">Company website</option>
            <option value="3">Referral</option>
            <option value="4">Other</option>
          </select></div>
        <div><label for="salary">What are your salary expectations? *</label>
          <input id="salary" name="job_application[answers_attributes][3][text_value]" type="text"></div>
        <div><label for="consent">By submitting my application, I consent to the collection, use, disclosure, and cross-border transfer (if applicable) of my personal data as described in the Tucows.com Co Careers Privacy Policy. *</label>
          <select id="consent" name="job_application[answers_attributes][4][text_value]">
            <option value="">Select…</option>
            <option value="1">Yes</option>
            <option value="2">No</option>
          </select></div>
        <!-- Greenhouse "verbose phrasing" EEO selects — match via label-based
             fallback when demographics are blank, or via the regular
             matchers + synonym layer when they are set. -->
        <div><label for="age">What is your age?</label>
          <select id="age" name="job_application[age]">
            <option value="">Select…</option>
            <option value="1">Under 18</option>
            <option value="2">18-24</option>
            <option value="3">25-34</option>
            <option value="4">35-44</option>
            <option value="5">45-54</option>
            <option value="6">55+</option>
            <option value="7">Prefer not to say</option>
          </select></div>
        <div><label for="race_multi">I identify my race as (select all that apply)</label>
          <select id="race_multi" name="job_application[race_multi]" multiple>
            <option value="1">Asian</option>
            <option value="2">Black or African American</option>
            <option value="3">Hispanic or Latino</option>
            <option value="4">Native American or Alaska Native</option>
            <option value="5">Native Hawaiian or Other Pacific Islander</option>
            <option value="6">White</option>
            <option value="7">Two or more races</option>
            <option value="8">Prefer not to say</option>
          </select></div>
        <div><label for="gender_verbose">What gender do you identify as?</label>
          <select id="gender_verbose" name="job_application[gender_verbose]">
            <option value="">Select…</option>
            <option value="1">Woman</option>
            <option value="2">Man</option>
            <option value="3">Non-binary</option>
            <option value="4">Prefer to self-describe</option>
            <option value="5">Prefer not to say</option>
          </select></div>
        <div><label for="orientation">What sexual orientation do you identify with?</label>
          <select id="orientation" name="job_application[orientation]">
            <option value="">Select…</option>
            <option value="1">Straight / Heterosexual</option>
            <option value="2">Gay or Lesbian</option>
            <option value="3">Bisexual</option>
            <option value="4">Other</option>
            <option value="5">Prefer not to say</option>
          </select></div>
        <div><label for="disability_verbose">Do you identify as having or previously having a disability?</label>
          <select id="disability_verbose" name="job_application[disability_verbose]">
            <option value="">Select…</option>
            <option value="1">Yes, I have a disability (or previously had a disability)</option>
            <option value="2">No, I do not have a disability and have not had one in the past</option>
            <option value="3">I do not wish to answer</option>
          </select></div>
        <div><label for="veteran_verbose">Are you a protected veteran?</label>
          <select id="veteran_verbose" name="job_application[veteran_verbose]">
            <option value="">Select…</option>
            <option value="1">Yes, I am a protected veteran</option>
            <option value="2">No, I am not a protected veteran</option>
            <option value="3">I do not wish to answer</option>
          </select></div>
        <!-- DUPLICATE FIELDS — second First Name, second Email, second Phone,
             second native Gender SELECT. Forms sometimes repeat the same
             item (e.g. a confirmation block at the bottom, or a primary
             vs. preferred-contact section). The engine must fill EVERY
             matching field, not just the first occurrence. -->
        <div><label for="first_name_2">First Name (confirm)</label>
          <input id="first_name_2" name="job_application[first_name_confirm]" type="text"></div>
        <div><label for="email_2">Email (confirm)</label>
          <input id="email_2" name="job_application[email_confirm]" type="email"></div>
        <div><label for="phone_2">Mobile phone</label>
          <input id="phone_2" name="job_application[phone_alt]" type="tel"></div>
        <div><label for="gender_2">Gender (self-identify)</label>
          <select id="gender_2" name="job_application[gender_self_id]">
            <option value="">Select…</option>
            <option value="1">Female</option>
            <option value="2">Male</option>
            <option value="3">Non-binary</option>
            <option value="4">Prefer not to say</option>
          </select></div>
      </form>
    </body></html>
  '></iframe>
</body>
</html>`;

// ----- 3. Launch Chrome -----
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
    : null,
].filter(Boolean);
const chromePath = CHROME_CANDIDATES.find((p) => p && existsSync(p));
if (!chromePath) {
  console.error('FAIL: could not locate Chrome. Set CHROME_PATH env var.');
  process.exit(1);
}
console.log('Using Chrome at:', chromePath);

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

let exitCode = 0;
try {
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.log('  [page error]', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`  [page ${msg.type()}]`, msg.text());
  });

  await page.setContent(TEST_HTML, { waitUntil: 'networkidle0' });

  // Wait for the iframe to mount and become available.
  await page.waitForSelector('iframe#appform');
  const iframeHandle = await page.$('iframe#appform');
  const frame = await iframeHandle.contentFrame();
  if (!frame) throw new Error('iframe contentFrame() returned null');

  // Wait until the form is in the iframe DOM.
  await frame.waitForSelector('#application');

  // 4. Inject the engine bundle into the iframe and run it.
  await frame.evaluate((src) => {
    const s = document.createElement('script');
    s.textContent = src;
    document.head.appendChild(s);
  }, engineSrc);

  const result = await frame.evaluate((data) => {
    // esbuild iife with globalName "__autofillEngine" exposes module exports
    // on window.__autofillEngine — including autofillBidForm.
    // eslint-disable-next-line no-undef
    return window.__autofillEngine.autofillBidForm(data);
  }, SAMPLE_DATA);

  // 5. Read the resulting field values inside the iframe.
  const formState = await frame.evaluate(() => {
    const v = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      if (el.tagName === 'SELECT') {
        const selectedTexts = Array.from(el.selectedOptions).map((o) => o.text);
        return {
          selectedText: selectedTexts[0] ?? '',
          selectedTexts,
          value: el.value,
        };
      }
      return { value: el.value };
    };
    return {
      first_name: v('#first_name'),
      last_name: v('#last_name'),
      email: v('#email'),
      phone: v('#phone'),
      linkedin: v('#linkedin'),
      website: v('#website'),
      cover: v('#cover'),
      why: v('#why'),
      transgender: v('#transgender'),
      sponsorship: v('#sponsorship'),
      exp_in: v('#exp_in'),
      canusa_auth: v('#canusa_auth'),
      prior_tucows: v('#prior_tucows'),
      hear: v('#hear'),
      salary: v('#salary'),
      consent: v('#consent'),
      age: v('#age'),
      race_multi: v('#race_multi'),
      gender_verbose: v('#gender_verbose'),
      orientation: v('#orientation'),
      disability_verbose: v('#disability_verbose'),
      veteran_verbose: v('#veteran_verbose'),
      first_name_2: v('#first_name_2'),
      email_2: v('#email_2'),
      phone_2: v('#phone_2'),
      gender_2: v('#gender_2'),
    };
  });

  console.log('Engine report:', JSON.stringify(result, null, 2));
  console.log('Form state:', JSON.stringify(formState, null, 2));

  // 6. Assertions. Every one of the user's 11 sample questions should now
  // be answered deterministically from demographics + bidPreferences — no
  // LLM round trip required for any of them.
  const assertions = [
    // Basic contact + name parts (sanity that fan-out + iframe still work).
    ['first name = Jane', formState.first_name?.value === 'Jane'],
    ['last name = Q. Doe', formState.last_name?.value === 'Q. Doe'],
    ['email = jane.doe@example.com', formState.email?.value === 'jane.doe@example.com'],
    ['phone filled', formState.phone?.value?.length > 0],
    ['linkedin filled', /linkedin\.com/.test(formState.linkedin?.value ?? '')],
    ['website filled', /janedoe\.dev/.test(formState.website?.value ?? '')],

    // --- The 11 sample Q&A entries the user listed (verbose phrasings) ---

    // 1. "what is your gender: man" → demographics.gender="Male" → "Man" via synonym
    ['gender_verbose select = Man', formState.gender_verbose?.selectedText === 'Man'],

    // 2. "do you consider yourself a person with a disability? : no"
    [
      'disability_verbose select starts with "No"',
      /^No/i.test(formState.disability_verbose?.selectedText ?? ''),
    ],

    // 3. "are you a veteran? : no"
    //    Profile stores "no"; the Greenhouse option is "No, I am not a
    //    protected veteran" — synonym-canonical "no" matches "No, I am not…".
    [
      'veteran_verbose select matches "No, I am not a protected veteran"',
      /not a protected veteran/i.test(formState.veteran_verbose?.selectedText ?? ''),
    ],

    // 4. "how did you hear about this opportunity? : job board"
    //    bidPreferences.howDidYouHear="Job board"; option list is
    //    LinkedIn / Company website / Referral / Other. None say "Job board"
    //    exactly, so the engine should leave it for manual fill — NOT
    //    queue it for the LLM (selects are deterministic-only now).
    [
      '"How did you hear" is NOT queued for LLM (selects are deterministic-only)',
      !result.pendingQuestions.some((q) => q.fieldKind === 'select'),
    ],

    // 5. "are you legally authorized to work …: yes"
    ['Canada/USA work-auth select = Yes', formState.canusa_auth?.selectedText === 'Yes'],

    // 6. "have you previously worked for any company? : no"
    [
      'prior-employment select = No',
      formState.prior_tucows?.selectedText === 'No',
    ],

    // 7. (duplicate of 2 in the user's list — covered above)

    // 8. "will you, now or in the future, require sponsorship …? : no"
    ['sponsorship select = No', formState.sponsorship?.selectedText === 'No'],

    // 9. "do you have experience in something? : yes"
    ['relevant-experience select = Yes', formState.exp_in?.selectedText === 'Yes'],

    // 10. "what is your race? : White" — multi-select "select all that apply"
    [
      'race_multi includes White (multi-select)',
      formState.race_multi?.selectedTexts?.includes('White'),
    ],

    // 11. "do you identify as transgender? : no"
    ['transgender select = No', formState.transgender?.selectedText === 'No'],

    // --- The fields outside the user's 11 (cover letter + LLM-bound items) ---

    ['cover letter populated', (formState.cover?.value?.length ?? 0) > 50],
    [
      '"why" textarea queued for LLM',
      result.pendingQuestions.some((q) => /why/i.test(q.question) && q.fieldKind === 'textarea'),
    ],
    [
      'salary input filled deterministically from bidPreferences',
      formState.salary?.value?.includes('$130,000'),
    ],
    // Consent select — no built-in matcher, but pickSelectDefault routes
    // /consent|by submitting/ → "Yes". Should be filled deterministically.
    ['consent select = Yes (deterministic default)', formState.consent?.selectedText === 'Yes'],

    // Age has no value in demographics → EEO fallback picks "Prefer not to say"
    ['age select = Prefer not to say (EEO fallback)', formState.age?.selectedText === 'Prefer not to say'],
    // Sexual orientation has no built-in matcher → EEO fallback picks "Prefer not to say"
    [
      'orientation select = Prefer not to say (EEO fallback)',
      formState.orientation?.selectedText === 'Prefer not to say',
    ],
    // Pending questions: nothing in the report should have fieldKind='select'
    [
      'NO selects went to the LLM queue (deterministic-only)',
      result.pendingQuestions.every((q) => q.fieldKind !== 'select'),
    ],

    // Sanity: the engine report agrees with the form-state side.
    ['totalFields > 0', result.totalFields > 0],
    ['filled report has gender entry', result.filled.some((f) => f.category === 'gender')],
    ['filled report has race entry', result.filled.some((f) => f.category === 'race')],
    ['filled report has prior-employment entry', result.filled.some((f) => f.category === 'prior-employment')],
    ['filled report has transgender entry', result.filled.some((f) => f.category === 'transgender')],
    ['filled report has eeo-default (age/orientation)', result.filled.some((f) => f.category === 'eeo-default')],

    // --- Duplicate-field fills: every matching field gets the same value ---
    ['DUPLICATE: second First Name input also fills', formState.first_name_2?.value === 'Jane'],
    [
      'DUPLICATE: second Email input also fills',
      formState.email_2?.value === 'jane.doe@example.com',
    ],
    ['DUPLICATE: second Phone input also fills', formState.phone_2?.value?.length > 0],
    ['DUPLICATE: second Gender SELECT also fills', formState.gender_2?.selectedText === 'Male'],
  ];

  let passed = 0;
  for (const [msg, ok] of assertions) {
    console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
    if (ok) passed += 1;
  }
  let failed = assertions.length - passed;
  let totalRun = assertions.length;

  // ===== SCENARIO 2 — empty profile =====
  // Verifies that EEO selects still get filled deterministically via the
  // label-based fallback ("Prefer not to say" / safe defaults) even when
  // the user hasn't saved demographics yet. Use a brand-new page rather
  // than reusing the first one — setContent on a populated page reliably
  // hangs on the networkidle0 lifecycle event.
  console.log('\n--- Scenario 2: empty demographics / bidPreferences ---');
  const page2 = await browser.newPage();
  page2.on('pageerror', (err) => console.log('  [page2 error]', err.message));
  await page2.setContent(TEST_HTML, { waitUntil: 'load' });
  await page2.waitForSelector('iframe#appform');
  const iframeHandle2 = await page2.$('iframe#appform');
  const frame2 = await iframeHandle2.contentFrame();
  await frame2.waitForSelector('#application');
  await frame2.evaluate((src) => {
    const s = document.createElement('script');
    s.textContent = src;
    document.head.appendChild(s);
  }, engineSrc);

  const EMPTY_DATA = {
    contact: { fullName: 'Jane Doe', email: 'jd@example.com' },
    targetTitle: 'Engineer',
    summary: 'Engineer.',
    yearsOfExperience: 5,
    // No demographics, no bidPreferences — the deterministic fallback is
    // the only thing that can fill these selects.
  };
  const result2 = await frame2.evaluate(
    (d) => window.__autofillEngine.autofillBidForm(d),
    EMPTY_DATA,
  );
  const formState2 = await frame2.evaluate(() => {
    const v = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      if (el.tagName === 'SELECT') {
        return {
          selectedText: el.selectedOptions[0]?.text ?? '',
          selectedTexts: Array.from(el.selectedOptions).map((o) => o.text),
          value: el.value,
        };
      }
      return { value: el.value };
    };
    return {
      transgender: v('#transgender'),
      sponsorship: v('#sponsorship'),
      exp_in: v('#exp_in'),
      canusa_auth: v('#canusa_auth'),
      prior_tucows: v('#prior_tucows'),
      consent: v('#consent'),
      age: v('#age'),
      gender_verbose: v('#gender_verbose'),
      orientation: v('#orientation'),
      disability_verbose: v('#disability_verbose'),
      veteran_verbose: v('#veteran_verbose'),
    };
  });

  const empties = [
    // EEO selects → "Prefer not to say" (the safe default)
    ['empty: age → Prefer not to say', formState2.age?.selectedText === 'Prefer not to say'],
    ['empty: gender_verbose → Prefer not to say', formState2.gender_verbose?.selectedText === 'Prefer not to say'],
    ['empty: orientation → Prefer not to say', formState2.orientation?.selectedText === 'Prefer not to say'],
    // Binary EEO with empty profile → "No" first (matches the user's
    // explicit sample answers). PNTS is the secondary fallback only when
    // "No" isn't in the option list.
    ['empty: transgender → No', formState2.transgender?.selectedText === 'No'],
    [
      'empty: disability_verbose → "No, I do not have a disability…"',
      /^No, I do not have a disability/i.test(formState2.disability_verbose?.selectedText ?? ''),
    ],
    [
      'empty: veteran_verbose → "No, I am not a protected veteran"',
      formState2.veteran_verbose?.selectedText === 'No, I am not a protected veteran',
    ],
    // Non-EEO labelled selects
    ['empty: work auth → Yes', formState2.canusa_auth?.selectedText === 'Yes'],
    ['empty: sponsorship → No', formState2.sponsorship?.selectedText === 'No'],
    ['empty: prior employment → No', formState2.prior_tucows?.selectedText === 'No'],
    ['empty: relevant experience → Yes', formState2.exp_in?.selectedText === 'Yes'],
    ['empty: consent → Yes', formState2.consent?.selectedText === 'Yes'],
    [
      'empty: NO selects in LLM queue',
      result2.pendingQuestions.every((q) => q.fieldKind !== 'select'),
    ],
  ];
  let passed2 = 0;
  for (const [msg, ok] of empties) {
    console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
    if (ok) passed2 += 1;
  }
  totalRun += empties.length;
  passed += passed2;
  failed += empties.length - passed2;

  // ===== SCENARIO 3 — react-select v5 (Greenhouse job-boards) =====
  // Mocks the exact DOM/event shape used by job-boards.greenhouse.io:
  //   <div class="select-shell">
  //     <label id="X-label" for="X">…</label>
  //     <div class="select__control">
  //       <input id="X" type="text" role="combobox" aria-haspopup="true"
  //              aria-labelledby="X-label" class="select__input">
  //       <div class="select__placeholder">Select…</div>
  //     </div>
  //   </div>
  // The mock attaches `mousedown` listeners to controls (open) and options
  // (commit) — same event model react-select v5 uses. Native <select>
  // would NOT find these widgets; the engine must use the react-select
  // pass.
  console.log('\n--- Scenario 3: react-select v5 (Greenhouse job-boards) ---');

  // Build the page as a function so we can pass the question/option spec
  // into the iframe in one go.
  const RS_QUESTIONS = [
    { id: 'rs_age', label: 'What is your age?', options: ['Under 18', '18-24', '25-34', '35-44', '45-54', '55+', 'Prefer not to say'] },
    { id: 'rs_gender', label: 'What gender do you identify as?', options: ['Woman', 'Man', 'Non-binary', 'Prefer to self-describe', 'Prefer not to say'] },
    { id: 'rs_transgender', label: 'Do you identify as transgender?', options: ['Yes', 'No', 'Prefer not to say'] },
    { id: 'rs_orientation', label: 'What sexual orientation do you identify with?', options: ['Straight / Heterosexual', 'Gay or Lesbian', 'Bisexual', 'Other', 'Prefer not to say'] },
    // Disability options use the EXACT phrasings from the user's screenshot:
    // "I do not identify as having a disability" is the No-equivalent and
    // is the FIRST option (so picker must beat the PNTS that comes after).
    // This is the canonicalOf("i do not …") → "no" path.
    { id: 'rs_disability', label: 'Do you identify as having or previously having a disability?', options: ['I do not identify as having a disability', 'I identify as having, or previously having, a disability', 'Prefer not to say'] },
    // Veteran with simple Yes/No options — mirrors the user's actual
    // ezCater page. The engine must convert demographics.veteran="no"
    // (or "I am not a protected veteran") to the "No" option, not "Yes".
    { id: 'rs_veteran', label: 'Are you a Veteran?', options: ['Yes', 'No'] },
    { id: 'rs_workauth', label: 'Are you legally authorized to work in either Canada or the USA?', options: ['Yes', 'No'] },
    { id: 'rs_prior', label: 'Have you previously worked for Tucows or any of its subsidiaries?', options: ['Yes', 'No'] },
    { id: 'rs_race', label: 'I identify my race as', options: ['Asian', 'Black or African American', 'Hispanic or Latino', 'White', 'Prefer not to say'] },
    { id: 'rs_consent', label: 'By submitting my application, I consent to the collection of my personal data.', options: ['Yes', 'No'] },
    // The verbose ezCater sponsorship label — single-word "sponsorship" was
    // the only stable hook, so the matcher needs to fire on \bsponsorship\b
    // even when buried in 3 lines of policy boilerplate.
    { id: 'rs_sponsorship', label: 'Will you, now or in the future, require sponsorship for work authorization, a work visa, or permanent residence from our company, including sponsorship for a change of status (such as F-1 to H-1B) or change of employer? ezCater does not sponsor applicants for work visas or legal permanent residence.', options: ['Yes', 'No'] },
    // Highest degree dropdown — bidPreferences.highestDegree="Bachelor's Degree"
    // should pick the matching option via exact match.
    { id: 'rs_degree', label: 'Degree', options: ["Associate's Degree", "Bachelor's Degree", 'Doctor of Medicine (M.D.)', 'Doctor of Philosophy (Ph.D.)', "Engineer's Degree", 'High School', 'Juris Doctor (J.D.)', 'Master of Business Administration (M.B.A.)'] },
    // Hispanic / Latino EEO using the BUG-PRONE option phrasing:
    // demographics.hispanicLatino="no" must canonicalize via "Not Hispanic or
    // Latino" → "no" (the new explicit canonical), NOT accidentally pick
    // "Hispanic or Latino" via substring "latino" → "no" (the old bug).
    // "Decline to answer" exercises the PNTS canonical variant.
    { id: 'rs_hispanic', label: 'Are you Hispanic or Latino?', options: ['Hispanic or Latino', 'Not Hispanic or Latino', 'Decline to answer'] },
    // "Are you 18 years of age or older?" — bidPreferences.over18="yes" → "Yes".
    // The matcher must beat the generic EEO/PNTS branch (the word "age" is
    // in isEEO regex).
    { id: 'rs_over18', label: 'Are you 18 years of age or older?', options: ['Yes', 'No'] },
    // Age-range bucket — bidPreferences.ageRange="30-35" should match exactly.
    { id: 'rs_age_range', label: 'What is your age range?', options: ['17 or younger', '18-20', '21-25', '26-29', '30-35', '36-39', '40-49', '50-59', '60 or older'] },
    // DUPLICATE — a second gender react-select. The engine must fill BOTH
    // gender widgets (no per-category dedupe).
    { id: 'rs_gender_2', label: 'Gender (self-identification)', options: ['Woman', 'Man', 'Non-binary', 'Prefer to self-describe', 'Prefer not to say'] },
  ];

  // Empty iframe — we'll build the form + mock script via frame.evaluate
  // below so apostrophes in option labels ("Bachelor's Degree" etc.) don't
  // need any srcdoc escaping.
  const RS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
.select-shell { margin: 8px 0; }
.select__control { border: 1px solid #ccc; border-radius: 6px; padding: 8px; cursor: pointer; position: relative; }
.select__placeholder, .select__single-value { color: #999; }
.select__single-value { color: #111; }
.select__input { border: 0; outline: 0; width: 1px; opacity: 0; }
.select__menu { border: 1px solid #ccc; border-radius: 6px; margin-top: 4px; background: #fff; }
.select__option { padding: 6px 10px; cursor: pointer; }
.select__option:hover { background: #eef; }
</style></head><body>
<iframe id="appform" style="width:100%;height:1400px;border:0" srcdoc="
<!doctype html><html><head><meta charset='utf-8'></head><body>
<form id='application'></form>
</body></html>
"></iframe>
</body></html>`;

  const page3 = await browser.newPage();
  page3.on('pageerror', (err) => console.log('  [page3 error]', err.message));
  await page3.setContent(RS_HTML, { waitUntil: 'load' });
  await page3.waitForSelector('iframe#appform');
  const ih3 = await page3.$('iframe#appform');
  const frame3 = await ih3.contentFrame();
  await frame3.waitForSelector('#application');

  // Build the form inside the iframe — apostrophes in option labels travel
  // through as a JSON arg, no string-escape gymnastics needed.
  await frame3.evaluate((questions) => {
    const form = document.getElementById('application');
    for (const q of questions) {
      const shell = document.createElement('div');
      shell.className = 'select-shell';
      shell.dataset.qid = q.id;
      shell.innerHTML = `
        <label id="${q.id}-label" for="${q.id}">${q.label}<span aria-hidden="true"> *</span></label>
        <div class="select__control">
          <div class="select__value-container">
            <div class="select__placeholder">Select...</div>
            <div class="select__input-container">
              <input class="select__input" id="${q.id}" type="text"
                     role="combobox" aria-haspopup="true"
                     aria-labelledby="${q.id}-label" autocomplete="off" value="">
            </div>
          </div>
          <div class="select__indicators">
            <button type="button" class="icon-button">▾</button>
          </div>
        </div>
      `;
      form.appendChild(shell);
    }
  }, RS_QUESTIONS);

  // Install the react-select v5 emulator. Same options:
  //   mousedown on .select__control opens .select__menu (mounted inside .select-shell)
  //   mousedown on .select__option commits the value and closes the menu
  await frame3.evaluate((questions) => {
    const optionsByQid = Object.fromEntries(questions.map((q) => [q.id, q.options]));
    function closeAllMenus() {
      document.querySelectorAll('.select__menu').forEach((m) => m.remove());
    }
    function commit(shell, optionText) {
      closeAllMenus();
      const placeholder = shell.querySelector('.select__placeholder');
      if (placeholder) placeholder.remove();
      let sv = shell.querySelector('.select__single-value');
      if (!sv) {
        sv = document.createElement('div');
        sv.className = 'select__single-value';
        const valueContainer = shell.querySelector('.select__value-container');
        valueContainer.insertBefore(sv, valueContainer.firstChild);
      }
      sv.textContent = optionText;
      const input = shell.querySelector('.select__input');
      if (input) {
        input.value = optionText;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    document.addEventListener(
      'mousedown',
      (e) => {
        const optionEl = e.target.closest('.select__option');
        if (optionEl) {
          const shell = optionEl.closest('.select-shell');
          commit(shell, optionEl.textContent.trim());
          return;
        }
        const control = e.target.closest('.select__control');
        if (!control) {
          closeAllMenus();
          return;
        }
        const shell = control.closest('.select-shell');
        const qid = shell.dataset.qid;
        closeAllMenus();
        const menu = document.createElement('div');
        menu.className = 'select__menu';
        const list = document.createElement('div');
        list.className = 'select__menu-list';
        list.setAttribute('role', 'listbox');
        optionsByQid[qid].forEach((text, i) => {
          const opt = document.createElement('div');
          opt.className = 'select__option';
          opt.setAttribute('role', 'option');
          opt.id = `react-select-${qid}-option-${i}`;
          opt.textContent = text;
          list.appendChild(opt);
        });
        menu.appendChild(list);
        shell.appendChild(menu);
      },
      true,
    );
  }, RS_QUESTIONS);

  await frame3.evaluate((src) => {
    const s = document.createElement('script');
    s.textContent = src;
    document.head.appendChild(s);
  }, engineSrc);

  // Use the same SAMPLE_DATA so demographics + bidPreferences drive the selects.
  const result3 = await frame3.evaluate(
    (d) => window.__autofillEngine.autofillBidForm(d),
    SAMPLE_DATA,
  );
  const rsState = await frame3.evaluate(() => {
    const v = (qid) => {
      const shell = document.querySelector(`.select-shell[data-qid="${qid}"]`);
      if (!shell) return null;
      const sv = shell.querySelector('.select__single-value');
      return sv ? sv.textContent.trim() : '';
    };
    return {
      age: v('rs_age'),
      gender: v('rs_gender'),
      transgender: v('rs_transgender'),
      orientation: v('rs_orientation'),
      disability: v('rs_disability'),
      veteran: v('rs_veteran'),
      workauth: v('rs_workauth'),
      prior: v('rs_prior'),
      race: v('rs_race'),
      consent: v('rs_consent'),
      sponsorship: v('rs_sponsorship'),
      degree: v('rs_degree'),
      hispanic: v('rs_hispanic'),
      over18: v('rs_over18'),
      ageRange: v('rs_age_range'),
      gender_2: v('rs_gender_2'),
    };
  });
  console.log('react-select state:', JSON.stringify(rsState, null, 2));
  console.log('Engine report (scenario 3):', JSON.stringify(result3, null, 2));

  const rsAsserts = [
    // Non-binary EEO with no saved demographic → "Prefer not to say"
    // (no reasonable population default for age / orientation).
    ['rs: age → Prefer not to say', rsState.age === 'Prefer not to say'],
    ['rs: orientation → Prefer not to say', rsState.orientation === 'Prefer not to say'],
    // Saved demographics drive the option pick
    ['rs: gender → Man (from "Male" via synonym)', rsState.gender === 'Man'],
    ['rs: race → White', rsState.race === 'White'],
    // demographics.disability="No, I do not have a disability" → option
    // "I do not identify as having a disability" via canonicalOf("no") path.
    // Tricky case: option 2 ALSO starts with "I identify" and option 3 is
    // PNTS — the engine must pick option 1, not option 3.
    [
      'rs: disability → "I do not identify as having a disability"',
      rsState.disability === 'I do not identify as having a disability',
    ],
    // Simple Yes/No widget: demographics.veteran="no" → canonicalOf returns
    // "no" → matches "No" option. Critical: must NOT pick "Yes".
    ['rs: veteran (simple Yes/No) → No', rsState.veteran === 'No'],
    ['rs: transgender → No', rsState.transgender === 'No'],
    // Label-based fallback
    ['rs: workauth → Yes', rsState.workauth === 'Yes'],
    ['rs: prior employment → No', rsState.prior === 'No'],
    ['rs: consent → Yes', rsState.consent === 'Yes'],
    // Critical regression — demographics.hispanicLatino="no" must pick
    // "Not Hispanic or Latino", NOT "Hispanic or Latino" via the "latino"
    // substring containing "no".
    [
      'rs: Hispanic/Latino → "Not Hispanic or Latino" (no substring bug)',
      rsState.hispanic === 'Not Hispanic or Latino',
    ],
    // ezCater-style verbose sponsorship label — \bsponsorship\b matcher hit
    // → demographics.requiresSponsorshipUS="no" → "No".
    ['rs: sponsorship → No (verbose ezCater label)', rsState.sponsorship === 'No'],
    // New: Degree dropdown — bidPreferences.highestDegree="Bachelor's Degree"
    // matches the option of the same name exactly.
    ["rs: degree → Bachelor's Degree", rsState.degree === "Bachelor's Degree"],
    // (Hispanic/Latino covered above by the no-substring regression test.)
    // New: Are you 18 years of age or older? — over18="yes" → "Yes". The
    // age matcher must beat the generic EEO PNTS branch.
    ['rs: over-18 → Yes', rsState.over18 === 'Yes'],
    // Age-range bucket from bidPreferences.ageRange="30-35".
    ['rs: age range → 30-35', rsState.ageRange === '30-35'],
    // DUPLICATE — both gender react-selects must fill (rs_gender → "Man"
    // via Male/Man synonym, rs_gender_2 → "Man" again from the same value).
    ['rs: second Gender widget → Man (duplicate fills too)', rsState.gender_2 === 'Man'],
    // No widgets queued for LLM
    [
      'rs: NO selects in LLM queue',
      result3.pendingQuestions.every((q) => q.fieldKind !== 'select'),
    ],
  ];
  let passed3 = 0;
  for (const [msg, ok] of rsAsserts) {
    console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
    if (ok) passed3 += 1;
  }
  totalRun += rsAsserts.length;
  passed += passed3;
  failed += rsAsserts.length - passed3;

  // ===== SCENARIO 4 — native radio groups + Yes/No button pairs =====
  // Covers the four screenshot shapes the user just reported:
  //   - Yes/No "buttons" for work auth + sponsorship (rendered as
  //     <button type="button"> pairs inside a labeled wrapper)
  //   - Gender / Race / Veteran as native <input type="radio"> groups
  //     where the GROUP label lives on a heading or fieldset legend above
  //     (not on each individual radio)
  console.log('\n--- Scenario 4: radio groups + Yes/No button pairs ---');

  const RADIO_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
.group { margin: 12px 0; padding: 8px; border: 1px solid #eee; }
.group-label { font-weight: bold; margin-bottom: 6px; }
.button-row button { padding: 6px 18px; margin-right: 6px; border: 1px solid #ccc; background: #fff; cursor: pointer; }
.button-row button.selected { background: #def; border-color: #69c; }
label { display: block; margin: 4px 0; }
</style></head><body>
<iframe id="appform" style="width:100%;height:1200px;border:0" srcdoc='
<!doctype html><html><head><meta charset="utf-8"><style>
.group { margin: 12px 0; padding: 8px; border: 1px solid #eee; }
.group-label { font-weight: bold; margin-bottom: 6px; }
.button-row button { padding: 6px 18px; margin-right: 6px; border: 1px solid #ccc; background: #fff; cursor: pointer; }
.button-row button.selected { background: #def; border-color: #69c; }
label { display: block; margin: 4px 0; }
</style></head><body>
<form id="application">
  <!-- Native radio group: Gender -->
  <fieldset class="group">
    <legend>Gender</legend>
    <p style="color:#888">Input gender</p>
    <label><input type="radio" name="gender" value="male"> Male</label>
    <label><input type="radio" name="gender" value="female"> Female</label>
    <label><input type="radio" name="gender" value="decline"> Decline to self-identify</label>
  </fieldset>

  <!-- DUPLICATE gender radio group with a different name attribute. Both must fill. -->
  <fieldset class="group">
    <legend>Gender identity</legend>
    <label><input type="radio" name="gender_id" value="male"> Male</label>
    <label><input type="radio" name="gender_id" value="female"> Female</label>
    <label><input type="radio" name="gender_id" value="non-binary"> Non-binary</label>
    <label><input type="radio" name="gender_id" value="decline"> Decline to self-identify</label>
  </fieldset>

  <!-- Native radio group: Veteran Status (full ezCater phrasing) -->
  <fieldset class="group">
    <legend>Veteran Status</legend>
    <label><input type="radio" name="veteran_status" value="protected"> I identify as one or more of the classifications of protected veteran listed above</label>
    <label><input type="radio" name="veteran_status" value="not_protected"> I am not a protected veteran</label>
    <label><input type="radio" name="veteran_status" value="decline"> I decline to self-identify for protected veteran status</label>
  </fieldset>

  <!-- div[role="button"] Yes/No pair — common React custom pattern. -->
  <div class="group" id="custom_consent_group">
    <p class="group-label">By submitting my application, I consent to the processing of my personal data.</p>
    <div class="button-row">
      <div role="button" tabindex="0" class="custom-btn">Yes</div>
      <div role="button" tabindex="0" class="custom-btn">No</div>
    </div>
  </div>

  <!-- Label-wrapped hidden radios styled as buttons (HeadlessUI pattern). -->
  <div class="group" id="experience_group">
    <p class="group-label">Do you have experience working with distributed systems?</p>
    <div class="button-row">
      <label class="pill-btn"><input type="radio" name="exp_dist" value="yes" style="position:absolute;opacity:0">Yes</label>
      <label class="pill-btn"><input type="radio" name="exp_dist" value="no" style="position:absolute;opacity:0">No</label>
    </div>
  </div>

  <!-- Ashby-style _fieldEntry pattern: <button> with NO type attribute
       (HTML defaults .type to "submit" but the literal attribute is null),
       sibling label, hidden checkbox holding state. -->
  <div class="_fieldEntry" data-fieldpath="auth_ashby">
    <label class="_heading">Are you currently authorized to work lawfully in the United States?</label>
    <div class="_container button-row">
      <button class="_option">Yes</button>
      <button class="_option">No</button>
      <input type="checkbox" name="auth_ashby_internal" aria-hidden="true" style="display:none">
    </div>
  </div>

  <div class="_fieldEntry" data-fieldpath="sponsorship_ashby">
    <label class="_heading">Will you now or in the future require employment-based immigration sponsorship to work for our company (for example, H-1B, TN, L-1, E-3, etc.)?</label>
    <p style="color:#666;font-style:italic">If you are working pursuant to F-1 OPT/STEM OPT/CPT and planning to ask for employment sponsorship in the future, you should answer Yes.</p>
    <div class="_container button-row">
      <button class="_option">Yes</button>
      <button class="_option">No</button>
      <input type="checkbox" name="sponsorship_ashby_internal" aria-hidden="true" style="display:none">
    </div>
  </div>

  <!-- "Select all that apply" CHECKBOX group for race. demographics.race="White"
       should produce a click on the matching "White / Caucasian" checkbox. -->
  <fieldset class="group" id="race_checkbox_group">
    <legend>Race / Ethnicity (select all that apply)</legend>
    <label><input type="checkbox" name="race_multi" value="white"> White / Caucasian</label>
    <label><input type="checkbox" name="race_multi" value="hispanic"> Hispanic, Latino, or Spanish origin</label>
    <label><input type="checkbox" name="race_multi" value="black"> Black or African American</label>
    <label><input type="checkbox" name="race_multi" value="asian"> Asian</label>
    <label><input type="checkbox" name="race_multi" value="nhpi"> Native Hawaiian or other Pacific Islander</label>
    <label><input type="checkbox" name="race_multi" value="indigenous"> Indigenous Peoples, First Nations, Native American, or Alaska Native</label>
    <label><input type="checkbox" name="race_multi" value="mena"> Middle Eastern or North African</label>
    <label><input type="checkbox" name="race_multi" value="other"> Some other race, ethnicity, or origin</label>
  </fieldset>

  <!-- Age range radio group — bidPreferences.ageRange="30-35" picks 30-35. -->
  <fieldset class="group" id="age_range_group">
    <legend>What is your age range?</legend>
    <label><input type="radio" name="age_range_radio" value="lt18"> 17 or younger</label>
    <label><input type="radio" name="age_range_radio" value="18-20"> 18-20</label>
    <label><input type="radio" name="age_range_radio" value="21-25"> 21-25</label>
    <label><input type="radio" name="age_range_radio" value="26-29"> 26-29</label>
    <label><input type="radio" name="age_range_radio" value="30-35"> 30-35</label>
    <label><input type="radio" name="age_range_radio" value="36-39"> 36-39</label>
    <label><input type="radio" name="age_range_radio" value="40-49"> 40-49</label>
    <label><input type="radio" name="age_range_radio" value="50-59"> 50-59</label>
    <label><input type="radio" name="age_range_radio" value="60p"> 60 or older</label>
  </fieldset>
</form>
<!-- Mock click handler injected via frame.evaluate after load to dodge
     srcdoc-vs-JS quote escaping issues. -->
</body></html>
'></iframe>
</body></html>`;

  const page4 = await browser.newPage();
  page4.on('pageerror', (err) => console.log('  [page4 error]', err.message));
  await page4.setContent(RADIO_HTML, { waitUntil: 'load' });
  await page4.waitForSelector('iframe#appform');
  const ih4 = await page4.$('iframe#appform');
  const frame4 = await ih4.contentFrame();
  await frame4.waitForSelector('#application');
  // Mock click handler: bind directly on each candidate so synthetic
  // events from the engine reliably trigger it. Use `Array.from(NodeList)`
  // to capture a stable handle to siblings in the closure.
  await frame4.evaluate(() => {
    document.querySelectorAll('.button-row').forEach((row) => {
      const allBtns = Array.from(row.querySelectorAll('button, [role="button"]'));
      allBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          allBtns.forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
        });
      });
    });
  });
  await frame4.evaluate((src) => {
    const s = document.createElement('script');
    s.textContent = src;
    document.head.appendChild(s);
  }, engineSrc);

  const result4 = await frame4.evaluate(
    (d) => window.__autofillEngine.autofillBidForm(d),
    SAMPLE_DATA,
  );
  const radioState = await frame4.evaluate(() => {
    const checked = (name) => {
      const els = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
      for (const el of els) if (el.checked) return el.value;
      return '';
    };
    const buttonSelected = (labelMatch) => {
      const groups = Array.from(document.querySelectorAll('.group'));
      for (const g of groups) {
        const text = g.textContent.toLowerCase();
        if (text.includes(labelMatch)) {
          const sel = g.querySelector('button.selected, [role="button"].selected');
          return sel ? sel.textContent.trim() : '';
        }
      }
      return '';
    };
    // Read by fieldEntry data-fieldpath (Ashby-style) — there are two
    // "authorized to work lawfully" labels in this scenario, so we need
    // to scope by the fieldEntry wrapper to disambiguate.
    const fieldEntrySelected = (pathSuffix) => {
      const fe = document.querySelector(`._fieldEntry[data-fieldpath$="${pathSuffix}"]`);
      if (!fe) return '';
      const sel = fe.querySelector('button.selected, [role="button"].selected');
      return sel ? sel.textContent.trim() : '';
    };
    return {
      workauth: buttonSelected('authorized to work lawfully'),
      sponsorship: buttonSelected('immigration sponsorship'),
      gender: checked('gender'),
      gender_id: checked('gender_id'),
      race: checked('race'),
      veteran: checked('veteran_status'),
      consent: buttonSelected('by submitting my application'),
      exp_dist: checked('exp_dist'),
      // Ashby-style pattern
      ashby_workauth: fieldEntrySelected('auth_ashby'),
      ashby_sponsorship: fieldEntrySelected('sponsorship_ashby'),
      // Race checkbox group: which boxes are checked?
      raceCheckboxes: Array.from(
        document.querySelectorAll('input[name="race_multi"]:checked'),
      ).map((c) => c.value),
      // Age range radio group: which radio is checked?
      ageRangeRadio: (() => {
        const checked = document.querySelector(
          'input[name="age_range_radio"]:checked',
        );
        return checked ? checked.value : '';
      })(),
    };
  });
  console.log('radio/button state:', JSON.stringify(radioState, null, 2));
  console.log('Engine report (scenario 4):', JSON.stringify(result4, null, 2));

  const radioAsserts = [
    // Native radios — group label from fieldset legend drives classification
    [
      'scenario 4: gender radio → male (demographics.gender="Male")',
      radioState.gender === 'male',
    ],
    // DUPLICATE — second gender radio group ("Gender identity") must also fill.
    [
      'scenario 4: DUPLICATE second gender radio group → male',
      radioState.gender_id === 'male',
    ],
    // (race radio test replaced by the checkbox group test below)
    [
      'scenario 4: veteran radio → not_protected ("I am not a protected veteran")',
      radioState.veteran === 'not_protected',
    ],
    // div[role="button"] pair — broader detector should still find it.
    ['scenario 4: consent (div[role=button]) → Yes', radioState.consent === 'Yes'],
    // Label-wrapped hidden radio styled as a pill button — native radio
    // pass should find these even though the radio is opacity:0.
    [
      'scenario 4: label-wrapped hidden radio → yes',
      radioState.exp_dist === 'yes',
    ],
    // Ashby-style _fieldEntry — <button> with no type attribute (HTML
    // defaults .type to "submit"), label as sibling, hidden checkbox.
    [
      'scenario 4: Ashby work-auth (button, no type attr) → Yes',
      radioState.ashby_workauth === 'Yes',
    ],
    [
      'scenario 4: Ashby sponsorship (button, no type attr) → No',
      radioState.ashby_sponsorship === 'No',
    ],
    // Checkbox group "select all that apply" — demographics.race="White"
    // should toggle ONLY the "White / Caucasian" checkbox.
    [
      'scenario 4: race checkbox group → only "white" checked',
      radioState.raceCheckboxes.length === 1 && radioState.raceCheckboxes[0] === 'white',
    ],
    // Age range radio group — bidPreferences.ageRange="30-35" picks 30-35.
    [
      'scenario 4: age range radio → 30-35',
      radioState.ageRangeRadio === '30-35',
    ],
    // No selects went to LLM
    [
      'scenario 4: NO selects in LLM queue',
      result4.pendingQuestions.every((q) => q.fieldKind !== 'select'),
    ],
  ];
  let passed4 = 0;
  for (const [msg, ok] of radioAsserts) {
    console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
    if (ok) passed4 += 1;
  }
  totalRun += radioAsserts.length;
  passed += passed4;
  failed += radioAsserts.length - passed4;

  if (failed > 0) {
    console.error(`\nFAIL: ${failed}/${totalRun} assertions failed`);
    exitCode = 2;
  } else {
    console.log(`\nOK: ${passed}/${totalRun} assertions passed (across 4 scenarios)`);
  }
} catch (err) {
  console.error('FAIL: exception during test:', err);
  exitCode = 3;
} finally {
  await browser.close();
}

process.exit(exitCode);
