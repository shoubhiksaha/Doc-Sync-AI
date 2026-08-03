# DocSync AI Agents

DocSync AI utilizes a highly deterministic and resilient `UniversalAIAdapter` pattern to orchestrate multi-modal AI agents across different providers (OpenAI, Anthropic, Google Gemini, and Groq).

## Architecture

1. **Universal AI Adapter (`lib/UniversalAIAdapter.ts`)**
   - Serves as the primary Agent Orchestrator.
   - Automatically handles fallback routing (e.g., failing over from OpenAI to Gemini if a rate limit or 5xx error occurs).
   - Abstracts away provider-specific prompt formatting, allowing the system to use identical agent prompts across all models.

2. **Extraction Agent**
   - Triggered via `/api/extract-freeform`
   - Uses zero-shot vision-language models (VLM) to analyze unstructured documents (e.g., NGO receipts or factory slips).
   - Guided by a strict JSON-schema prompt to enforce deterministic outputs, regardless of the underlying LLM provider.

3. **Schema Suggestion Agent**
   - Triggered via `/api/sheets/suggest-schema`
   - Analyzes the output of the Extraction Agent to dynamically generate Google Sheets column configurations and data types based on the raw extracted payload.

## Resilience & Persistence
The agents are designed to be entirely stateless. In "Live" mode, they fetch API credentials dynamically via encrypted cookies or Firestore. In "Demo" mode, they fall back to server-side seeded environment variables to ensure zero-friction testing.
