import fs from 'fs';
import path from 'path';
import { test, expect, type APIResponse } from '@playwright/test';

// Smoke suite for the quality gate: the built app runs locally with no AI or Google
// credentials, so every module is in mock mode and nothing leaves the runner.

const MODULE_KEYS = ['ai', 'extraction', 'transcription', 'sheets', 'notion', 'media', 'settings', 'demo'];
const SAMPLE_RECEIPT = path.join(__dirname, '..', '..', 'public', 'sample-ngo-receipt.png');

async function expectRedirectToLogin(response: APIResponse) {
  expect([302, 303, 307, 308]).toContain(response.status());
  expect(response.headers()['location'] || '').toContain('/login');
}

test.describe('Smoke (local, mock mode)', () => {
  test('1. Health endpoint is public and reports every module', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control'] || '').toContain('no-store');

    const body = await response.json();
    expect(['ok', 'degraded']).toContain(body.status);
    expect(['production', 'staging', 'development', 'test']).toContain(body.environment);
    expect(typeof body.version).toBe('string');
    expect(Number.isNaN(Date.parse(body.checkedAt))).toBe(false);
    for (const key of MODULE_KEYS) {
      expect(body.modules[key], `modules.${key}`).toBeDefined();
      expect(typeof body.modules[key].enabled).toBe('boolean');
      expect(typeof body.modules[key].configured).toBe('boolean');
      expect(['closed', 'open']).toContain(body.modules[key].circuit);
    }
  });

  test('2. Unauthenticated visitors are sent to login and API calls are rejected', async ({ request }) => {
    await expectRedirectToLogin(await request.get('/', { maxRedirects: 0 }));

    const settings = await request.get('/api/settings', { maxRedirects: 0 });
    expect(settings.status()).toBe(401);
    expect(await settings.json()).toHaveProperty('error');
  });

  test('3. Demo mode login lands on the home page with active profiles', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/login');
    await page.getByRole('button', { name: 'Try Demo Mode (No Login)' }).click();
    await page.waitForURL((url) => url.pathname === '/', { timeout: 15000 });

    const ngo = page.locator('a[href="/scan/ngo-receipt"]');
    await expect(ngo).toBeVisible();
    await expect(ngo).toContainText('NGO Donation Receipts');

    const factory = page.locator('a[href="/scan/factory-weight-slip"]');
    await expect(factory).toBeVisible();
    await expect(factory).toContainText('Factory Scrap Weight-Slips');

    expect(errors).toHaveLength(0);
  });

  test('4. Guest extraction returns mock fields when no AI key is configured', async ({ page }) => {
    const guest = await page.request.post('/api/auth/guest');
    expect(guest.ok()).toBe(true);

    const response = await page.request.post('/api/extract-freeform', {
      multipart: {
        document: {
          name: 'sample-ngo-receipt.png',
          mimeType: 'image/png',
          buffer: fs.readFileSync(SAMPLE_RECEIPT),
        },
        profileId: 'ngo-receipt',
      },
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.isMock).toBe(true);
    expect(Array.isArray(body.fields)).toBe(true);
    expect(body.fields.length).toBeGreaterThan(0);
  });
});
