/**
 * AI module — the only place that talks to LLM providers.
 *
 * chatJson() walks the provider chain (saved key → Groq → OpenAI → Gemini → Anthropic) and moves
 * on after ANY provider error, so one provider being down, out of quota, retired a model, or
 * rejecting a key never blocks the others. Server-key providers have circuit breakers, so a
 * failing provider is skipped for a minute instead of adding latency to every request.
 */
import { isModuleEnabled } from '@/core/env';
import { circuitState, recordFailure, recordSuccess, withTimeout } from '@/core/isolation';
import { UniversalAIAdapter, type VisionImage } from './adapter';
import { hasServerProvider, providerCandidates, type ProviderCandidate } from './providers';

export { UniversalAIAdapter } from './adapter';
export type { VisionImage } from './adapter';
export { defaultModel, detectProvider, providerCandidates, type ProviderCandidate, type ProviderId } from './providers';

export interface AttemptError {
  provider: string;
  source: string;
  error: string;
}

export class AIUnavailableError extends Error {
  constructor(public readonly attempts: AttemptError[]) {
    super(attempts.length
      ? `All AI providers failed: ${attempts.map(a => `${a.provider} (${a.source}): ${a.error}`).join(' | ')}`
      : 'No AI provider is configured.');
    this.name = 'AIUnavailableError';
  }

  /** True when every attempt looks like a quota / rate-limit / capacity problem. */
  get quotaLike(): boolean {
    return this.attempts.length > 0 && this.attempts.every(a => isQuotaLike(a.error));
  }
}

export function isQuotaLike(message: string): boolean {
  const m = message.toLowerCase();
  return /\b(408|409|429|5\d\d)\b/.test(message)
    || m.includes('resource_exhausted')
    || m.includes('quota')
    || m.includes('rate limit')
    || m.includes('overloaded')
    || m.includes('paused after repeated failures');
}

export interface ChatJsonOptions {
  system: string;
  user: string;
  images?: VisionImage[];
  customApiKey?: string | null;
  /** Total time budget across all providers. */
  deadlineMs?: number;
}

export interface ChatJsonResult {
  text: string;
  provider: string;
  source: string;
}

function breakerKey(c: ProviderCandidate): string | null {
  // BYOK keys belong to one user; only shared server keys get a shared breaker.
  return c.source === 'saved key' ? null : `ai:${c.provider}:${c.source}`;
}

export function aiCandidates(customApiKey?: string | null): ProviderCandidate[] {
  return isModuleEnabled('ai') ? providerCandidates(customApiKey) : [];
}

export async function chatJson(opts: ChatJsonOptions): Promise<ChatJsonResult> {
  const candidates = aiCandidates(opts.customApiKey);
  const attempts: AttemptError[] = [];
  const deadline = Date.now() + (opts.deadlineMs ?? 50_000);

  for (const candidate of candidates) {
    const key = breakerKey(candidate);
    if (key && circuitState(key) === 'open') {
      attempts.push({ provider: candidate.provider, source: candidate.source, error: 'paused after repeated failures' });
      continue;
    }
    const remaining = deadline - Date.now();
    if (remaining < 2_000) {
      attempts.push({ provider: candidate.provider, source: candidate.source, error: 'skipped: request time budget exhausted' });
      break;
    }

    try {
      const adapter = new UniversalAIAdapter({
        apiKey: candidate.apiKey,
        provider: candidate.provider,
        modelName: candidate.modelName,
        timeoutMs: Math.min(remaining, 40_000),
      });
      const text = await withTimeout(adapter.chat(opts.system, opts.user, opts.images ?? []), remaining, `ai:${candidate.provider}`);
      if (key) recordSuccess(key);
      return { text, provider: candidate.provider, source: candidate.source };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      if (key) recordFailure(key);
      attempts.push({ provider: candidate.provider, source: candidate.source, error: error.slice(0, 500) });
      console.warn(`[ai] ${candidate.provider} (${candidate.source}) failed, trying next provider:`, error.slice(0, 300));
    }
  }

  throw new AIUnavailableError(attempts);
}

export function aiHealth() {
  const keys = ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY'];
  const open = providerCandidates().some(c => {
    const key = breakerKey(c);
    return key ? circuitState(key) === 'open' : false;
  });
  return {
    enabled: isModuleEnabled('ai'),
    configured: hasServerProvider(),
    circuit: open ? 'open' as const : 'closed' as const,
    providers: keys.filter(k => process.env[k]?.trim()).length,
  };
}
