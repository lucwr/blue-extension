/**
 * Time a real /api/resume call against a running backend.
 *
 * Sends the same shape the extension's apiClient sends: a JD analysis +
 * realistic master profile + JD text. Measures wall-clock from request
 * start to response, and surfaces the backend's reported usage.
 *
 *   PORT=8788 node backend/scripts/time-resume-gen.mjs
 */

const PORT = process.env.PORT ?? '8788';

// Intentionally wide JD touching many umbrella phrases and several categories
// the model puts in `extras` (AI/ML, Security, Soft Skills). This is the
// scenario that hit the "extras.0.items: at most 12 element(s)" cap.
const JD_TEXT = `Senior Full Stack Software Engineer

We're a wellness-tech startup looking for a Senior Full Stack Engineer to own the
complete product lifecycle across NestJS/React, AWS infrastructure, and DevOps.
This is a senior individual-contributor role that owns architectural decisions.

You will:
- Drive full-stack development across the product
- Build and maintain production NestJS services and React TypeScript front-ends
- Own the AWS infrastructure (EC2, RDS Postgres, Redis, S3, CloudFront)
- Drive REST API design and API development across mobile and web clients
- Lead code reviews and mentor mid-level engineers (mentoring, cross-functional collaboration)
- Drive system integration with third-party wellness platforms
- Own version control workflows (Git, GitHub Actions)
- Lead CI/CD pipelines and continuous deployment
- Drive AI/ML integration: LLM workflows, RAG, vector databases, prompt engineering
- Implement authentication, authorization, OAuth, JWT, role-based access control, data encryption
- Production support and incident response
- Performance optimization and observability

Required:
- 5+ years TypeScript / Node.js / NestJS
- Strong React (hooks, state management)
- PostgreSQL + Redis production experience
- AWS services (EC2, RDS, S3, CloudFront, IAM)
- Docker, CI/CD pipelines
- REST API design, JWT authentication
- Version control (Git, GitHub Actions)
- Test automation (Jest, Playwright, unit testing, integration testing)

Nice to have:
- AI/ML experience (LangChain, OpenAI, Anthropic, embeddings, RAG)
- Health/wellness domain experience
- Open source contributions
- Microservices architecture
- Security: SOC2, HIPAA awareness
`;

const ANALYSIS = {
  targetTitle: 'Senior Full Stack Software Engineer',
  seniority: 'senior',
  domain: 'wellness tech',
  requiredSkills: ['typescript', 'nestjs', 'react', 'node.js', 'postgresql', 'redis', 'aws', 'docker', 'ci/cd', 'rest api design'],
  preferredSkills: ['microservices', 'jwt', 'health domain', 'open source'],
  frameworks: ['nestjs', 'react'],
  cloud: ['aws', 'ec2', 'rds', 's3', 'cloudfront'],
  databases: ['postgresql', 'redis'],
  testing: [],
  softSkills: ['mentoring', 'partnership', 'ownership'],
  atsKeywords: ['full-stack', 'nestjs', 'react', 'typescript', 'aws', 'postgres', 'redis', 'docker', 'rest api', 'microservices'],
  domainTerminology: ['wellness', 'health tech'],
  summary: 'Senior Full Stack engineer for a wellness-tech startup, owning product lifecycle across NestJS/React + AWS + DevOps. Requires senior IC ownership, architectural decisions, and mentorship.',
};

const MASTER_PROFILE = {
  contact: {
    fullName: 'Marko Azirovic',
    email: 'princestar81496@gmail.com',
    location: 'Belgrade, Serbia',
  },
  summary:
    'Senior Software Engineer with 9+ years building production systems across web, backend, and AI applications. Strong full-stack experience with React/Next.js/TypeScript on the front-end and Node.js/NestJS/Python/FastAPI on the back-end.',
  skills: {
    languages: ['TypeScript', 'JavaScript', 'Python'],
    frontend: ['React', 'Next.js', 'React Native', 'Tailwind CSS', 'Redux', 'Zustand'],
    backend: ['Node.js', 'Express', 'NestJS', 'FastAPI', 'Flask', 'Django', 'REST', 'GraphQL', 'WebSocket'],
    cloud: ['AWS', 'GCP', 'Docker', 'Kubernetes'],
    databases: ['PostgreSQL', 'MongoDB', 'Redis', 'MySQL', 'Firebase'],
    testing: ['Jest'],
    tools: ['Git', 'GitLab CI', 'GitHub Actions', 'Vite'],
  },
  experience: [
    {
      company: 'Karibu.AI',
      title: 'Senior AI Software Developer',
      location: 'Remote, San Francisco Bay Area',
      startDate: '04/2024',
      endDate: '03/2026',
      bullets: [
        'Built an AI-powered onboarding platform combining LLM workflows with full-stack architecture.',
        'Developed a real-time RAG pipeline using LangChain and Pinecone with hybrid search across 50+ docs.',
        'Designed a conversational chatbot using Claude 3.5 and GPT-4 with prompt engineering, via WebSockets in Node.js + TypeScript.',
        'Built a modular FastAPI backend in Python for onboarding logic, workflows, and chat context persistence.',
        'Delivered production UI with Tailwind, Zustand, micro-frontend architecture for modular components.',
      ],
    },
    {
      company: 'Harvest',
      title: 'Senior AI Full Stack Engineer',
      location: 'Remote, New York',
      startDate: '08/2022',
      endDate: '03/2024',
      bullets: [
        'Built an AI-driven semantic chatbot using LangChain + Pinecone with domain-specific NLP pipelines.',
        'Designed and maintained backend APIs using NestJS and FastAPI for data ingestion and storage.',
        'Implemented a React TypeScript front-end with dynamic charts and responsive dashboards.',
        'Built CI/CD pipelines using GitLab and Docker, improving deployment speed and reducing downtime.',
      ],
    },
    {
      company: 'CalendarPass',
      title: 'Full Stack Software Developer',
      location: 'Remote, NYC Metro',
      startDate: '10/2020',
      endDate: '07/2022',
      bullets: [
        'Enhanced calendar modules using Micro-Frontend Architecture in React, enabling lazy loading and faster UI rendering.',
        'Managed state with Redux + Redux Thunk for event syncing and preferences.',
        'Designed custom APIs with Express.js and built MongoDB schemas for events, reminders, and recurrence.',
      ],
    },
    {
      company: 'Onefile',
      title: 'Full Stack Engineer',
      location: 'Belgrade, Serbia',
      startDate: '05/2017',
      endDate: '09/2020',
      bullets: [
        'Increased user engagement by 30% by improving frontend scalability and responsive performance of a contest platform.',
        'Digitized document workflows through a tablet app with custom CMS backend, lifting sales efficiency 10%.',
      ],
    },
  ],
  projects: [],
  education: [
    {
      institution: 'Educons University',
      degree: "Bachelor's degree",
      field: 'Computer Science',
      startDate: '10/2012',
      endDate: '06/2016',
    },
  ],
  certifications: [],
  extras: [],
};

const JD = {
  source: 'generic',
  url: 'https://example.com/job/wellness-fullstack',
  title: 'Senior Full Stack Software Engineer',
  company: 'Wellness Co',
  location: 'Remote',
  compensation: null,
  description: JD_TEXT,
  extractedAt: new Date().toISOString(),
};

// The /api/resume endpoint no longer pre-analyzes — JD goes directly to the
// model, which does its own internal analysis per the system-prompt rules.
const body = JSON.stringify({
  jd: JD,
  masterProfile: MASTER_PROFILE,
  templateId: 'default-ats',
});
void ANALYSIS; // retained above for documentation only; no longer sent.

console.log(`POST http://localhost:${PORT}/api/resume — body size: ${(body.length / 1024).toFixed(1)} KB`);
const start = Date.now();

const res = await fetch(`http://localhost:${PORT}/api/resume`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body,
});
const elapsedMs = Date.now() - start;

const text = await res.text();
console.log(`HTTP ${res.status} in ${(elapsedMs / 1000).toFixed(2)}s`);

if (!res.ok) {
  console.log('Error body:', text);
  process.exit(1);
}

const json = JSON.parse(text);
const r = json.resume;
console.log('---');
console.log('targetTitle:', r.targetTitle);
console.log('summary  :', r.summary.slice(0, 200), '...');
console.log('experience:', r.experience.length, 'roles');
console.log('  recent  :', r.experience[0].company, '-', r.experience[0].bullets.length, 'bullets');
console.log('skills bucket counts:', Object.fromEntries(
  Object.entries(r.skills).map(([k, v]) => [k, v.length])
));
console.log('extras:', r.extras.length);
console.log('education:', r.education.length, '| certs:', r.certifications.length);
console.log('---');
console.log(`✓ Resume gen completed in ${(elapsedMs / 1000).toFixed(2)}s`);

// ATS umbrella-phrase audit. Lowercase-search the entire serialized resume
// (summary + bullets + skills + extras) for each umbrella phrase the test JD
// uses. These are the same phrases the user's ATS scorer counts separately
// from the granular tech names.
const haystack = JSON.stringify(r).toLowerCase();
const umbrellaPhrases = [
  'full-stack development',
  'full stack development',
  'software development',
  'system integration',
  'technical support',
  'version control',
  'aws services',
  'cloud infrastructure',
  'api development',
  'rest api design',
  'rest apis',
  'ci/cd pipelines',
  'continuous integration',
  'continuous deployment',
  'code review',
  'cross-functional collaboration',
  'mentoring',
  'database design',
  'production support',
  'github actions',
  'microservices',
];
const present = umbrellaPhrases.filter((p) => haystack.includes(p));
const missing = umbrellaPhrases.filter((p) => !haystack.includes(p));
console.log('---');
console.log(`ATS umbrella-phrase audit: ${present.length} / ${umbrellaPhrases.length} present`);
console.log('  PRESENT:', present.join(', ') || '(none)');
console.log('  MISSING:', missing.join(', ') || '(none)');

// Sanity: timeout was set to 180s on both sides.
if (elapsedMs > 60_000) {
  console.log(`⚠ Took ${(elapsedMs / 1000).toFixed(1)}s — over the previous 60s timeout. Good thing we raised it.`);
}
if (elapsedMs > 120_000) {
  console.log('⚠ Over 2 minutes — consider switching LLM_MODEL_RESUME to claude-haiku-4.5 for ~2x speedup at lower quality.');
}
