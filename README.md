# DocSync AI - AI Agents for Bharat's Businesses

[![Live Demo](https://img.shields.io/badge/Live_App-docsync.analogdigital.tech-blue?style=for-the-badge)](https://docsync.analogdigital.tech)
[![Demo Video](https://img.shields.io/badge/Demo_Video-Watch_Here-red?style=for-the-badge)](https://youtu.be/4H7RTwGbt1I)
[![Presentation](https://img.shields.io/badge/Pitch_Deck-View_Presentation-green?style=for-the-badge)](./PRESENTATION.md)

DocSync AI is a full-stack, mobile-first web app (PWA) designed to eliminate manual data entry for Indian NGOs and factory floors. It leverages vision AI to instantly extract structured data from unstructured physical documents (receipts, delivery challans, slips) and automatically synchronizes them to Google Sheets and Notion.

**Track 6: AI Agents for Bharat's Businesses**

## Prerequisites
* **Demo Mode:** Runs the full flow with NO login and NO API key from the user. Demo users get a signed, rate-limited session that uses the server's AI keys (within `DEMO_DAILY_AI_LIMIT`) and writes to one shared demo Google Sheet. Images and voice notes are not stored in demo mode.
* **Live Mode (Optional):** Requires a Google OAuth client. Signed-in users get their own private spreadsheets and Drive folder, and can bring their own Gemini / Groq / OpenAI / Anthropic key.

All variables are documented in [`.env.example`](./.env.example).

## Run Locally

```bash
npm install
npm run dev            # http://localhost:3000 → "Try the demo, no sign-in"
```

Checks (the same ones CI runs):

```bash
npm run lint && npm run typecheck
npm run test:coverage
npm run build && npm run test:e2e   # Playwright smoke + accessibility/layout tests (desktop and phone) on the production build
npm run setup:hooks                 # local pre-push guard (secret scan, no direct pushes to main/staging)
```

## Architecture

DocSync is split into independent modules — `ai`, `extraction`, `transcription`, `sheets`, `notion`, `media`, `settings`, `profiles` and the `sync` orchestrator — each with one public entry point. Every call between them has a timeout, a kill switch (`MODULE_<NAME>=off`) and a circuit breaker, so **a failure in one module never takes down the others**: if Notion is down, rows still reach Google Sheets; if transcription fails, scanning still works. `GET /api/health` reports the state of every module.

Each document type (NGO receipts, factory weight slips, …) is a self-contained profile in `modules/profiles/`, so a document type can be added or changed without touching the rest.

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Using it

1. **Pick a document type** and add a photo: take one, upload photos or a PDF (up to 4 pages), drag and drop, or paste. Reading starts straight away.
2. **Check the details.** Fields that need a look are marked *Check* or *Missing*; edit values in place, rename, remove (restorable) or add fields, and add a typed or voice note.
3. **Save.** The first save creates your Google Sheet automatically. The result screen shows where the record went (Sheet, Notion, Drive) and lets you retry any destination that failed.

Save the same fields twice and DocSync offers to remember them: next time it fills them in, and saves on its own after a short countdown when everything was read clearly. Photos taken offline wait under **Recent scans** on the home page. The app is available in English and Hindi, works on phones and desktops, and can be installed as an app.

## Deployment

Deploys run only from GitHub Actions, with the same release flow as AI Planner: feature branch → PR into `staging` (tests, owner approval, deploy to the Vercel staging environment, contract tests) → the same branch → PR into `main` (staging-provenance check, tests, owner approval, production deploy, contract tests). Staging never merges into main.

See [docs/RELEASE_FLOW.md](./docs/RELEASE_FLOW.md), [docs/release_checklist.md](./docs/release_checklist.md) and [docs/branch_protection.md](./docs/branch_protection.md).

## How Codex Built This
* **Hackathon Transparency Statement:** Planning, wireframes, and architecture were done using free external tools; all application code was generated and iterated on with Codex.

Codex orchestrated this entire application, from the Next.js App Router scaffolding to the complex multi-modal AI abstractions. 
* **Multi-model Architecture:** Built a `UniversalAIAdapter` that routes between OpenAI, Groq, Gemini and Anthropic, with automatic fallback to the next provider on any error.
* **Serverless Resiliency:** Solved Next.js serverless limitations by implementing client-side image compression (`HTML5 Canvas`), entirely bypassing Vercel's strict 4.5MB payload limits before hitting the backend.
* **Seamless Testing:** A "Demo Mode" with signed guest sessions and a shared demo sheet, so hackathon judges can test the full PWA without a single configuration step.


