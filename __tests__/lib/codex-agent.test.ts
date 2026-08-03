// ─── Mock UniversalAIAdapter before any imports ───────────────────────────────────
const mockChat = jest.fn();
jest.mock('../../lib/UniversalAIAdapter', () => {
  return {
    UniversalAIAdapter: jest.fn().mockImplementation(() => ({
      chat: mockChat,
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

function makeAdapterResponse(parsedObj: unknown) {
  mockChat.mockResolvedValueOnce(JSON.stringify(parsedObj));
}

// ─── runCodexPipeline – No API key ────────────────────────────────────────────

describe('runCodexPipeline – no API key', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    delete process.env.OPENAI_API_KEY;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GEMINI_API_KEY;
    mockChat.mockReset();
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
    expect(auditLogs[0].message).toMatch(/no API key/i);
    expect((data as Record<string, unknown>).vehicleNumber).toBe('MH-12-AB-1234');
  });
});

// ─── runCodexPipeline – With API key ──────────────────────────────────────────

describe('runCodexPipeline – with API key', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    process.env.OPENAI_API_KEY = 'test-key';
    mockChat.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('Stage 1 Success: extracts valid ngo-receipt data on first try', async () => {
    makeAdapterResponse({
      date: '2023-10-24',
      donorName: 'John Doe',
      amount: 1500,
      panNumber: 'ABCDE1234F',
    });

    const { data, auditLogs } = await runCodexPipeline(TINY_JPEG, 'ngo-receipt', undefined);

    // Verify chat was called
    expect(mockChat).toHaveBeenCalledTimes(1);

    // Verify valid data returned
    expect(data).toMatchObject({
      date: '2023-10-24',
      donorName: 'John Doe',
      amount: 1500,
      panNumber: 'ABCDE1234F',
    });

    // Check audit logs
    const stages = auditLogs.map(log => log.stage);
    expect(stages).toEqual(['Extraction', 'Extraction', 'Validation', 'Validation']);
    expect(auditLogs[0].status).toBe('success');
    expect(auditLogs[1].status).toBe('success');
  });

  test('Stage 1 Success: extracts valid factory-weight-slip data', async () => {
    makeAdapterResponse({
      date: '2023-10-24',
      vehicleNumber: 'MH-12-3456',
      grossWeight: 10000,
      tareWeight: 4000,
    });

    const { data, auditLogs } = await runCodexPipeline(TINY_JPEG, 'factory-weight-slip', undefined);

    expect(data).toMatchObject({
      vehicleNumber: 'MH-12-3456',
      grossWeight: 10000,
      tareWeight: 4000,
    });
    expect(auditLogs.some(log => log.stage === 'Self-Healing')).toBe(false);
  });

  test('Stage 2 Fallback: recovers when Stage 1 fails', async () => {
    // Make first call throw, second call succeed
    mockChat
      .mockRejectedValueOnce(new Error('Stage 1 parsing error'))
      .mockResolvedValueOnce(JSON.stringify({
        date: '2023-10-24',
        donorName: 'Recovered Name',
        amount: 500,
        panNumber: 'RECOV1234F',
      }));

    const { data, auditLogs } = await runCodexPipeline(TINY_JPEG, 'ngo-receipt', undefined);

    expect(mockChat).toHaveBeenCalledTimes(2);

    expect(data).toMatchObject({
      donorName: 'Recovered Name',
      amount: 500,
    });

    // We should see a failure for Extraction, and success for Self-Healing
    const extractionFail = auditLogs.find(l => l.stage === 'Extraction' && l.status === 'error');
    const healingSuccess = auditLogs.find(l => l.stage === 'Self-Healing' && l.status === 'success');

    expect(extractionFail).toBeDefined();
    expect(healingSuccess).toBeDefined();
  });

  test('Stage 2 Fallback: throws error if both stages fail', async () => {
    mockChat
      .mockRejectedValueOnce(new Error('Stage 1 error'))
      .mockRejectedValueOnce(new Error('Stage 2 error'));

    await expect(runCodexPipeline(TINY_JPEG, 'ngo-receipt', undefined))
      .rejects.toThrow(/Codex Pipeline failed to extract document data/);

    expect(mockChat).toHaveBeenCalledTimes(2);
  });

  test('Throws specific 401 Invalid API Key error', async () => {
    mockChat
      .mockRejectedValueOnce(new Error('Stage 1 error'))
      .mockRejectedValueOnce(new Error('401 Unauthorized'));

    await expect(runCodexPipeline(TINY_JPEG, 'ngo-receipt', undefined))
      .rejects.toThrow(/Invalid API Key/);
  });

  test('Unsupported profile ID throws error immediately', async () => {
    await expect(runCodexPipeline(TINY_JPEG, 'invalid-profile', undefined))
      .rejects.toThrow('Unsupported profile ID');
    expect(mockChat).not.toHaveBeenCalled();
  });
});

// ─── runCodexPipeline – Validation Logic ──────────────────────────────────────

describe('runCodexPipeline – Validation Stage', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    process.env.OPENAI_API_KEY = 'test-key';
    mockChat.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('ngo-receipt: throws warning if amount > 2000 and no PAN', async () => {
    makeAdapterResponse({
      date: '2023-10-24',
      donorName: 'Anonymous',
      amount: 2500, // > 2000
      panNumber: '', // Missing
    });

    const { auditLogs } = await runCodexPipeline(TINY_JPEG, 'ngo-receipt', undefined);
    
    const validationLog = auditLogs.find(l => l.stage === 'Validation' && l.status === 'warning');
    expect(validationLog).toBeDefined();
    expect(validationLog?.message).toMatch(/PAN legally required/i);
  });

  test('ngo-receipt: passes if amount > 2000 and PAN is provided', async () => {
    makeAdapterResponse({
      date: '2023-10-24',
      donorName: 'Anonymous',
      amount: 2500,
      panNumber: 'ABCDE1234F',
    });

    const { auditLogs } = await runCodexPipeline(TINY_JPEG, 'ngo-receipt', undefined);
    
    const validationSuccess = auditLogs.find(l => l.stage === 'Validation' && l.status === 'success' && l.message.includes('passed'));
    expect(validationSuccess).toBeDefined();
  });

  test('factory-weight-slip: throws warning if tare >= gross', async () => {
    makeAdapterResponse({
      date: '2023-10-24',
      vehicleNumber: 'MH-12-3456',
      grossWeight: 5000,
      tareWeight: 6000, // Invalid: Tare > Gross
    });

    const { auditLogs } = await runCodexPipeline(TINY_JPEG, 'factory-weight-slip', undefined);
    
    const validationLog = auditLogs.find(l => l.stage === 'Validation' && l.status === 'warning');
    expect(validationLog).toBeDefined();
    expect(validationLog?.message).toMatch(/Logical inconsistency/i);
  });

  test('factory-weight-slip: passes if tare < gross', async () => {
    makeAdapterResponse({
      date: '2023-10-24',
      vehicleNumber: 'MH-12-3456',
      grossWeight: 10000,
      tareWeight: 4000,
    });

    const { auditLogs } = await runCodexPipeline(TINY_JPEG, 'factory-weight-slip', undefined);
    
    const validationSuccess = auditLogs.find(l => l.stage === 'Validation' && l.status === 'success' && l.message.includes('passed'));
    expect(validationSuccess).toBeDefined();
  });
});
