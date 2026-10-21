/**
 * Sheets module — Google Sheets read/write for synced records.
 *
 * Signed-in users write to their own spreadsheet (OAuth, drive.file scope). Demo users can only
 * write to the configured demo sheet: a spreadsheet ID sent by a demo client is ignored, so the
 * service account can't be pointed at other sheets it has access to.
 */
import { google, type sheets_v4, type drive_v3 } from 'googleapis';
import { env, isModuleEnabled } from '@/core/env';
import { circuitState } from '@/core/isolation';
import { driveQueryLiteral, ensureFolder, getGoogleAuth, hasServiceAccount, serviceAccountAuth } from '@/core/google-auth';
import { buildRow, columnLetter, mergeHeaders, META_COLUMNS, primaryKeyColumn, tabRange, type RowMeta, type SheetField } from './a1';

export { columnLetter, mergeHeaders, sanitizeCell, buildRow, META_COLUMNS, type RowMeta, type SheetField } from './a1';

export interface SheetsCaller {
  accessToken?: string;
  isGuest: boolean;
}

const USER_SPREADSHEET_NAME = 'DocSync AI Data';
const DEMO_SPREADSHEET_NAME = 'DocSync AI Demo Data';
const USER_FOLDER_NAME = 'DocSync AI';

type Apis = { sheets: sheets_v4.Sheets; drive: drive_v3.Drive };

/** Demo callers get the service account; signed-in callers only ever their own OAuth token. */
function apis(caller: SheetsCaller): Apis | null {
  const auth = caller.isGuest ? serviceAccountAuth() : caller.accessToken ? getGoogleAuth(caller.accessToken) : null;
  if (!auth) return null;
  return {
    sheets: google.sheets({ version: 'v4', auth: auth as never }),
    drive: google.drive({ version: 'v3', auth: auth as never }),
  };
}

export function spreadsheetUrl(id: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

export function isDemoSheetConfigured(): boolean {
  return hasServiceAccount() && Boolean(env('GOOGLE_SHEET_ID') || env('GOOGLE_SHARED_FOLDER_ID'));
}

async function findSpreadsheet(drive: drive_v3.Drive, name: string, parentId?: string): Promise<string | null> {
  const q = [
    `name=${driveQueryLiteral(name)}`,
    "mimeType='application/vnd.google-apps.spreadsheet'",
    'trashed=false',
    ...(parentId ? [`${driveQueryLiteral(parentId)} in parents`] : []),
  ].join(' and ');
  const res = await drive.files.list({ q, spaces: 'drive', fields: 'files(id)', pageSize: 1 });
  return res.data.files?.[0]?.id ?? null;
}

async function moveToFolder(drive: drive_v3.Drive, fileId: string, folderName: string): Promise<void> {
  try {
    const folderId = await ensureFolder(drive, folderName);
    const file = await drive.files.get({ fileId, fields: 'parents' });
    await drive.files.update({ fileId, addParents: folderId, removeParents: file.data.parents?.join(',') || '', fields: 'id' });
  } catch (err) {
    console.warn('[sheets] could not move spreadsheet into folder:', err instanceof Error ? err.message : err);
  }
}

/** Demo users: the configured demo sheet only. Users: their sheet, or find/create "DocSync AI Data". */
async function resolveSpreadsheetId(api: Apis, caller: SheetsCaller, clientSpreadsheetId?: string | null, create = true): Promise<string | null> {
  const demoSheet = env('GOOGLE_SHEET_ID');

  if (caller.isGuest) {
    if (demoSheet) return demoSheet;
    const folder = env('GOOGLE_SHARED_FOLDER_ID');
    if (!folder) return null;
    const found = await findSpreadsheet(api.drive, DEMO_SPREADSHEET_NAME, folder);
    if (found || !create) return found;
    const created = await api.drive.files.create({
      requestBody: { name: DEMO_SPREADSHEET_NAME, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [folder] },
      fields: 'id',
    });
    return created.data.id ?? null;
  }

  const clientId = clientSpreadsheetId?.trim();
  if (clientId && clientId !== demoSheet && !clientId.startsWith('demo-sheet-') && /^[A-Za-z0-9_-]{10,}$/.test(clientId)) {
    return clientId;
  }
  const found = await findSpreadsheet(api.drive, USER_SPREADSHEET_NAME);
  if (found || !create) return found;
  const created = await api.sheets.spreadsheets.create({ requestBody: { properties: { title: USER_SPREADSHEET_NAME } }, fields: 'spreadsheetId' });
  const id = created.data.spreadsheetId as string;
  await moveToFolder(api.drive, id, USER_FOLDER_NAME);
  return id;
}

async function readHeaders(api: Apis, spreadsheetId: string, tab: string): Promise<string[] | null> {
  try {
    const res = await api.sheets.spreadsheets.values.get({ spreadsheetId, range: tabRange(tab, '1:1') });
    return (res.data.values?.[0] as string[] | undefined) ?? [];
  } catch (err) {
    if (err instanceof Error && /unable to parse range/i.test(err.message)) return null; // tab missing
    throw err;
  }
}

/** Makes sure `tab` exists; returns its sheetId and current header row. */
async function ensureTab(api: Apis, spreadsheetId: string, tab: string): Promise<{ sheetId: number; headers: string[] }> {
  const meta = await api.sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(sheetId,title)' });
  const existing = meta.data.sheets?.find(s => s.properties?.title === tab);
  if (existing?.properties?.sheetId != null) {
    return { sheetId: existing.properties.sheetId, headers: (await readHeaders(api, spreadsheetId, tab)) ?? [] };
  }
  const res = await api.sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: tab, gridProperties: { frozenRowCount: 1 } } } }] },
  });
  return { sheetId: res.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0, headers: [] };
}

async function writeHeaders(api: Apis, spreadsheetId: string, tab: string, sheetId: number, headers: string[], style: boolean) {
  await api.sheets.spreadsheets.values.update({
    spreadsheetId,
    range: tabRange(tab, 'A1'),
    valueInputOption: 'RAW',
    requestBody: { values: [headers] },
  });
  if (!style) return;
  try {
    await api.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.85, green: 0.92, blue: 0.98 }, horizontalAlignment: 'CENTER' } },
              fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)',
            },
          },
          { autoResizeDimensions: { dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: headers.length } } },
        ],
      },
    });
  } catch (err) {
    console.warn('[sheets] header styling failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

/** 1-based row numbers (excluding the header) whose PK column equals `value`. */
async function matchingRows(api: Apis, spreadsheetId: string, tab: string, columnIndex: number, value: string): Promise<number[]> {
  const letter = columnLetter(columnIndex + 1);
  const res = await api.sheets.spreadsheets.values.get({ spreadsheetId, range: tabRange(tab, `${letter}2:${letter}`) });
  const rows = res.data.values ?? [];
  return rows.flatMap((row, i) => (String(row?.[0] ?? '').trim() === value ? [i + 2] : []));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface CreateSheetInput {
  caller: SheetsCaller;
  tab: string;
  title: string;
  columns: { key: string; label: string }[];
}

export interface SheetRef {
  spreadsheetId: string;
  spreadsheetUrl: string;
  mock?: boolean;
  message: string;
}

export async function createSheet(input: CreateSheetInput): Promise<SheetRef> {
  const headers = [...input.columns.map(c => c.label || c.key), ...META_COLUMNS.map(m => m.label)];

  if (input.caller.isGuest) {
    const api = isDemoSheetConfigured() ? apis(input.caller) : null;
    const spreadsheetId = api ? await resolveSpreadsheetId(api, input.caller) : null;
    if (!api || !spreadsheetId) {
      const demoId = `demo-sheet-${Date.now()}`;
      return { spreadsheetId: demoId, spreadsheetUrl: '', mock: true, message: `Sheet "${input.title}" prepared (Demo Mode — not saved to a real sheet).` };
    }
    const tab = await ensureTab(api, spreadsheetId, input.tab);
    if (tab.headers.every(h => !String(h).trim())) await writeHeaders(api, spreadsheetId, input.tab, tab.sheetId, headers, true);
    return {
      spreadsheetId,
      spreadsheetUrl: spreadsheetUrl(spreadsheetId),
      message: 'Demo mode writes to a shared demo sheet. Sign in with Google to get your own private sheet.',
    };
  }

  const api = apis(input.caller);
  if (!api) throw new Error('Your Google session has expired. Please sign in again.');
  const created = await api.sheets.spreadsheets.create({
    requestBody: {
      properties: { title: input.title },
      sheets: [{ properties: { title: input.tab, gridProperties: { frozenRowCount: 1 } } }],
    },
    fields: 'spreadsheetId,sheets.properties.sheetId',
  });
  const spreadsheetId = created.data.spreadsheetId as string;
  const sheetId = created.data.sheets?.[0]?.properties?.sheetId ?? 0;
  await moveToFolder(api.drive, spreadsheetId, USER_FOLDER_NAME);
  await writeHeaders(api, spreadsheetId, input.tab, sheetId, headers, true);
  return { spreadsheetId, spreadsheetUrl: spreadsheetUrl(spreadsheetId), message: `Sheet "${input.title}" created with ${headers.length} columns.` };
}

export interface DuplicateCheckInput {
  caller: SheetsCaller;
  spreadsheetId?: string | null;
  tab: string;
  fields: SheetField[];
  primaryKey: string;
}

export interface DuplicateReport {
  count: number;
  label: string;
  value: string;
}

/** Read-only check run before anything is written, so a duplicate never leaves half a sync behind. */
export async function findDuplicates(input: DuplicateCheckInput): Promise<DuplicateReport | null> {
  if (input.caller.isGuest && !isDemoSheetConfigured()) return null;
  const api = apis(input.caller);
  if (!api) return null;
  const spreadsheetId = await resolveSpreadsheetId(api, input.caller, input.spreadsheetId, false);
  if (!spreadsheetId) return null;
  const headers = await readHeaders(api, spreadsheetId, input.tab);
  if (!headers?.length) return null;
  const pk = primaryKeyColumn(headers, input.fields, input.primaryKey);
  if (!pk) return null;
  const rows = await matchingRows(api, spreadsheetId, input.tab, pk.index, pk.value);
  return rows.length ? { count: rows.length, label: headers[pk.index] || input.primaryKey, value: pk.value } : null;
}

export interface AppendInput {
  caller: SheetsCaller;
  spreadsheetId?: string | null;
  tab: string;
  fields: SheetField[];
  meta: RowMeta;
  duplicateAction?: 'replace' | 'keep_both' | null;
  primaryKey?: string | null;
}

export interface AppendResult {
  spreadsheetId: string | null;
  spreadsheetUrl?: string;
  mock?: boolean;
  action: 'append' | 'replace' | 'none';
  rows: number;
}

export async function appendRecord(input: AppendInput): Promise<AppendResult> {
  if (input.caller.isGuest && !isDemoSheetConfigured()) {
    return { spreadsheetId: null, mock: true, action: 'none', rows: 0 };
  }
  const api = apis(input.caller);
  if (!api) throw new Error(input.caller.isGuest ? 'The demo service account is not configured.' : 'Your Google session has expired. Please sign in again.');

  const spreadsheetId = await resolveSpreadsheetId(api, input.caller, input.spreadsheetId);
  if (!spreadsheetId) return { spreadsheetId: null, mock: true, action: 'none', rows: 0 };

  const tab = await ensureTab(api, spreadsheetId, input.tab);
  const wasEmpty = tab.headers.every(h => !String(h).trim());
  const { headers, changed } = mergeHeaders(tab.headers, input.fields);
  if (changed) await writeHeaders(api, spreadsheetId, input.tab, tab.sheetId, headers, wasEmpty);

  const row = buildRow(headers, input.fields, input.meta);
  const lastColumn = columnLetter(headers.length);

  if (input.duplicateAction === 'replace' && input.primaryKey && !input.caller.isGuest) {
    const pk = primaryKeyColumn(headers, input.fields, input.primaryKey);
    const rows = pk ? await matchingRows(api, spreadsheetId, input.tab, pk.index, pk.value) : [];
    if (rows.length) {
      await api.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: rows.map(r => ({ range: tabRange(input.tab, `A${r}:${lastColumn}${r}`), values: [row] })),
        },
      });
      return { spreadsheetId, spreadsheetUrl: spreadsheetUrl(spreadsheetId), action: 'replace', rows: rows.length };
    }
  }

  await api.sheets.spreadsheets.values.append({
    spreadsheetId,
    range: tabRange(input.tab, 'A1'),
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
  return { spreadsheetId, spreadsheetUrl: spreadsheetUrl(spreadsheetId), action: 'append', rows: 1 };
}

export function sheetsHealth() {
  return {
    enabled: isModuleEnabled('sheets'),
    configured: true, // signed-in users always have Sheets via OAuth
    demoSheet: isDemoSheetConfigured(),
    circuit: circuitState('sheets'),
  };
}
