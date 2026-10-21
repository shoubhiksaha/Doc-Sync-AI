/**
 * Sync orchestrator — sends one reviewed document to every destination.
 *
 * Each destination (Notion, media storage, Google Sheets) runs through runIsolated(): it has its
 * own timeout, kill switch and circuit breaker, and its failure is reported, not thrown. A Notion
 * outage therefore can't stop the row reaching Google Sheets, and vice versa.
 *
 * Order: 1) read-only duplicate check (before any side effect), 2) Notion + media in parallel,
 * 3) Sheets, with whatever links steps 2 produced.
 */
import { runIsolated, type Outcome } from '@/core/isolation';
import * as mediaModule from '@/modules/media';
import * as notionModule from '@/modules/notion';
import * as sheetsModule from '@/modules/sheets';
import { deriveFields, type DocumentProfile, type RecordField } from '@/modules/profiles';
import type { UploadDest } from '@/modules/settings';

export interface SyncDeps {
  sheets: Pick<typeof sheetsModule, 'findDuplicates' | 'appendRecord'>;
  notion: Pick<typeof notionModule, 'syncRecord' | 'resolveNotionTarget'>;
  media: Pick<typeof mediaModule, 'storeMedia' | 'prepareArchiveImage'>;
}

const defaultDeps: SyncDeps = { sheets: sheetsModule, notion: notionModule, media: mediaModule };

export const DESTINATION_TIMEOUT_MS = 25_000;

export interface SyncInput {
  profile: DocumentProfile;
  fields: RecordField[];
  note?: string;
  document?: Buffer | null;
  audio?: Buffer | null;
  audioMimeType?: string;
  caller: { accessToken?: string; isGuest: boolean };
  notion: { apiKey?: string | null; databaseId?: string | null };
  uploadDest: UploadDest;
  spreadsheetId?: string | null;
  duplicateAction?: 'replace' | 'keep_both' | null;
  primaryKey?: string | null;
}

export type DestinationName = 'sheets' | 'notion' | 'media';

export interface SyncReport {
  duplicate?: sheetsModule.DuplicateReport;
  destinations: {
    sheets: Outcome<sheetsModule.AppendResult>;
    notion: Outcome<notionModule.NotionSyncResult>;
    media: Outcome<mediaModule.MediaResult>;
  };
  imageLink: string | null;
  warnings: string[];
}

const skipped = (reason: string) => ({ status: 'skipped' as const, reason });

export function failedDestinations(report: SyncReport): DestinationName[] {
  return (Object.keys(report.destinations) as DestinationName[]).filter(d => report.destinations[d].status === 'failed');
}

export async function syncDocument(input: SyncInput, deps: SyncDeps = defaultDeps): Promise<SyncReport> {
  const fields = deriveFields(input.profile, input.fields);
  const sheetFields = fields.map(f => ({ key: f.key, label: f.label, value: f.value }));
  const warnings: string[] = [];

  // 1) Duplicate check — read-only, before anything is written anywhere.
  if (input.primaryKey && !input.duplicateAction) {
    const check = await runIsolated(
      () => deps.sheets.findDuplicates({
        caller: input.caller,
        spreadsheetId: input.spreadsheetId,
        tab: input.profile.sheetTab,
        fields: sheetFields,
        primaryKey: input.primaryKey!,
      }),
      { module: 'sheets', breakerKey: 'sheets:duplicates', timeoutMs: 8_000 },
    );
    if (check.status === 'ok' && check.value) {
      return {
        duplicate: check.value,
        destinations: { sheets: skipped('duplicate found'), notion: skipped('duplicate found'), media: skipped('duplicate found') },
        imageLink: null,
        warnings,
      };
    }
    if (check.status === 'failed') warnings.push('Duplicate check was unavailable, so this record was not checked for duplicates.');
  }

  // 2) Notion + media in parallel.
  let archive: Buffer | null = null;
  if (input.document) {
    try {
      archive = await deps.media.prepareArchiveImage(input.document);
    } catch (err) {
      warnings.push('The image could not be processed for archiving; the data will still be synced.');
      console.error('[sync] archive image failed:', err instanceof Error ? err.message : err);
    }
  }

  const notionTarget = deps.notion.resolveNotionTarget(input.notion);
  const notionWanted = input.uploadDest !== 'gdrive' && Boolean(notionTarget);
  const imageForMedia = archive && (input.uploadDest !== 'notion' || !notionWanted) ? archive : null;
  const audioForMedia = input.audio && (input.uploadDest !== 'notion' || !notionWanted) ? input.audio : null;

  const [notion, media] = await Promise.all([
    notionWanted
      ? runIsolated(
          () => deps.notion.syncRecord({
            ...input.notion,
            profile: input.profile,
            fields,
            note: input.note,
            image: archive,
            audio: input.audio,
            audioMimeType: input.audioMimeType,
          }),
          { module: 'notion', timeoutMs: DESTINATION_TIMEOUT_MS },
        )
      : Promise.resolve(skipped(input.uploadDest === 'gdrive' ? 'Notion not selected as a destination' : 'Notion not connected')),
    imageForMedia || audioForMedia
      ? runIsolated(
          () => deps.media.storeMedia({
            accessToken: input.caller.accessToken,
            isGuest: input.caller.isGuest,
            profileId: input.profile.id,
            image: imageForMedia,
            audio: audioForMedia,
            audioMimeType: input.audioMimeType,
          }),
          { module: 'media', timeoutMs: DESTINATION_TIMEOUT_MS },
        )
      : Promise.resolve(skipped('nothing to store')),
  ]);

  if (notion.status === 'ok') warnings.push(...notion.value.attachmentNotes);
  if (media.status === 'ok') warnings.push(...media.value.notes);

  const imageLink = (notion.status === 'ok' ? notion.value.url : null)
    ?? (media.status === 'ok' ? media.value.imageUrl : null);
  const audioLink = media.status === 'ok' ? media.value.audioUrl : null;
  const otherFailures = [notion.status === 'failed' ? 'Notion' : null, media.status === 'failed' ? 'media upload' : null].filter(Boolean);

  // 3) Sheets.
  const sheets = await runIsolated(
    () => deps.sheets.appendRecord({
      caller: input.caller,
      spreadsheetId: input.spreadsheetId,
      tab: input.profile.sheetTab,
      fields: sheetFields,
      meta: {
        notes: input.note ?? '',
        voiceNoteLink: audioLink ?? '',
        imageLink: imageLink ?? '—',
        syncedAt: new Date().toISOString(),
        syncStatus: otherFailures.length ? `Partial (${otherFailures.join(', ')} failed)` : 'Success',
      },
      duplicateAction: input.duplicateAction,
      primaryKey: input.primaryKey,
    }),
    { module: 'sheets', timeoutMs: DESTINATION_TIMEOUT_MS },
  );

  return { destinations: { sheets, notion, media }, imageLink, warnings };
}
