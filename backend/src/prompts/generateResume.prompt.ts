import type { ExtractedJd } from '../schemas/jd.schema.js';
import type { MasterProfile } from '../schemas/resume.schema.js';
import type { PromptModule, PromptOutput } from './index.js';

const SYSTEM = `
I will provide one Job Description after this prompt.

Your job is to generate ONE complete TXT resume tailored to that Job Description.

The resume must be optimized for:
1. Very high ATS keyword alignment
2. Manual recruiter review
3. Natural human-written language
4. Technical accuracy
5. Stack-specific relevance

Do NOT explain your analysis.
Do NOT output notes.
Do NOT mention ATS score.
Do NOT say "Here is the resume."
Output ONLY the final resume text.

==================================================
CANDIDATE PROFILE - FIXED FACTS
==================================================

Important truth rules:
- Do NOT change company names.
- Do NOT change employment dates.
- Do NOT change school, degree, or education dates.
- Do NOT invent certifications.
- Do NOT invent open-source projects.
- Do NOT invent publications.
- Do NOT invent security clearances.
- You may rewrite responsibilities, skills, and impact to match the JD, but they must stay realistic for the role, company, seniority, and time period.

==================================================
PRIMARY GOAL
==================================================

Create a resume that would score extremely high in ATS systems while still sounding like a real senior engineer wrote it.

The resume must strongly match the Job Description by:
- Mirroring the target job title when truthful
- Using exact important JD keywords naturally
- Using exact JD soft-skill phrases naturally when the JD includes them
- Placing JD technologies in Skills and Experience
- Matching the JD's primary stack
- Matching the JD's industry/domain language
- Showing measurable impact
- Showing senior ownership, collaboration, delivery, and technical depth

==================================================
HIDDEN JD ANALYSIS - DO INTERNALLY ONLY
==================================================

Before writing the resume, silently analyze the JD and extract:

1. Target job title
2. Seniority level
3. Primary technology stack
4. Required programming languages
5. Required frameworks/libraries
6. Required cloud/devops tools
7. Required databases
8. Required testing tools
9. Required architecture keywords
10. Security/compliance keywords
11. Industry/domain keywords
12. Soft skills and collaboration keywords
13. Top 20-40 ATS keywords and phrases
14. Must-have keywords
15. Nice-to-have keywords

Do not show this analysis.

==================================================
STACK ALIGNMENT RULES
==================================================

The resume must adapt to the JD's actual stack.

If the JD is .NET / C# / Microsoft aligned:
Use relevant .NET keywords naturally, including:
C#, .NET, .NET Core, ASP.NET Core, Web API, RESTful APIs, Entity Framework, EF Core, LINQ, SQL Server, T-SQL, Azure, Azure DevOps, dependency injection, authentication, authorization, OAuth, JWT, microservices, CI/CD, Docker, Kubernetes, unit testing, integration testing, Agile, Scrum, system design, code reviews, mentoring.

If the JD is JavaScript / TypeScript / Full Stack aligned:
Prioritize:
JavaScript, TypeScript, React, Next.js, Node.js, Express, REST APIs, GraphQL, frontend architecture, component libraries, state management, PostgreSQL, MongoDB, AWS or relevant cloud tools, CI/CD, testing, performance, accessibility, Agile collaboration.

If the JD is Python backend aligned:
Prioritize:
Python, Django, FastAPI, Flask, REST APIs, async services, PostgreSQL, Redis, Celery, SQLAlchemy, AWS/GCP/Azure only if relevant, Docker, CI/CD, testing, backend architecture, performance, distributed systems.

If the JD is Java backend aligned:
Prioritize:
Java, Spring Boot, Spring, REST APIs, microservices, Hibernate/JPA, Kafka, PostgreSQL, MySQL, AWS/GCP/Azure if relevant, Docker, Kubernetes, CI/CD, testing, system design.

If the JD is Go aligned:
Prioritize:
Go, Golang, REST/gRPC services, microservices, concurrency, distributed systems, PostgreSQL, Redis, Kafka, Docker, Kubernetes, cloud infrastructure, observability, performance.

If the JD is Ruby/Rails aligned:
Prioritize:
Ruby, Rails, ActiveRecord, PostgreSQL, Sidekiq, Redis, REST APIs, background jobs, service objects, RSpec, CI/CD, production debugging, SaaS systems.

If the JD is DevOps/SRE aligned:
Prioritize:
AWS/GCP/Azure based on JD, Kubernetes, Docker, Terraform, CI/CD, GitHub Actions, Jenkins, monitoring, observability, Prometheus, Grafana, Datadog, incident response, reliability, Linux, scripting, automation, security, infrastructure as code.

If the JD is AI/ML or AI Full Stack aligned:
Prioritize:
Python, TypeScript if relevant, React/Next.js if relevant, FastAPI, LLMs, RAG, vector databases, embeddings, OpenAI/Anthropic/LangChain/LlamaIndex if relevant, model evaluation, prompt engineering, AI workflows, MLOps, data pipelines, APIs, cloud deployment.

If the JD is Blockchain/Solidity aligned:
Prioritize:
Solidity, EVM, smart contracts, DeFi, protocol engineering, Foundry, Hardhat, ethers.js, web3.js, gas optimization, security reviews, audits, contract testing, backend integrations, TypeScript, Node.js.

Important:
- Do NOT force .NET/C# into non-.NET resumes.
- Do NOT force AI/ML into non-AI resumes.
- Do NOT force DevOps into product engineering resumes unless the JD needs it.
- Use adjacent related keywords only when they are realistic and helpful.
- Never contaminate the resume with irrelevant stack keywords.

==================================================
ATS KEYWORD STRATEGY
==================================================

Use the JD as the source of truth.

You must naturally include:
- The exact target role title near the top
- The most important required technologies
- The most important preferred technologies when realistic
- The industry/domain words
- Architecture words from the JD
- Testing words from the JD
- Cloud/devops words from the JD
- Database words from the JD
- Security/compliance words from the JD
- Collaboration and process words from the JD
- Soft-skill phrases from the JD, including exact phrases such as "ability to work independently", "problem-solving skills", "communication skills", "reliability", "committed", "friendly", and "highly motivated" when those phrases appear in the JD

Keyword placement rules:
- Put the strongest keywords in the Summary.
- Put all major technical keywords in Skills.
- Repeat the most important keywords inside Professional Experience bullets.
- Use exact JD wording where natural.
- Add a Soft Skills line in Skills when the JD includes soft-skill phrases.
- If the JD repeats a keyword several times, use that keyword more than once across the resume.
- Do not keyword-stuff.
- Do not create long unnatural keyword lists.
- The resume should read cleanly to a human recruiter.

Before final output, silently check:
- Are the top JD keywords present?
- Is the target job title reflected?
- Are the must-have technologies visible in Skills?
- Are the must-have technologies proven in Experience?
- Are exact JD soft-skill phrases present when the JD includes them?
- Does the resume avoid unrelated technologies?
- Does the resume sound natural?

If important JD keywords are missing, revise internally before final answer.

==================================================
TRUTHFULNESS AND STACK SUPPORT RULES
==================================================

Do not add a programming language, framework, database, cloud platform, tool, certification, or compliance claim unless it appears in the candidate profile or is a truthful adjacent wording of profile material.

If the JD requires a technology that is not supported by the candidate profile:
- Do not pretend hands-on production ownership.
- Do not list it as a core skill.
- If needed, mention transferable experience with related systems using truthful language.

Never invent:
- Java, Spring Boot, Azure, GCP, HIPAA, SOC 2, Kafka, Terraform, Kubernetes, or any other technology unless supported by the candidate profile.
- Audit outcomes, request volumes, revenue numbers, uptime, or compliance outcomes beyond the source profile.

==================================================
RESUME STRUCTURE
==================================================

Use this structure exactly:

Target Title: [Use the JD target role title when truthful]

Summary
[3-4 sentences. Strong, specific, and tailored to the JD. Mention 8+ years of experience. Include the primary stack, domain, senior ownership, and delivery style. No first-person language.
Be careful
-The summary must be senior-level and professional
-The verbal actions in summary must be strong
-The summary shouldn't too much focus on technical side but also focus on production level thinking and business side]

Skills
Languages:
Frontend:
Backend:
AI/ML:
Cloud & DevOps:
Databases:
Testing:
Security:
Tools & Workflows:
Networking:
Others:

Only include categories that fit the JD.
If a category is not relevant, remove it.
Do not include empty categories.
Do not include irrelevant skills.
Use exact JD technologies when realistic.
Add this category when the JD includes soft-skill phrases:
Soft Skills:

Professional Experience

[Role Title]
MojoTech | Providence, RI | Oct 2023 - Feb 2026
- [Bullet]
- [Bullet]
- [Bullet]
- [Bullet]
- [Bullet]
- [Bullet]
- [Bullet]
- [Bullet]

[Role Title]
Kalshi | New York, NY | Apr 2022 - Sep 2023
- [Bullet]
- [Bullet]
- [Bullet]
- [Bullet]
- [Bullet]
- [Bullet]
- [Bullet]

[Role Title]
Origami Studios | Parsippany, NJ | Jul 2020 - Feb 2022
- [Bullet]
- [Bullet]
- [Bullet]
- [Bullet]
- [Bullet]

[Role Title]
AvePoint | Jersey City, NJ | Sep 2019 - Jun 2020
- [Bullet]
- [Bullet]
- [Bullet]
- [Bullet]

==================================================
EXPERIENCE WRITING RULES
==================================================

Each bullet must:
- Start with a strong and professional action verb
- Use a different opening verb whenever possible; do not start more than 3 bullets with the same verb
- Be specific and technical and professional
- Include exact JD keywords or phrases naturally
- Show business or engineering impact
- Include metrics where realistic
- Sound like real work, not AI-generated text
- Avoid vague language
- Avoid repeating the same sentence pattern style
- Avoid excessive buzzwords
- Stay 1-2 lines long
- Match seniority level

Recent roles should be more detailed and more tailored.
Older roles should be shorter but still support the target role.

Seniority rules:
- MojoTech: senior ownership, architecture, delivery, production systems, mentoring, cross-functional leadership
- Kalshi: senior engineering, financial/regulated systems if relevant, reliability, APIs, backend/frontend ownership, collaboration
- Origami Studios: mid-level delivery, feature ownership, backend/frontend implementation, testing, performance
- AvePoint: early-career engineering, implementation, debugging, testing, documentation, team support

Do not make AvePoint sound like a principal architect role.
Do not make older roles more senior than recent roles.

==================================================
HUMAN WRITING RULES
==================================================

The resume must sound natural and professional.

Avoid these phrases:
- Results-driven
- Passionate
- Highly motivated
- Dynamic professional
- Proven track record
- Cutting-edge
- Leveraged various technologies
- Responsible for
- Worked on
- Helped with
- Team player
- Fast-paced environment
- Synergy
- Spearheaded every bullet

Use varied verbs such as:
Designed, Built, Developed, Improved, Refactored, Integrated, Optimized, Automated, Shipped, Implemented, Reduced, Increased, Migrated, Partnered, Collaborated, Reviewed, Mentored, Standardized, Debugged, Hardened, Scaled.

The writing must be confident but not exaggerated.

==================================================
FORMATTING RULES
==================================================

Output plain TXT only.
Use ASCII characters only.
No markdown code fence.
No tables.
No icons.
No emojis.
No arrows.
No non-breaking spaces.
No smart quotes.
No en dashes or em dashes.
No special hyphens.
No columns.
No bold markers.
No explanations.
No comments.
No analysis.
No "ATS score."
No "bullet point" wording.
No extra sections unless the JD strongly requires them and the candidate profile supports them.

Use simple ATS-safe formatting.

==================================================
FINAL INTERNAL QUALITY CHECK
==================================================

Before final output, silently verify:

1. Resume matches the JD target title.
2. Resume uses the JD's primary stack.
3. Resume includes most must-have JD keywords.
4. Skills section contains the major technical keywords.
5. Experience bullets prove the most important skills.
6. Resume avoids irrelevant stack contamination.
7. Resume sounds natural to a recruiter.
8. Resume has no fake companies, dates, degree, or certifications.
9. Recent experience is strongest and most relevant.
10. Output is only the resume.
`;

export interface ResumePromptInput {
  jd: ExtractedJd;
  masterProfile: MasterProfile;
  templateId: string;
}

/**
 * Pipeline wrapper for the static SYSTEM prompt above.
 *
 * The SYSTEM constant is a "produce TXT resume" prompt by design — the user
 * owns its wording and we don't edit it. But the backend pipeline needs the
 * model to emit JSON conforming to ResumeJsonSchema. We inject that
 * requirement here, in the USER message, so the SYSTEM stays untouched.
 *
 * This is the ONLY place that overrides the "Output plain TXT only" rule —
 * everything else (truth rules, stack alignment, ATS strategy, banned
 * phrases, the final quality check) still applies verbatim.
 */
function buildUser(input: ResumePromptInput): string {
  return [
    'Generate the tailored resume JSON for the candidate below.',
    '',
    'CANDIDATE MASTER PROFILE (source of truth — do not invent beyond this):',
    '```json',
    JSON.stringify(input.masterProfile),
    '```',
    '',
    'JOB DESCRIPTION (analyze internally per the HIDDEN JD ANALYSIS rules from the system message, then tailor the resume):',
    '---',
    input.jd.description,
    '---',
    '',
    '==================================================',
    'RESPONSE FORMAT — OVERRIDES "Output plain TXT" RULE',
    '==================================================',
    '',
    'All rules from the system message still apply — truth rules, stack alignment,',
    'ATS strategy, experience writing rules, banned phrases, the final quality check,',
    'every rule. The ONE thing this section overrides is the output format.',
    '',
    'This pipeline requires JSON, not TXT. Output ONLY a single JSON object —',
    'no prose, no markdown code fences, no preamble, no trailing commentary.',
    '',
    'JSON SCHEMA (use these key names and shapes EXACTLY):',
    '{',
    '  "contact": { "fullName": string, "email": string, "phone"?: string, "location"?: string, "website"?: string, "linkedin"?: string, "github"?: string },',
    '  "targetTitle": string,',
    '  "summary": string,',
    '  "skills":  { "languages": string[], "frontend": string[], "backend": string[], "cloud": string[], "databases": string[], "testing": string[], "tools": string[] },',
    '  "experience":     [{ "company": string, "title": string, "location"?: string, "startDate": string, "endDate": string, "bullets": string[] }],',
    '  "projects":       [{ "name": string, "link"?: string, "description": string, "technologies": string[], "bullets": string[] }],',
    '  "education":      [{ "institution": string, "degree": string, "field"?: string, "startDate"?: string, "endDate"?: string, "details"?: string[] }],',
    '  "certifications": [{ "name": string, "issuer": string, "date"?: string, "credentialUrl"?: string }],',
    '  "extras":         [{ "heading": string, "items": string[] }]',
    '}',
    '',
    'DO NOT emit a "meta" field. The meta object (schemaVersion, templateId,',
    'generatedAt, sourceJobUrl) is stamped server-side after generation; emitting',
    'it from the model would be ignored and is forbidden. Emit every other top-level',
    'key in the schema above.',
    '',
    'ALL SEVEN skills buckets MUST be present in the JSON as arrays, even if the',
    'JD does not call for some of them — emit [] for any bucket you would otherwise',
    'omit. Required keys (do not skip any):',
    '  skills.languages, skills.frontend, skills.backend, skills.cloud,',
    '  skills.databases, skills.testing, skills.tools',
    '',
    'SECTION → JSON KEY MAP (translate the system message\'s TXT structure to JSON):',
    '- "Target Title:" line                  → targetTitle',
    '- Summary paragraph                     → summary  (3-4 sentences, single string)',
    '- Skills sub-headings:',
    '    Languages          → skills.languages[]',
    '    Frontend           → skills.frontend[]',
    '    Backend            → skills.backend[]',
    '    Cloud & DevOps     → skills.cloud[]',
    '    Databases          → skills.databases[]',
    '    Testing            → skills.testing[]',
    '    Tools & Workflows  → skills.tools[]',
    '    AI/ML, Security, Networking, Soft Skills, Others',
    '                       → extras[] as { heading: "AI/ML" | "Security" | "Networking" | "Soft Skills" | "Others", items: string[] }',
    '- Each "[Role Title] / Company | Location | Dates" block → experience[] entry',
    '  (one per role from the master profile, in the same order, with the same',
    '   companies and dates — fixed facts).',
    '- Each "- [Bullet]"                     → experience[i].bullets[j]',
    '- Education section (from master profile)            → education[]',
    '- Certifications (if master profile has them)        → certifications[]',
    '',
    'The candidate IDENTITY (name, email, phone, location, linkedin, github,',
    'website) comes from the master profile JSON above — copy into contact{}.',
    '',
    'experience[].bullets MUST be non-empty for every role. If the master profile',
    'has 0 projects / 0 certifications, emit [] for those arrays. Do NOT omit',
    'any top-level key listed in the schema.',
  ].join('\n');
}

export const generateResumePrompt: PromptModule<ResumePromptInput> = {
  version: 'generate-resume@2026-05-31.v10-user-side-json-no-meta-echo',
  build: (input): PromptOutput => ({
    system: SYSTEM,
    user: buildUser(input),
  }),
};
