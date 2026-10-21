const incr = jest.fn();
const pexpire = jest.fn();
jest.mock('@upstash/redis/cloudflare', () => ({ Redis: jest.fn().mockImplementation(() => ({ incr, pexpire })) }));

import { checkDemoDailyBudget, checkRateLimit, clientIp, consume, limitFor, rateGroupFor, resetRateLimits } from '@/core/rate-limit';

describe('core/rate-limit', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env = { ...saved };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    resetRateLimits();
    incr.mockReset();
    pexpire.mockReset();
  });
  afterAll(() => { process.env = saved; });

  it('groups routes', () => {
    expect(rateGroupFor('/api/extract-freeform')).toBe('ai');
    expect(rateGroupFor('/api/transcribe')).toBe('ai');
    expect(rateGroupFor('/api/sync')).toBe('write');
    expect(rateGroupFor('/api/sheets/create')).toBe('write');
    expect(rateGroupFor('/api/auth/guest')).toBe('guest-issue');
    expect(rateGroupFor('/api/telemetry')).toBe('telemetry');
    expect(limitFor('telemetry', 'anonymous')).toBe(0);
    expect(rateGroupFor('/api/settings')).toBe('default');
    expect(limitFor('ai', 'guest')).toBeLessThan(limitFor('ai', 'user'));
  });

  it('reads the client IP from proxy headers', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '1.1.1.1' }))).toBe('1.1.1.1');
    expect(clientIp(new Headers({ 'x-forwarded-for': '2.2.2.2, 10.0.0.1' }))).toBe('2.2.2.2');
    expect(clientIp(new Headers())).toBe('unknown');
  });

  it('allows up to the limit in memory, then blocks, then resets', async () => {
    const now = 1_000;
    expect(await consume('k', 2, 100, now)).toBe(true);
    expect(await consume('k', 2, 100, now)).toBe(true);
    expect(await consume('k', 2, 100, now)).toBe(false);
    expect(await consume('k', 2, 100, now + 101)).toBe(true);
  });

  it('a zero limit always blocks', async () => {
    expect(await consume('z', 0)).toBe(false);
  });

  it('applies per-caller limits per route group', async () => {
    const headers = new Headers({ 'x-real-ip': '9.9.9.9' });
    for (let i = 0; i < limitFor('ai', 'guest'); i++) {
      expect(await checkRateLimit(headers, '/api/extract-freeform', 'guest')).toBe(true);
    }
    expect(await checkRateLimit(headers, '/api/extract-freeform', 'guest')).toBe(false);
    // other groups and callers are unaffected
    expect(await checkRateLimit(headers, '/api/settings', 'guest')).toBe(true);
    expect(await checkRateLimit(headers, '/api/extract-freeform', 'user')).toBe(true);
  });

  it('uses Redis when configured and falls back to memory on Redis errors', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    incr.mockResolvedValueOnce(1).mockResolvedValueOnce(5);
    expect(await consume('r', 4)).toBe(true);
    expect(pexpire).toHaveBeenCalledTimes(1);
    expect(await consume('r', 4)).toBe(false);

    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    incr.mockRejectedValueOnce(new Error('redis down'));
    expect(await consume('r2', 4)).toBe(true);
  });

  it('enforces the demo daily AI budget', async () => {
    process.env.DEMO_DAILY_AI_LIMIT = '2';
    const day = new Date('2026-01-01T10:00:00Z');
    expect(await checkDemoDailyBudget(day)).toBe(true);
    expect(await checkDemoDailyBudget(day)).toBe(true);
    expect(await checkDemoDailyBudget(day)).toBe(false);
    expect(await checkDemoDailyBudget(new Date('2026-01-02T10:00:00Z'))).toBe(true);
    process.env.DEMO_DAILY_AI_LIMIT = '0';
    expect(await checkDemoDailyBudget(day)).toBe(false);
  });
});
