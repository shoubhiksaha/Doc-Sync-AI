# DocSync AI - Pitch Deck & Presentation

## Slide 1: Title Slide
**DocSync AI**  
*Zero-Storage Agentic Document Intelligence for India's Informal Economy*  
**Track:** Theme 6 — AI Agents for Bharat's Businesses  
**Builder:** Domgesh World

## Slide 2: The Problem
* India has ~63 million MSMEs running on paper (kachha bills, delivery challans, handwritten receipts).
* Factory accountants type 50-200 bills manually daily.
* NGOs face audit mismatches due to paper-based receipting.
* **Impact:** 3+ hours wasted daily per person, financial leakage, and lost paper trails. Existing Enterprise OCR is too expensive (₹5–20 lakh/year).

## Slide 3: The Solution
* **DocSync AI** allows workers to snap a photo of any physical document using a mobile PWA.
* **AI Extraction:** Extracts structured JSON with vision models from Gemini, OpenAI, Groq or Anthropic, falling back automatically between providers.
* **Human-in-the-Loop (HITL):** Per-field confidence scores and side-by-side review against the original photo before anything is synced.
* **Zero Storage:** document data is not stored in DocSync's app database; it is sent to user-selected destinations.

## Slide 4: Agentic Architecture & Technical Win
* **Agentic Pipeline:** Multi-provider extraction → document-specific business-rule checks (PAN compliance, weight logic) → human review → isolated sync to Sheets, Notion and Drive.
* **Zero Infrastructure Liability:** DocSync keeps no copy of user documents; data goes only to the destinations the user picks.
* **Smart Compression:** Client- and server-side compression keeps uploads under Vercel's 4.5MB limit and stores compact WebP archive copies.
* **Enterprise Security:** AES-256-GCM encrypted BYOK (Bring Your Own Key), envelope encryption for stored keys, signed demo sessions and per-route rate limits.
* **Fault Isolation:** Each module (AI, Sheets, Notion, media, transcription) has its own timeout, kill switch and circuit breaker — one outage never takes down the rest.

## Slide 5: The Demo
* **[🎥 Watch Demo Video](https://youtu.be/4H7RTwGbt1I)**
* **[🌐 Live App](https://docsync.analogdigital.tech)**
