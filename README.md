# Resume Maker — AI-Powered Job Bidding Chrome Extension

A production-grade Chrome Extension that detects job postings, extracts and analyzes job descriptions with AI, generates ATS-optimized resumes and tailored proposals, and exports professional PDF resumes.

## Monorepo layout

```
resume_maker/
├── extension/   # Manifest V3 Chrome Extension (React + Vite + TS + Tailwind)
└── backend/    # Express + TypeScript API that brokers all Claude (Anthropic) traffic
```

The extension **never** holds Anthropic credentials. All AI traffic goes:

```
Extension ──► Backend API ──► Anthropic (Claude)
```

The backend uses Claude's native structured outputs (`messages.parse()` + `zodOutputFormat`),
so JSON shape is enforced at the API layer against the Zod schemas in `backend/src/schemas/`.
Prompt caching is enabled on the system prompt and the candidate's master profile.

## Phase status

| Phase | Scope                                                           | Status |
| ----- | --------------------------------------------------------------- | ------ |
| 1     | Extension bootstrap, popup, content scripts, JD extraction      | done   |
| 2     | Backend bootstrap, OpenAI service, JD analysis engine           | done   |
| 3     | Resume JSON generation + deterministic React render             | done   |
| 4     | PDF pipeline (html2pdf in popup, Puppeteer service in backend)  | stub   |
| 5     | Proposal generation + auto-fill                                 | partial (proposal API done; auto-fill stub) |
| 6     | History, templates, UX polish                                   | partial (history wired, single template) |

## Prerequisites

- Node.js 18.18+
- npm 9+
- An Anthropic API key (https://console.anthropic.com)

## First-time setup

```bash
npm install
cp backend/.env.example backend/.env
cp extension/.env.example extension/.env
# Edit backend/.env and set ANTHROPIC_API_KEY and JWT_SECRET
```

## Development

```bash
# Run extension dev build (watches) and backend API together
npm run dev

# Or individually:
npm run dev:extension   # Vite builds to extension/dist in watch mode
npm run dev:backend     # tsx watches backend/src
```

Load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `extension/dist`

## Production build

```bash
npm run build
```

Outputs:

- `extension/dist/` — bundle to upload to the Chrome Web Store
- `backend/dist/` — compiled Node.js server

## Architecture

See [docs/architecture.md](docs/architecture.md) if present, or the source comments in:

- `extension/src/adapters/` — per-site JD extraction
- `extension/src/background/` — service worker + API bridge
- `extension/src/content/` — content script + DOM cleanup
- `backend/src/services/` — OpenAI + analyze + resume + proposal
- `backend/src/schemas/` — Zod schemas that AI output is validated against
- `backend/src/prompts/` — versioned prompt modules

## Security

- `ANTHROPIC_API_KEY` lives only in `backend/.env` — never bundled into the extension
- Extension authenticates to the backend via a short-lived JWT exchanged on install
- All AI output is structurally enforced by Claude's `output_config.format` and additionally
  Zod-validated (length bounds, refinements) before being returned to the extension
- Rate limiting per user/IP at the backend layer
