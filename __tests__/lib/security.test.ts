import { generateAndWrapDEK, unwrapAndDecryptDEK, generateTrialHash, KmsPayload } from '../../lib/security';

describe('security', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 64 char hex string
    process.env.NOTION_ENCRYPTION_KEY_V2 = 'test-pepper';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('generateAndWrapDEK & unwrapAndDecryptDEK', () => {
    it('should securely encrypt and decrypt a plaintext string', () => {
      const plaintext = 'sk-my-super-secret-key-123';
      const payload = generateAndWrapDEK(plaintext);
      
      expect(payload).toHaveProperty('encryptedKey');
      expect(payload).toHaveProperty('iv');
      expect(payload).toHaveProperty('authTag');
      expect(payload).toHaveProperty('encryptedDek');
      expect(payload).toHaveProperty('dekIv');
      expect(payload).toHaveProperty('dekAuthTag');
      
      const decrypted = unwrapAndDecryptDEK(payload);
      expect(decrypted).toBe(plaintext);
    });

    it('should throw an error when unwrapping tampered data', () => {
      const plaintext = 'sk-my-super-secret-key-123';
      const payload = generateAndWrapDEK(plaintext);
      
      // Tamper with ciphertext in a guaranteed way
      const firstChar = payload.encryptedKey.charAt(0);
      const newFirstChar = firstChar === 'a' ? 'b' : 'a';
      const tamperedPayload = { ...payload, encryptedKey: newFirstChar + payload.encryptedKey.substring(1) };
      
      expect(() => {
        unwrapAndDecryptDEK(tamperedPayload);
      }).toThrow();
    });

    it('should throw if ENCRYPTION_KEY is missing', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(() => generateAndWrapDEK('test')).toThrow('ENCRYPTION_KEY must be a 64-character hex string');
      expect(() => unwrapAndDecryptDEK({} as any)).toThrow('ENCRYPTION_KEY must be a 64-character hex string');
    });

    it('should throw if ENCRYPTION_KEY is not 64 chars', () => {
      process.env.ENCRYPTION_KEY = 'short';
      expect(() => generateAndWrapDEK('test')).toThrow('ENCRYPTION_KEY must be a 64-character hex string');
      expect(() => unwrapAndDecryptDEK({} as any)).toThrow('ENCRYPTION_KEY must be a 64-character hex string');
    });
  });

  describe('generateTrialHash', () => {
    it('should generate a consistent hash for the same email', () => {
      const email = 'user@example.com';
      const hash1 = generateTrialHash(email);
      const hash2 = generateTrialHash(email);
      
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(email);
    });

    it('should generate different hashes for different emails', () => {
      const email1 = 'user1@example.com';
      const email2 = 'user2@example.com';
      const hash1 = generateTrialHash(email1);
      const hash2 = generateTrialHash(email2);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should throw error if pepper key is missing', () => {
      delete process.env.NOTION_ENCRYPTION_KEY_V2;
      delete process.env.ENCRYPTION_KEY;
      expect(() => generateTrialHash('user@example.com')).toThrow('Missing pepper key for HMAC hashing');
    });
  });
});
