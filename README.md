# DocSync AI - AI Agents for Bharat's Businesses

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

## 5-Line Demo Video Script
1. *(Show Mobile UI)* "Welcome to DocSync AI. I'm a factory manager checking in a delivery slip, so I'll hit 'Scan Document'."
2. *(Take Photo)* "I just snap a photo of this messy, handwritten receipt."
3. *(Show AI Extraction)* "Our vision agent instantly parses the chaotic handwriting into perfect structured JSON data, automatically categorizing items and prices."
4. *(Show Approval)* "I confirm the data looks good, and DocSync immediately syncs this straight into our master Google Sheet and Notion."
5. *(Show Google Sheet)* "No manual typing, no lost paperwork. Instant digital ledgers for Bharat's businesses."
