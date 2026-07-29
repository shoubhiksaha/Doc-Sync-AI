// We must isolate this test since firebase-admin is a singleton
const mockApps: any[] = [];
const mockInitializeApp = jest.fn(() => {
  mockApps.push('app');
});

jest.mock('firebase-admin/app', () => {
  return {
    getApps: jest.fn(() => mockApps),
    initializeApp: mockInitializeApp,
    cert: jest.fn(),
  };
});

jest.mock('firebase-admin/firestore', () => {
  return {
    getFirestore: jest.fn(() => 'mock-firestore'),
  };
});

jest.mock('firebase-admin/auth', () => {
  return {
    getAuth: jest.fn(() => 'mock-auth'),
  };
});

describe('firebase-admin', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules(); // clears the cache
    process.env = { ...originalEnv };
    mockApps.length = 0;
    mockInitializeApp.mockClear();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should initialize admin app if environment variables are present', () => {
    process.env.FIREBASE_PROJECT_ID = 'test-project';
    process.env.FIREBASE_CLIENT_EMAIL = 'test@example.com';
    process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMockKey\n-----END PRIVATE KEY-----';

    // Simulate initializeApp adding to apps array
    mockInitializeApp.mockImplementation(() => { mockApps.push('app'); });

    const { db, auth } = require('../../lib/firebase-admin');
    
    expect(mockInitializeApp).toHaveBeenCalled();
    expect(db).toBe('mock-firestore');
    expect(auth).toBe('mock-auth');
  });

  it('should not throw and should handle initialization errors gracefully', () => {
    process.env.FIREBASE_PROJECT_ID = 'test-project';
    process.env.FIREBASE_CLIENT_EMAIL = 'test@example.com';
    process.env.FIREBASE_PRIVATE_KEY = 'mock';

    mockInitializeApp.mockImplementation(() => { throw new Error('Init Failed'); });

    const { db } = require('../../lib/firebase-admin');
    
    expect(mockInitializeApp).toHaveBeenCalled();
    expect(db).toBeNull();
  });
});
