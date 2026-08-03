# DocSync AI - AI Agents for Bharat's Businesses

[![Live Demo](https://img.shields.io/badge/Live_App-docsync.analogdigital.tech-blue?style=for-the-badge)](https://docsync.analogdigital.tech)
[![Demo Video](https://img.shields.io/badge/Demo_Video-Watch_Here-red?style=for-the-badge)](https://youtu.be/4H7RTwGbt1I)
[![Presentation](https://img.shields.io/badge/Pitch_Deck-View_Presentation-green?style=for-the-badge)](./PRESENTATION.md)

DocSync AI is a full-stack, mobile-first web app (PWA) designed to eliminate manual data entry for Indian NGOs and factory floors. It leverages vision AI to instantly extract structured data from unstructured physical documents (receipts, delivery challans, slips) and automatically synchronizes them to Google Sheets and Notion.

**Track 6: AI Agents for Bharat's Businesses**

## Prerequisites
* **Demo Mode:** Deploys and runs the full demo with NO login and NO API key required from the user. It uses server-side environment variables and seeded storage for a zero-friction demo experience.
* **Live Mode (Optional):** Requires a Google OAuth Client ID, a Google Service Account (for background Sheets syncing), and an `OPENAI_API_KEY` (or Groq/Gemini key) to power the extraction engine dynamically per-user.

## Run Locally

```bash
# 1. Install dependencies
npm install

# 2. Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser. Click **"Try Demo Mode (No Login)"** to test the complete extraction and sync workflow instantly.

## Vercel Deploy (5-Minute Guide)
1. Push this repository to GitHub.
2. Go to [Vercel](https://vercel.com) and click **"Add New Project"**.
3. Import your GitHub repository.
4. In the **Environment Variables** section, copy and paste the contents of `.env.example`. Replace the placeholder values for `OPENAI_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_PRIVATE_KEY` with real values to ensure Demo Mode works globally.
5. Click **Deploy**. Your app will be live and ready for testing in under 5 minutes.

## How Codex Built This
* **Hackathon Transparency Statement:** Planning, wireframes, and architecture were done using free external tools; all application code was generated and iterated on with Codex.

Codex orchestrated this entire application, from the Next.js App Router scaffolding to the complex multi-modal AI abstractions. 
* **Multi-model Architecture:** Built a `UniversalAIAdapter` that seamlessly routes between OpenAI, Groq, and Gemini, providing automatic fallback logic.
* **Serverless Resiliency:** Solved Next.js serverless limitations by implementing client-side image compression (`HTML5 Canvas`), entirely bypassing Vercel's strict 4.5MB payload limits before hitting the backend.
* **Seamless Testing:** Implemented a robust "Demo Mode" that dynamically mocks Google OAuth and Google Drive scopes so hackathon judges can test the full PWA without a single configuration step.


