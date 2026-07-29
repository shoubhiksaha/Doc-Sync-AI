import { encrypt, decrypt, getDecryptedCookie } from '../../lib/crypto';
import { NextRequest } from 'next/server';

describe('crypto – encrypt/decrypt', () => {
  test('roundtrip: encrypt then decrypt returns original text', () => {
    const original = 'sk-test-openai-key-1234567890';
    const cipher = encrypt(original);
    expect(cipher).not.toBe(original);
    const result = decrypt(cipher);
    expect(result).toBe(original);
  });

  test('two encryptions of the same text produce different ciphertexts (random IV+salt)', () => {
    const text = 'same-text';
    const a = encrypt(text);
    const b = encrypt(text);
    expect(a).not.toBe(b);
    // but both decrypt correctly
    expect(decrypt(a)).toBe(text);
    expect(decrypt(b)).toBe(text);
  });

  test('decrypt returns null for tampered ciphertext', () => {
    const cipher = encrypt('hello');
    const tampered = cipher.slice(0, -4) + 'XXXX';
    expect(decrypt(tampered)).toBeNull();
  });

  test('decrypt returns null for empty string', () => {
    expect(decrypt('')).toBeNull();
  });

  test('decrypt returns null for random garbage', () => {
    expect(decrypt('not-base64!!!')).toBeNull();
  });

  test('encrypts special characters and unicode correctly', () => {
    const text = 'नमस्ते 🔑 special!"#$%&\'()*+,-./';
    expect(decrypt(encrypt(text))).toBe(text);
  });

  test('encrypts a Notion token correctly', () => {
    const notionToken = 'ntn_aBcDeF1234567890';
    expect(decrypt(encrypt(notionToken))).toBe(notionToken);
  });
});

describe('crypto – getDecryptedCookie', () => {
  function makeRequest(cookies: Record<string, string>): NextRequest {
    const cookieHeader = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    return new NextRequest('http://localhost/api/test', {
      headers: { cookie: cookieHeader },
    });
  }

  test('returns undefined when cookie is absent', () => {
    const req = makeRequest({});
    expect(getDecryptedCookie(req, 'docsync_openai')).toBeUndefined();
  });

  test('returns decrypted value when cookie is present', () => {
    const secretKey = 'ghp_test-github-token';
    const encrypted = encrypt(secretKey);
    const req = makeRequest({ docsync_openai: encrypted });
    expect(getDecryptedCookie(req, 'docsync_openai')).toBe(secretKey);
  });

  test('returns undefined when cookie value is corrupted', () => {
    const req = makeRequest({ docsync_openai: 'corrupted-garbage' });
    expect(getDecryptedCookie(req, 'docsync_openai')).toBeUndefined();
  });

  test('returns correct cookie among multiple cookies', () => {
    const key1 = encrypt('notion-key-abc');
    const key2 = encrypt('openai-key-xyz');
    const req = makeRequest({ docsync_notion: key1, docsync_openai: key2 });
    expect(getDecryptedCookie(req, 'docsync_notion')).toBe('notion-key-abc');
    expect(getDecryptedCookie(req, 'docsync_openai')).toBe('openai-key-xyz');
  });
});
