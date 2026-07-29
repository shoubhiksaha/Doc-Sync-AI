import { NgoReceiptSchema, FactoryWeightSlipSchema } from '../../lib/schemas';

// ─── NGO Receipt Schema ────────────────────────────────────────────────────────

describe('NgoReceiptSchema', () => {
  describe('valid inputs', () => {
    test('parses a complete valid receipt', () => {
      const result = NgoReceiptSchema.parse({
        date: '24-Oct-2023',
        donorName: 'Rahul Sharma',
        amount: 5000,
        panNumber: 'ABCDE1234F',
      });
      expect(result.donorName).toBe('Rahul Sharma');
      expect(result.amount).toBe(5000);
      expect(result.panNumber).toBe('ABCDE1234F');
    });

    test('amount coerces string numbers to number', () => {
      const result = NgoReceiptSchema.parse({
        date: '2023-01-01',
        donorName: 'Test User',
        amount: '2500', // string
        panNumber: 'ABCDE1234F',
      });
      expect(result.amount).toBe(2500);
    });

    test('panNumber is nullable – can be explicitly null', () => {
      const result = NgoReceiptSchema.parse({
        date: '2023-01-01',
        donorName: 'Anonymous Donor',
        amount: 100,
        panNumber: null,
      });
      expect(result.panNumber).toBeNull();
    });

    test('PAN normalises lowercase and trims whitespace', () => {
      const result = NgoReceiptSchema.parse({
        date: '2023-01-01',
        donorName: 'Test',
        amount: 500,
        panNumber: ' abcde1234f ',
      });
      expect(result.panNumber).toBe('ABCDE1234F');
    });
  });

  describe('invalid inputs', () => {
    test('rejects missing date', () => {
      expect(() =>
        NgoReceiptSchema.parse({ donorName: 'Test', amount: 100 })
      ).toThrow();
    });

    test('rejects missing donorName', () => {
      expect(() =>
        NgoReceiptSchema.parse({ date: '2023-01-01', amount: 100 })
      ).toThrow();
    });

    test('rejects amount of zero', () => {
      expect(() =>
        NgoReceiptSchema.parse({ date: '2023-01-01', donorName: 'Test', amount: 0 })
      ).toThrow();
    });

    test('rejects amount less than zero', () => {
      expect(() =>
        NgoReceiptSchema.parse({ date: '2023-01-01', donorName: 'Test', amount: -100 })
      ).toThrow();
    });

    test('rejects malformed PAN format', () => {
      expect(() =>
        NgoReceiptSchema.parse({
          date: '2023-01-01',
          donorName: 'Test',
          amount: 500,
          panNumber: 'INVALID-PAN',
        })
      ).toThrow();
    });

    test('rejects PAN with wrong length', () => {
      expect(() =>
        NgoReceiptSchema.parse({
          date: '2023-01-01',
          donorName: 'Test',
          amount: 500,
          panNumber: 'ABCDE123', // too short
        })
      ).toThrow();
    });

    test('rejects empty donorName string', () => {
      expect(() =>
        NgoReceiptSchema.parse({ date: '2023-01-01', donorName: '', amount: 100 })
      ).toThrow();
    });

    test('rejects empty date string', () => {
      expect(() =>
        NgoReceiptSchema.parse({ date: '', donorName: 'Test', amount: 100 })
      ).toThrow();
    });
  });
});

// ─── Factory Weight Slip Schema ────────────────────────────────────────────────

describe('FactoryWeightSlipSchema', () => {
  describe('valid inputs', () => {
    test('parses a valid weight slip', () => {
      const result = FactoryWeightSlipSchema.parse({
        date: '24-Oct-2023',
        vehicleNumber: 'MH-12-AB-1234',
        grossWeight: 15000,
        tareWeight: 5000,
      });
      expect(result.grossWeight).toBe(15000);
      expect(result.tareWeight).toBe(5000);
    });

    test('coerces string weights to numbers', () => {
      const result = FactoryWeightSlipSchema.parse({
        date: '2023-01-01',
        vehicleNumber: 'KA-01-ZZ-9999',
        grossWeight: '12000',
        tareWeight: '4000',
      });
      expect(typeof result.grossWeight).toBe('number');
      expect(typeof result.tareWeight).toBe('number');
    });
  });

  describe('invalid inputs', () => {
    test('rejects zero grossWeight', () => {
      expect(() =>
        FactoryWeightSlipSchema.parse({
          date: '2023-01-01',
          vehicleNumber: 'MH-12-AB-1234',
          grossWeight: 0,
          tareWeight: 5000,
        })
      ).toThrow();
    });

    test('rejects zero tareWeight', () => {
      expect(() =>
        FactoryWeightSlipSchema.parse({
          date: '2023-01-01',
          vehicleNumber: 'MH-12-AB-1234',
          grossWeight: 10000,
          tareWeight: 0,
        })
      ).toThrow();
    });

    test('rejects missing vehicleNumber', () => {
      expect(() =>
        FactoryWeightSlipSchema.parse({
          date: '2023-01-01',
          grossWeight: 10000,
          tareWeight: 5000,
        })
      ).toThrow();
    });

    test('rejects empty vehicleNumber', () => {
      expect(() =>
        FactoryWeightSlipSchema.parse({
          date: '2023-01-01',
          vehicleNumber: '',
          grossWeight: 10000,
          tareWeight: 5000,
        })
      ).toThrow();
    });
  });
});
