// ─── Mock the OpenAI SDK before any imports ───────────────────────────────────
const mockParse = jest.fn();
jest.mock('openai', () => {
  return {
    OpenAI: jest.fn().mockImplementation(() => ({
      beta: {
        chat: {
          completions: {
            parse: mockParse,
          },
        },
      },
    })),
  };
});

import { runCodexPipeline } from '../../lib/codex-agent';

// A minimal real image buffer (1x1 white pixel JPEG)
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
  'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN' +
  'DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
  'MjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUE/8QAFBAB' +
  'AAAAAAAAAAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAA' +
  'AAAAAAAA/9oADAMBAAIRAxEAPwCwABmX/9k=',
  'base64'
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOpenAIResponse(parsed: unknown) {
  return {
    choices: [{ message: { parsed } }],
  };
}

// ─── runCodexPipeline – No API key ────────────────────────────────────────────

describe('runCodexPipeline – no API key', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    delete process.env.OPENAI_API_KEY;
    delete process.env.GITHUB_TOKEN;
    mockParse.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('returns mock data when no key is configured (ngo-receipt)', async () => {
    const { data, auditLogs } = await runCodexPipeline(TINY_JPEG, 'ngo-receipt', undefined);
    expect(auditLogs[0].status).toBe('warning');
    expect(auditLogs[0].message).toMatch(/no API key/i);
    expect((data as Record<string, unknown>).donorName).toBe('Rahul Sharma');
  });

  test('returns mock data when no key is configured (factory-weight-slip)', async () => {
    const { data, auditLogs } = await runCodexPipeline(TINY_JPEG, 'factory-weight-slip', undefined);
    expect(auditLogs[0].status).toBe('warning');
    expect((data as Record<string, unknown>).vehicleNumber).toBe('MH-12-AB-1234');
  });
});

// ─── runCodexPipeline – Stage 1 success ───────────────────────────────────────

describe('runCodexPipeline – Stage 1 success', () => {
  beforeEach(() => {
    mockParse.mockReset();
  });

  test('ngo-receipt: Stage 1 succeeds → returns extracted data + audit logs', async () => {
    const ngoData = { date: '2023-10-01', donorName: 'Priya K', amount: 1000, panNumber: 'ABCDE1234F' };
    mockParse.mockResolvedValueOnce(makeOpenAIResponse(ngoData));

    const { data, auditLogs } = await runCodexPipeline(TINY_JPEG, 'ngo-receipt', 'sk-fake-key');

    expect(data).toEqual(ngoData);
    expect(auditLogs.some(l => l.stage === 'Extraction' && l.status === 'success')).toBe(true);
    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  test('factory-weight-slip: Stage 1 succeeds → correct data', async () => {
    const fwData = { date: '2023-10-01', vehicleNumber: 'GJ-01-ZZ-1234', grossWeight: 20000, tareWeight: 6000 };
    mockParse.mockResolvedValueOnce(makeOpenAIResponse(fwData));

    const { data, auditLogs } = await runCodexPipeline(TINY_JPEG, 'factory-weight-slip', 'sk-fake-key');

    expect(data).toEqual(fwData);
    expect(mockParse).toHaveBeenCalledTimes(1);
    expect(auditLogs.some(l => l.stage === 'Validation' && l.status === 'success')).toBe(true);
  });

  test('uses GitHub Models endpoint when key starts with ghp_', async () => {
    const ngoData = { date: '2023-01-01', donorName: 'A', amount: 100 };
    mockParse.mockResolvedValueOnce(makeOpenAIResponse(ngoData));

    await runCodexPipeline(TINY_JPEG, 'ngo-receipt', 'ghp_testtoken12345');
    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  test('uses GitHub Models endpoint when key starts with github_pat_', async () => {
    const ngoData = { date: '2023-01-01', donorName: 'B', amount: 200 };
    mockParse.mockResolvedValueOnce(makeOpenAIResponse(ngoData));

    await runCodexPipeline(TINY_JPEG, 'ngo-receipt', 'github_pat_longtoken12345');
    expect(mockParse).toHaveBeenCalledTimes(1);
  });
});

// ─── runCodexPipeline – Self-Healing (Stage 2) ────────────────────────────────

describe('runCodexPipeline – Self-Healing fallback', () => {
  beforeEach(() => mockParse.mockReset());

  test('escalates to Stage 2 when Stage 1 throws', async () => {
    const fwData = { date: '2023-01-01', vehicleNumber: 'MH-04-AB-9999', grossWeight: 10000, tareWeight: 3000 };
    mockParse
      .mockRejectedValueOnce(new Error('Rate limited'))  // Stage 1 fails
      .mockResolvedValueOnce(makeOpenAIResponse(fwData)); // Stage 2 succeeds

    const { data, auditLogs } = await runCodexPipeline(TINY_JPEG, 'factory-weight-slip', 'sk-fake');

    expect(data).toEqual(fwData);
    expect(mockParse).toHaveBeenCalledTimes(2);
    expect(auditLogs.some(l => l.stage === 'Self-Healing' && l.status === 'success')).toBe(true);
  });

  test('throws final error when both Stage 1 and Stage 2 fail', async () => {
    mockParse
      .mockRejectedValueOnce(new Error('Model error'))
      .mockRejectedValueOnce(new Error('Still failing'));

    await expect(runCodexPipeline(TINY_JPEG, 'ngo-receipt', 'sk-fake')).rejects.toThrow(
      'Codex Pipeline failed to extract document data.'
    );
    expect(mockParse).toHaveBeenCalledTimes(2);
  });

  test('self-healing audit log contains error for stage 1 and warning for stage 2 escalation', async () => {
    const ngoData = { date: '2023-01-01', donorName: 'Test', amount: 500 };
    mockParse
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(makeOpenAIResponse(ngoData));

    const { auditLogs } = await runCodexPipeline(TINY_JPEG, 'ngo-receipt', 'sk-fake');

    expect(auditLogs.some(l => l.stage === 'Extraction' && l.status === 'error')).toBe(true);
    expect(auditLogs.some(l => l.stage === 'Self-Healing' && l.status === 'warning')).toBe(true);
    expect(auditLogs.some(l => l.stage === 'Self-Healing' && l.status === 'success')).toBe(true);
  });
});

// ─── runCodexPipeline – Stage 3 Validation ───────────────────────────────────

describe('runCodexPipeline – Stage 3 Validation', () => {
  beforeEach(() => mockParse.mockReset());

  test('factory: warns when tare >= gross weight', async () => {
    const fwData = { date: '2023-01-01', vehicleNumber: 'MH-01-XX-0001', grossWeight: 5000, tareWeight: 5000 };
    mockParse.mockResolvedValueOnce(makeOpenAIResponse(fwData));

    const { auditLogs } = await runCodexPipeline(TINY_JPEG, 'factory-weight-slip', 'sk-fake');
    expect(auditLogs.some(l => l.stage === 'Validation' && l.status === 'warning')).toBe(true);
    expect(auditLogs.find(l => l.stage === 'Validation' && l.status === 'warning')?.message).toMatch(/Tare.*>=/);
  });

  test('factory: passes when tare < gross weight', async () => {
    const fwData = { date: '2023-01-01', vehicleNumber: 'MH-01-XX-0002', grossWeight: 15000, tareWeight: 5000 };
    mockParse.mockResolvedValueOnce(makeOpenAIResponse(fwData));

    const { auditLogs } = await runCodexPipeline(TINY_JPEG, 'factory-weight-slip', 'sk-fake');
    const validationLogs = auditLogs.filter(l => l.stage === 'Validation');
    expect(validationLogs.every(l => l.status === 'success')).toBe(true);
  });

  test('ngo: warns when amount > 2000 and PAN is missing', async () => {
    const ngoData = { date: '2023-01-01', donorName: 'Big Donor', amount: 5000, panNumber: '' };
    mockParse.mockResolvedValueOnce(makeOpenAIResponse(ngoData));

    const { auditLogs } = await runCodexPipeline(TINY_JPEG, 'ngo-receipt', 'sk-fake');
    expect(auditLogs.some(l => l.stage === 'Validation' && l.status === 'warning')).toBe(true);
    expect(auditLogs.find(l => l.stage === 'Validation' && l.status === 'warning')?.message).toMatch(/PAN legally required/);
  });

  test('ngo: passes compliance when amount <= 2000 with no PAN', async () => {
    const ngoData = { date: '2023-01-01', donorName: 'Small Donor', amount: 500, panNumber: '' };
    mockParse.mockResolvedValueOnce(makeOpenAIResponse(ngoData));

    const { auditLogs } = await runCodexPipeline(TINY_JPEG, 'ngo-receipt', 'sk-fake');
    const validationLogs = auditLogs.filter(l => l.stage === 'Validation');
    expect(validationLogs.every(l => l.status === 'success')).toBe(true);
  });

  test('ngo: passes compliance when amount > 2000 and PAN is present', async () => {
    const ngoData = { date: '2023-01-01', donorName: 'Legal Donor', amount: 10000, panNumber: 'ABCDE1234F' };
    mockParse.mockResolvedValueOnce(makeOpenAIResponse(ngoData));

    const { auditLogs } = await runCodexPipeline(TINY_JPEG, 'ngo-receipt', 'sk-fake');
    const validationLogs = auditLogs.filter(l => l.stage === 'Validation');
    expect(validationLogs.every(l => l.status === 'success')).toBe(true);
  });

  test('unsupported profileId throws error', async () => {
    await expect(
      runCodexPipeline(TINY_JPEG, 'unsupported-profile', 'sk-fake')
    ).rejects.toThrow('Unsupported profile ID');
  });
});
