import sharp from 'sharp';
import { resetBreakers } from '@/core/isolation';
import { buildSystemPrompt, extractFields, ExtractionUnavailableError, normalizeFields } from '@/modules/extraction';
import { getProfile } from '@/modules/profiles';

const KEYS = ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'MODULE_EXTRACTION', 'DEMO_FALLBACK_ON_AI_QUOTA'];

let image: Buffer;
beforeAll(async () => {
  image = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#ffffff' } }).png().toBuffer();
});

function modelReply(content: unknown) {
  return { ok: true, json: async () => ({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] }) };
}

describe('modules/extraction', () => {
  const saved = { ...process.env };
  const ngo = getProfile('ngo-receipt')!;
  beforeEach(() => {
    process.env = { ...saved };
    KEYS.forEach(k => delete process.env[k]);
    resetBreakers();
    global.fetch = jest.fn();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => { process.env = saved; });

  it('returns profile mock data (with validation) when no provider is configured', async () => {
    const res = await extractFields({ document: image, profile: ngo });
    expect(res.isMock).toBe(true);
    expect(res.fields.map(f => f.key)).toContain('donorName');
    expect(res.warnings).toEqual([]);
    expect(res.stats.originalSize).toBe(image.length);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('extracts, normalizes and validates fields from the model', async () => {
    process.env.OPENAI_API_KEY = 'sk-x';
    (global.fetch as jest.Mock).mockResolvedValue(modelReply({
      documentType: 'Donation receipt',
      fields: [
        { key: 'amount', label: 'Amount', value: 5000, confidence: 140, category: 'financial' },
        { label: 'Donor Name', value: 'Asha', confidence: '90', category: 'weird' },
        { key: '', label: '', value: 'dropped' },
      ],
    }));
    const res = await extractFields({ document: image, profile: ngo, focusFields: ['Receipt No'] });
    expect(res.isMock).toBe(false);
    expect(res.provider).toBe('openai');
    expect(res.fields).toEqual([
      { key: 'amount', label: 'Amount', value: '5000', confidence: 100, category: 'financial' },
      { key: 'donorName', label: 'Donor Name', value: 'Asha', confidence: 90, category: 'other' },
    ]);
    expect(res.warnings[0]).toMatch(/PAN/);
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('Receipt No');
  });

  it('rejects unreadable model output with a clear error', async () => {
    process.env.OPENAI_API_KEY = 'sk-x';
    (global.fetch as jest.Mock).mockResolvedValue(modelReply('not json'));
    await expect(extractFields({ document: image, profile: ngo })).rejects.toThrow(ExtractionUnavailableError);
  });

  it('maps all-providers-out-of-quota to a quota error, or to mock data when the demo fallback is on', async () => {
    process.env.OPENAI_API_KEY = 'sk-x';
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 429, text: async () => 'quota' });
    const err = await extractFields({ document: image, profile: ngo }).catch(e => e);
    expect(err).toBeInstanceOf(ExtractionUnavailableError);
    expect(err.quotaLike).toBe(true);

    process.env.DEMO_FALLBACK_ON_AI_QUOTA = 'true';
    resetBreakers();
    const res = await extractFields({ document: image, profile: ngo });
    expect(res).toMatchObject({ isMock: true, quotaFallback: true });
  });

  it('honours the extraction kill switch', async () => {
    process.env.MODULE_EXTRACTION = 'off';
    await expect(extractFields({ document: image, profile: ngo })).rejects.toThrow('disabled');
  });

  it('normalizeFields de-duplicates keys and caps lengths', () => {
    const out = normalizeFields([
      { key: 'a', label: 'A', value: 'x'.repeat(3000) },
      { key: 'a', label: 'A2', value: { nested: true } },
      'garbage',
    ]);
    expect(out[0].value).toHaveLength(2000);
    expect(out[1].key).toBe('a2');
    expect(out[1].value).toBe('{"nested":true}');
    expect(normalizeFields('nope')).toEqual([]);
  });

  it('the prompt includes the profile context and priority fields', () => {
    const prompt = buildSystemPrompt(ngo, ['Custom Field']);
    expect(prompt).toContain('NGO donation receipt');
    expect(prompt).toContain('PAN Number');
    expect(prompt).toContain('Custom Field');
  });
});
