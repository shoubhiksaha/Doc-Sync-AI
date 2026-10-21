import {
  activeProfiles,
  comingSoonProfiles,
  deriveFields,
  findField,
  getProfile,
  notionPropertyUnion,
  validateFields,
  type DocumentProfile,
  type RecordField,
} from '@/modules/profiles';

const f = (key: string, value: string, label = key): RecordField => ({ key, label, value });

describe('modules/profiles', () => {
  it('registers the active profiles and keeps them out of coming-soon', () => {
    const ids = activeProfiles().map(p => p.id);
    expect(ids).toEqual(['ngo-receipt', 'factory-weight-slip']);
    expect(comingSoonProfiles.some(p => p.title === 'Factory Scrap Weight-Slips')).toBe(false);
    expect(getProfile('nope')).toBeUndefined();
    expect(getProfile(null)).toBeUndefined();
  });

  it('every active profile is complete', () => {
    for (const p of activeProfiles()) {
      expect(p.sheetTab).toMatch(/^\w+$/);
      expect(p.mockFields.length).toBeGreaterThan(0);
      expect(p.extraction.priorityFields.length).toBeGreaterThan(0);
    }
  });

  it('findField matches by key or label, ignoring case and punctuation', () => {
    const fields = [f('donor_name', 'Asha', 'Donor Name')];
    expect(findField(fields, ['donorName'])?.value).toBe('Asha');
    expect(findField(fields, ['DONOR NAME'])?.value).toBe('Asha');
    expect(findField(fields, ['pan'])).toBeUndefined();
  });

  describe('ngo-receipt', () => {
    const ngo = getProfile('ngo-receipt')!;
    it('warns when a large donation has no PAN', () => {
      expect(validateFields(ngo, [f('amount', '₹5,000')])[0]).toMatch(/PAN/);
    });
    it('warns on a malformed PAN', () => {
      expect(validateFields(ngo, [f('amount', '500'), f('panNumber', 'ABC123')])[0]).toMatch(/doesn't match/);
    });
    it('passes a valid receipt', () => {
      expect(validateFields(ngo, [f('amount', '₹5,000'), f('panNumber', 'abcde 1234f')])).toEqual([]);
    });
  });

  describe('factory-weight-slip', () => {
    const slip = getProfile('factory-weight-slip')!;
    it('derives net weight', () => {
      const out = deriveFields(slip, [f('grossWeight', '15,000 kg'), f('tareWeight', '5000')]);
      expect(findField(out, ['netWeight'])?.value).toBe('10000');
    });
    it('keeps a printed net weight', () => {
      const fields = [f('grossWeight', '15000'), f('tareWeight', '5000'), f('netWeight', '9999')];
      expect(deriveFields(slip, fields)).toBe(fields);
      expect(validateFields(slip, fields)[0]).toMatch(/doesn't equal/);
    });
    it('flags tare >= gross', () => {
      expect(validateFields(slip, [f('grossWeight', '100'), f('tareWeight', '200')])[0]).toMatch(/not less than/);
    });
    it('does nothing without numbers', () => {
      const fields = [f('grossWeight', 'n/a')];
      expect(deriveFields(slip, fields)).toBe(fields);
      expect(validateFields(slip, fields)).toEqual([]);
    });
  });

  it('a crashing validator or derive() is contained', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = {
      ...getProfile('ngo-receipt')!,
      validate: () => { throw new Error('bug'); },
      derive: () => { throw new Error('bug'); },
    } as DocumentProfile;
    const fields = [f('a', '1')];
    expect(validateFields(broken, fields)[0]).toMatch(/unavailable/);
    expect(deriveFields(broken, fields)).toBe(fields);
  });

  it('collects every Notion property used by any profile', () => {
    const names = notionPropertyUnion().map(p => p.name);
    expect(names).toEqual(expect.arrayContaining(['Amount', 'PAN', 'Gross Weight', 'Tare Weight', 'Net Weight']));
  });
});
