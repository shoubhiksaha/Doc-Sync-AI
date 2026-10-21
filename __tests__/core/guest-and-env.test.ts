import { appEnvironment, appVersion, env, isDemoEnabled, isModuleEnabled } from '@/core/env';
import { createGuestToken, GUEST_TTL_SECONDS, verifyGuestToken } from '@/core/guest';
import { normalizeKey, parseNumber } from '@/core/text';

describe('core/guest', () => {
  const secret = 'test-secret';

  it('verifies a token it issued', async () => {
    const token = await createGuestToken(secret);
    await expect(verifyGuestToken(token, secret)).resolves.toBe(true);
  });

  it('rejects the old unsigned cookie value', async () => {
    await expect(verifyGuestToken('true', secret)).resolves.toBe(false);
  });

  it('rejects a token signed with another secret', async () => {
    const token = await createGuestToken('other');
    await expect(verifyGuestToken(token, secret)).resolves.toBe(false);
  });

  it('rejects a tampered expiry', async () => {
    const token = await createGuestToken(secret);
    const parts = token.split('.');
    parts[1] = String(Number(parts[1]) + 999999);
    await expect(verifyGuestToken(parts.join('.'), secret)).resolves.toBe(false);
  });

  it('rejects an expired token', async () => {
    const now = Date.now();
    const token = await createGuestToken(secret, now);
    await expect(verifyGuestToken(token, secret, now + (GUEST_TTL_SECONDS + 1) * 1000)).resolves.toBe(false);
  });

  it('rejects missing token or secret', async () => {
    await expect(verifyGuestToken(undefined, secret)).resolves.toBe(false);
    await expect(verifyGuestToken(await createGuestToken(secret), undefined)).resolves.toBe(false);
  });
});

describe('core/env', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('derives the environment from APP_ENV, then VERCEL_ENV', () => {
    process.env.APP_ENV = 'staging';
    expect(appEnvironment()).toBe('staging');
    delete process.env.APP_ENV;
    process.env.VERCEL_ENV = 'production';
    expect(appEnvironment()).toBe('production');
    process.env.VERCEL_ENV = 'preview';
    expect(appEnvironment()).toBe('staging');
    delete process.env.VERCEL_ENV;
    expect(appEnvironment()).toBe('test');
  });

  it('reports the build version', () => {
    process.env.APP_BUILD_SHA = 'abc123';
    expect(appVersion()).toBe('abc123');
    delete process.env.APP_BUILD_SHA;
    expect(appVersion()).toBe('dev');
  });

  it('module kill switches', () => {
    expect(isModuleEnabled('notion')).toBe(true);
    for (const v of ['off', 'false', '0', 'disabled', ' OFF ']) {
      process.env.MODULE_NOTION = v;
      expect(isModuleEnabled('notion')).toBe(false);
    }
    process.env.MODULE_NOTION = 'on';
    expect(isModuleEnabled('notion')).toBe(true);
    process.env.MODULE_DEMO = 'off';
    expect(isDemoEnabled()).toBe(false);
  });

  it('env() trims and treats blanks as unset', () => {
    process.env.X_TEST = '  value ';
    expect(env('X_TEST')).toBe('value');
    process.env.X_TEST = '   ';
    expect(env('X_TEST')).toBeUndefined();
  });
});

describe('core/text', () => {
  it('normalizeKey', () => {
    expect(normalizeKey('Donor Name')).toBe('donorname');
    expect(normalizeKey('donor_name')).toBe('donorname');
    expect(normalizeKey(undefined)).toBe('');
  });

  it('parseNumber', () => {
    expect(parseNumber('₹5,000.50')).toBe(5000.5);
    expect(parseNumber('15,000 kg')).toBe(15000);
    expect(parseNumber(12)).toBe(12);
    expect(parseNumber('n/a')).toBeNull();
    expect(parseNumber(Number.NaN)).toBeNull();
  });
});
