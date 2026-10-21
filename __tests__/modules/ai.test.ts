import { aiHealth, AIUnavailableError, chatJson, detectProvider, isQuotaLike, providerCandidates } from '@/modules/ai';
import { BREAKER_THRESHOLD, resetBreakers } from '@/core/isolation';

const KEYS = ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'MODULE_AI'];

function okResponse(content: string) {
  return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
}
function errResponse(status: number, body = '') {
  return { ok: false, status, text: async () => body };
}

describe('modules/ai', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env = { ...saved };
    KEYS.forEach(k => delete process.env[k]);
    resetBreakers();
    global.fetch = jest.fn();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => { process.env = saved; });

  describe('detectProvider', () => {
    it('detects Anthropic keys before the generic sk- prefix', () => {
      expect(detectProvider('sk-ant-api03-abc')).toBe('anthropic');
      expect(detectProvider('sk-proj-abc')).toBe('openai');
      expect(detectProvider('sk-abc')).toBe('openai');
      expect(detectProvider('gsk_abc')).toBe('groq');
      expect(detectProvider('AIzaSyabc')).toBe('google');
      expect(detectProvider('AQ.abc')).toBe('google');
    });
  });

  describe('providerCandidates', () => {
    it('orders saved key first, then server keys, without duplicates', () => {
      process.env.GROQ_API_KEY = 'gsk_server';
      process.env.OPENAI_API_KEY = 'sk-server';
      process.env.GEMINI_API_KEY = 'AIza-server';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-server';
      const list = providerCandidates(' sk-server ');
      expect(list.map(c => `${c.provider}:${c.source}`)).toEqual([
        'openai:saved key', 'groq:GROQ_API_KEY', 'google:GEMINI_API_KEY', 'anthropic:ANTHROPIC_API_KEY',
      ]);
    });

    it('lets models be overridden per environment', () => {
      process.env.GROQ_API_KEY = 'gsk_x';
      process.env.GROQ_VISION_MODEL = 'custom-groq';
      expect(providerCandidates()[0].modelName).toBe('custom-groq');
    });

    it('returns nothing when no keys exist', () => {
      expect(providerCandidates()).toEqual([]);
    });
  });

  describe('chatJson', () => {
    it('falls through to the next provider on ANY error, including 400/401/404', async () => {
      process.env.GROQ_API_KEY = 'gsk_x';
      process.env.OPENAI_API_KEY = 'sk-x';
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(errResponse(401, 'bad key'))        // saved key (openai)
        .mockResolvedValueOnce(errResponse(400, 'model_decommissioned')) // groq
        .mockResolvedValueOnce(okResponse('{"ok":true}'));          // openai env
      const res = await chatJson({ system: 's', user: 'u', customApiKey: 'sk-byok' });
      expect(res).toEqual({ text: '{"ok":true}', provider: 'openai', source: 'OPENAI_API_KEY' });
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('throws AIUnavailableError with every attempt when all fail', async () => {
      process.env.OPENAI_API_KEY = 'sk-x';
      (global.fetch as jest.Mock).mockResolvedValue(errResponse(429, 'quota'));
      const err = await chatJson({ system: 's', user: 'u' }).catch(e => e);
      expect(err).toBeInstanceOf(AIUnavailableError);
      expect(err.attempts).toHaveLength(1);
      expect(err.quotaLike).toBe(true);
    });

    it('skips a server provider whose circuit is open', async () => {
      process.env.OPENAI_API_KEY = 'sk-x';
      process.env.GEMINI_API_KEY = 'AIza-x';
      (global.fetch as jest.Mock).mockResolvedValue(errResponse(500));
      for (let i = 0; i < BREAKER_THRESHOLD; i++) await chatJson({ system: 's', user: 'u' }).catch(() => undefined);
      (global.fetch as jest.Mock).mockClear();
      await chatJson({ system: 's', user: 'u' }).catch(() => undefined);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(aiHealth().circuit).toBe('open');
    });

    it('does nothing when the ai module is switched off', async () => {
      process.env.OPENAI_API_KEY = 'sk-x';
      process.env.MODULE_AI = 'off';
      await expect(chatJson({ system: 's', user: 'u' })).rejects.toThrow('No AI provider is configured.');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  it('isQuotaLike', () => {
    expect(isQuotaLike('openai API Error: 429 - x')).toBe(true);
    expect(isQuotaLike('RESOURCE_EXHAUSTED')).toBe(true);
    expect(isQuotaLike('openai API Error: 401 - bad key')).toBe(false);
  });

  it('aiHealth reports configuration without exposing keys', () => {
    expect(aiHealth()).toMatchObject({ enabled: true, configured: false, circuit: 'closed', providers: 0 });
    process.env.GEMINI_API_KEY = 'AIza-x';
    const health = aiHealth();
    expect(health.configured).toBe(true);
    expect(JSON.stringify(health)).not.toContain('AIza');
  });
});
