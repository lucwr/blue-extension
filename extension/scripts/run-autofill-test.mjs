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
    pronouns: 'he/him',
  },
  // Defaults for the non-EEO custom questions:
  //   prior employment: no, relevant experience: yes,
  //   how did you hear: Job board
  bidPreferences: {
    priorEmployment: 'no',
    hasRelevantExperience: 'yes',
    howDidYouHear: 'Job board',
    salaryExpectation: '$130,000 - $160,000',
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
    // Binary EEO with PNTS option present → engine picks PNTS as the safer
    // empty-profile default. (When the user sets demographics.transgender,
    // the matcher fills "No" / "Yes" directly — covered in scenario 1.)
    [
      'empty: transgender → "Prefer not to say" or "No"',
      ['Prefer not to say', 'No'].includes(formState2.transgender?.selectedText ?? ''),
    ],
    [
      'empty: disability_verbose → starts with "No" or "I do not wish"',
      /^(No|I do not wish)/i.test(formState2.disability_verbose?.selectedText ?? ''),
    ],
    [
      'empty: veteran_verbose → "No, I am not a protected veteran" or "I do not wish"',
      /(not a protected veteran|I do not wish)/i.test(formState2.veteran_verbose?.selectedText ?? ''),
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

  if (failed > 0) {
    console.error(`\nFAIL: ${failed}/${totalRun} assertions failed`);
    exitCode = 2;
  } else {
    console.log(`\nOK: ${passed}/${totalRun} assertions passed (across 2 scenarios)`);
  }
} catch (err) {
  console.error('FAIL: exception during test:', err);
  exitCode = 3;
} finally {
  await browser.close();
}

process.exit(exitCode);
