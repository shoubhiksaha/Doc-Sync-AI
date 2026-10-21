import { NextRequest, NextResponse } from 'next/server';
import { errorText, parseJson, resolveCaller, unauthorized } from '@/core/http';
import { MAX_AUDIO_BYTES } from '@/modules/transcription';
import { MAX_DOCUMENT_BYTES } from '@/modules/extraction';
import { getProfile, type RecordField } from '@/modules/profiles';
import { loadSettings, parseUploadDest } from '@/modules/settings';
import { failedDestinations, syncDocument, type DestinationName, type SyncReport } from '@/modules/sync';

export const maxDuration = 60;

const LABELS: Record<DestinationName, string> = { sheets: 'Google Sheets', notion: 'Notion', media: 'Media upload' };

/** Accepts the new `fields` payload ([{key,label,value}]) or the legacy `data` map ({key: value}). */
function readFields(formData: FormData): RecordField[] {
  const fields = parseJson<unknown>(formData.get('fields'), null);
  if (Array.isArray(fields)) {
    return fields
      .filter((f): f is RecordField => Boolean(f) && typeof (f as RecordField).key === 'string')
      .slice(0, 100)
      .map(f => ({ key: f.key, label: String(f.label || f.key), value: String(f.value ?? '') }));
  }
  const data = parseJson<Record<string, unknown> | null>(formData.get('data'), null);
  return data && typeof data === 'object'
    ? Object.entries(data).slice(0, 100).map(([key, value]) => ({ key, label: key, value: String(value ?? '') }))
    : [];
}

function primaryKeyFromCookie(req: NextRequest, profileId: string): string | null {
  const raw = req.cookies.get(`docsync_pk_${profileId.replace(/-/g, '_')}`)?.value;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function describe(report: SyncReport) {
  return Object.fromEntries(
    (Object.keys(report.destinations) as DestinationName[]).map(name => {
      const outcome = report.destinations[name];
      return [name, outcome.status === 'failed' ? { status: 'failed', detail: outcome.error } : outcome.status === 'skipped' ? { status: 'skipped', detail: outcome.reason } : { status: 'success' }];
    }),
  );
}

export async function POST(req: NextRequest) {
  const caller = await resolveCaller(req);
  if (!caller) return unauthorized();

  try {
    const formData = await req.formData();
    const profile = getProfile(formData.get('profileId') as string | null);
    const fields = readFields(formData);
    if (!profile || fields.length === 0) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

    const documentFile = formData.get('document');
    const audioFile = formData.get('audioFile');
    const document = documentFile instanceof File ? documentFile : null;
    const audio = audioFile instanceof File ? audioFile : null;
    if (document && document.size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: 'Document file size exceeds the 20MB limit.' }, { status: 413 });
    if (audio && audio.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'Audio file size exceeds the 10MB limit.' }, { status: 413 });

    const rawAction = formData.get('duplicateAction');
    const duplicateAction = rawAction === 'replace' || rawAction === 'keep_both' ? rawAction : null;
    if (duplicateAction === 'replace' && caller.isGuest) {
      return NextResponse.json({ error: 'Replacing rows is not available in demo mode. Choose "Keep Both" or sign in.' }, { status: 403 });
    }

    const settings = await loadSettings(req);
    const report = await syncDocument({
      profile,
      fields,
      note: (formData.get('noteText') as string | null)?.slice(0, 10_000) || '',
      document: document ? Buffer.from(await document.arrayBuffer()) : null,
      audio: audio ? Buffer.from(await audio.arrayBuffer()) : null,
      audioMimeType: audio?.type || undefined,
      caller,
      notion: {
        apiKey: req.headers.get('x-notion-key') || settings.notionKey,
        databaseId: req.headers.get('x-notion-db-id') || settings.notionDbId,
      },
      uploadDest: parseUploadDest(formData.get('uploadDest') ?? settings.uploadDest),
      spreadsheetId: caller.isGuest ? null : (formData.get('spreadsheetId') as string | null),
      duplicateAction,
      primaryKey: primaryKeyFromCookie(req, profile.id),
    });

    if (report.duplicate) {
      return NextResponse.json({
        isDuplicateConflict: true,
        duplicateCount: report.duplicate.count,
        primaryKeyLabel: report.duplicate.label,
        primaryKeyValue: report.duplicate.value,
      }, { status: 409 });
    }

    const failed = failedDestinations(report);
    const succeeded = (Object.keys(report.destinations) as DestinationName[]).filter(d => report.destinations[d].status === 'ok');
    const sheets = report.destinations.sheets.status === 'ok' ? report.destinations.sheets.value : null;
    const errors = failed.map(d => {
      const outcome = report.destinations[d];
      return `${LABELS[d]} sync failed${outcome.status === 'failed' ? `: ${outcome.error}` : ''}`;
    });

    let message = failed.length === 0 ? 'Successfully synced to all destinations' : `Synced to ${succeeded.map(d => LABELS[d]).join(', ') || 'no destination'}; ${failed.map(d => LABELS[d]).join(', ')} failed.`;
    if (caller.isGuest && sheets?.spreadsheetId) message += ' Demo mode writes to a shared demo sheet — sign in to use your own private sheet.';
    if (sheets?.mock) message += ' (Demo mode — not saved to a real sheet.)';

    return NextResponse.json({
      success: failed.length === 0,
      partial: failed.length > 0 && succeeded.length > 0,
      message,
      errors,
      warnings: report.warnings,
      destinations: describe(report),
      imageUrl: report.imageLink,
      spreadsheetUrl: sheets?.spreadsheetUrl,
    }, { status: failed.length > 0 && succeeded.length === 0 ? 502 : 200 });
  } catch (error) {
    console.error('[sync] unexpected error:', errorText(error));
    return NextResponse.json({ error: `An internal error occurred during data sync: ${errorText(error)}` }, { status: 500 });
  }
}
