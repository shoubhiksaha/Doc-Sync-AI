// ─── Mock @notionhq/client before imports ─────────────────────────────────────
const mockPagesCreate = jest.fn();
jest.mock('@notionhq/client', () => ({
  Client: jest.fn().mockImplementation(() => ({
    pages: { create: mockPagesCreate },
  })),
}));

import { syncToNotion } from '../../lib/notion';

const NGO_DATA = {
  date: '2023-10-01',
  donorName: 'Rahul Sharma',
  amount: 5000,
  panNumber: 'ABCDE1234F',
};

const FACTORY_DATA = {
  date: '2023-10-01',
  vehicleNumber: 'MH-12-AB-1234',
  grossWeight: 15000,
  tareWeight: 5000,
};

const MOCK_PAGE_RESPONSE = {
  id: 'page-uuid-1234',
  url: 'https://www.notion.so/Test-Page-page-uuid-1234',
};

describe('syncToNotion – no credentials', () => {
  beforeEach(() => mockPagesCreate.mockReset());

  test('skips sync and returns dummy:true when no API key', async () => {
    const result = await syncToNotion(NGO_DATA, 'ngo-receipt', null, null);
    expect(result).toEqual({ success: true, dummy: true });
    expect(mockPagesCreate).not.toHaveBeenCalled();
  });

  test('skips sync and returns dummy:true when no DB ID', async () => {
    const result = await syncToNotion(NGO_DATA, 'ngo-receipt', 'ntn_secret', null);
    expect(result).toEqual({ success: true, dummy: true });
    expect(mockPagesCreate).not.toHaveBeenCalled();
  });
});

describe('syncToNotion – NGO receipt', () => {
  beforeEach(() => {
    mockPagesCreate.mockReset();
    mockPagesCreate.mockResolvedValue(MOCK_PAGE_RESPONSE);
  });

  test('creates a Notion page and returns success + url', async () => {
    const result = await syncToNotion(NGO_DATA, 'ngo-receipt', 'ntn_key', 'db-id-123');

    expect(result.success).toBe(true);
    expect(result.id).toBe('page-uuid-1234');
    expect(result.url).toBe(MOCK_PAGE_RESPONSE.url);
    expect(mockPagesCreate).toHaveBeenCalledTimes(1);
  });

  test('page properties include Name, Amount, PAN, Date, Profile', async () => {
    await syncToNotion(NGO_DATA, 'ngo-receipt', 'ntn_key', 'db-id-123');
    const call = mockPagesCreate.mock.calls[0][0];
    const props = call.properties;

    expect(props['Name'].title[0].text.content).toBe('Rahul Sharma');
    expect(props['Amount'].number).toBe(5000);
    expect(props['PAN'].rich_text[0].text.content).toBe('ABCDE1234F');
    expect(props['Profile'].select.name).toBe('NGO Receipt');
  });

  test('appends image block when notionFileId is provided', async () => {
    await syncToNotion(NGO_DATA, 'ngo-receipt', 'ntn_key', 'db-id-123', 'file-upload-xyz');
    const call = mockPagesCreate.mock.calls[0][0];
    const imageBlock = call.children?.find((b: Record<string, unknown>) => b.type === 'image');

    expect(imageBlock).toBeDefined();
    expect((imageBlock.image as Record<string, unknown>).type).toBe('file_upload');
  });

  test('always appends a JSON code block with the data', async () => {
    await syncToNotion(NGO_DATA, 'ngo-receipt', 'ntn_key', 'db-id-123');
    const call = mockPagesCreate.mock.calls[0][0];
    const codeBlock = call.children?.find((b: Record<string, unknown>) => b.type === 'code');

    expect(codeBlock).toBeDefined();
    const content = (codeBlock.code as Record<string, unknown[]>).rich_text[0];
    expect(JSON.parse((content as Record<string, Record<string, string>>).text.content)).toEqual(NGO_DATA);
  });

  test('does NOT append image block when notionFileId is absent', async () => {
    await syncToNotion(NGO_DATA, 'ngo-receipt', 'ntn_key', 'db-id-123');
    const call = mockPagesCreate.mock.calls[0][0];
    const imageBlock = call.children?.find((b: Record<string, unknown>) => b.type === 'image');
    expect(imageBlock).toBeUndefined();
  });
});

describe('syncToNotion – Factory weight slip', () => {
  beforeEach(() => {
    mockPagesCreate.mockReset();
    mockPagesCreate.mockResolvedValue(MOCK_PAGE_RESPONSE);
  });

  test('creates page with correct factory properties', async () => {
    await syncToNotion(FACTORY_DATA, 'factory-weight-slip', 'ntn_key', 'db-id-456');
    const call = mockPagesCreate.mock.calls[0][0];
    const props = call.properties;

    expect(props['Name'].title[0].text.content).toBe('MH-12-AB-1234');
    expect(props['Gross Weight'].number).toBe(15000);
    expect(props['Tare Weight'].number).toBe(5000);
    expect(props['Net Weight'].number).toBe(10000); // 15000 - 5000
    expect(props['Profile'].select.name).toBe('Factory Weight Slip');
  });
});

describe('syncToNotion – Error handling', () => {
  beforeEach(() => mockPagesCreate.mockReset());

  test('throws when API call fails', async () => {
    mockPagesCreate.mockRejectedValue(new Error('Notion API 401'));
    await expect(
      syncToNotion(NGO_DATA, 'ngo-receipt', 'ntn_bad_key', 'db-id-123')
    ).rejects.toThrow('Failed to sync to Notion');
  });

  test('throws for unsupported profileId', async () => {
    await expect(
      syncToNotion(NGO_DATA, 'unsupported-profile', 'ntn_key', 'db-id-123')
    ).rejects.toThrow('Failed to sync to Notion');
  });
});
