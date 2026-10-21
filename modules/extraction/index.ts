/**
 * Extraction module — turns a document photo into reviewed-ready fields.
 * Depends on the ai module for model calls and on profiles for prompts, mock data and
 * business-rule warnings. Never throws for a single bad field; malformed model output is
 * cleaned up or dropped field-by-field.
 */
import sharp from 'sharp';
import { env, isModuleEnabled } from '@/core/env';
import { AIUnavailableError, aiCandidates, chatJson } from '@/modules/ai';
import { validateFields, type DocumentProfile, type RecordField } from '@/modules/profiles';

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_FIELDS = 100;
const CATEGORIES = new Set(['identity', 'financial', 'date', 'contact', 'metadata', 'other']);

export interface ExtractionResult {
  documentType: string;
  fields: Required<Pick<RecordField, 'key' | 'label' | 'value' | 'confidence' | 'category'>>[];
  totalFieldsVisible: number;
  warnings: string[];
  isMock: boolean;
  /** Set when mock data was returned because every provider was out of quota. */
  quotaFallback?: boolean;
  provider?: string;
  stats: { originalSize: number; processedSize: number };
}

export class ExtractionUnavailableError extends Error {
  constructor(message: string, public readonly quotaLike: boolean) {
    super(message);
    this.name = 'ExtractionUnavailableError';
  }
}

/** Downscale for the vision model; retries smaller if the first pass is still over 5MB. */
export async function prepareImage(buffer: Buffer): Promise<Buffer> {
  let out = await sharp(buffer)
    .rotate()
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  if (out.length > 5 * 1024 * 1024) {
    out = await sharp(buffer)
      .rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 65 })
      .toBuffer();
  }
  return out;
}

function toCamelKey(label: string): string {
  const words = label.replace(/[^A-Za-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  return words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('') || 'field';
}

/** Coerces model output into well-formed fields; drops entries without a key/label and value. */
export function normalizeFields(raw: unknown): ExtractionResult['fields'] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ExtractionResult['fields'] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Record<string, unknown>;
    const label = String(f.label ?? f.key ?? '').trim();
    const value = f.value === null || f.value === undefined ? '' : (typeof f.value === 'object' ? JSON.stringify(f.value) : String(f.value)).trim();
    if (!label) continue;

    let key = String(f.key ?? '').trim().replace(/[^A-Za-z0-9_]/g, '') || toCamelKey(label);
    if (seen.has(key)) key = `${key}${out.length + 1}`;
    seen.add(key);

    const confidence = Math.max(0, Math.min(100, Math.round(Number(f.confidence) || 0)));
    const category = CATEGORIES.has(String(f.category)) ? String(f.category) : 'other';
    out.push({ key, label: label.slice(0, 120), value: value.slice(0, 2000), confidence, category });
    if (out.length >= MAX_FIELDS) break;
  }
  return out;
}

export function buildSystemPrompt(profile: DocumentProfile | undefined, focusFields: string[]): string {
  const priority = [...new Set([...(profile?.extraction.priorityFields ?? []), ...focusFields])];
  return `You are an expert document analysis AI. Your job is to extract EVERY visible field from the document image.
Your entire response MUST be valid JSON. DO NOT include markdown formatting like \`\`\`json. Return raw JSON matching this schema exactly:
{
  "fields": [
    {
      "key": "camelCase machine key, e.g. receiptNumber",
      "label": "Human-readable label, e.g. Receipt Number",
      "value": "The extracted value as a string",
      "confidence": 0-100,
      "category": "identity | financial | date | contact | metadata | other"
    }
  ],
  "documentType": "Brief description of what document type this appears to be",
  "totalFieldsVisible": 5
}

Be exhaustive — capture everything:
- Dates, reference numbers, IDs
- Names (person, organization, NGO, company)
- Financial amounts, percentages, tax info
- Addresses, contact info, phone, email
- Legal references, section numbers, certificate IDs
- Any labels/fields printed on the form that have values filled in
- Stamps, signatures noted as present (even if not readable)

For confidence: 95+ = clearly printed, 75-94 = slightly unclear, 50-74 = partially visible, <50 = inferred.
Return every field you can possibly identify.${profile ? `\n\nContext: ${profile.extraction.context}` : ''}${priority.length ? `\n\nALWAYS look for these fields and use these labels when present: ${priority.join(', ')}.` : ''}`;
}

function mockResult(profile: DocumentProfile | undefined, stats: ExtractionResult['stats'], quotaFallback = false): ExtractionResult {
  const fields = normalizeFields(profile?.mockFields ?? []);
  return {
    documentType: 'Mock Document',
    fields,
    totalFieldsVisible: fields.length,
    warnings: profile ? validateFields(profile, fields) : [],
    isMock: true,
    ...(quotaFallback ? { quotaFallback } : {}),
    stats,
  };
}

export interface ExtractInput {
  document: Buffer;
  profile?: DocumentProfile;
  /** Field labels from the user's saved template. */
  focusFields?: string[];
  customApiKey?: string | null;
}

export async function extractFields(input: ExtractInput): Promise<ExtractionResult> {
  if (!isModuleEnabled('extraction')) {
    throw new ExtractionUnavailableError('Document extraction is temporarily disabled.', false);
  }

  const image = await prepareImage(input.document);
  const stats = { originalSize: input.document.length, processedSize: image.length };

  if (aiCandidates(input.customApiKey).length === 0) {
    return mockResult(input.profile, stats);
  }

  try {
    const { text, provider } = await chatJson({
      system: buildSystemPrompt(input.profile, input.focusFields ?? []),
      user: `Extract ALL fields from this ${input.profile?.documentName ?? 'document'}. Be exhaustive.`,
      images: [{ mimeType: 'image/jpeg', base64Data: image.toString('base64') }],
      customApiKey: input.customApiKey,
    });

    let parsed: { documentType?: unknown; fields?: unknown; totalFieldsVisible?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ExtractionUnavailableError('The AI provider returned an unreadable response. Please try again.', false);
    }
    const fields = normalizeFields(parsed.fields);
    if (fields.length === 0) {
      throw new ExtractionUnavailableError('No fields could be read from this document. Try a clearer, well-lit photo.', false);
    }

    return {
      documentType: String(parsed.documentType ?? input.profile?.documentName ?? 'Document').slice(0, 200),
      fields,
      totalFieldsVisible: Number(parsed.totalFieldsVisible) || fields.length,
      warnings: input.profile ? validateFields(input.profile, fields) : [],
      isMock: false,
      provider,
      stats,
    };
  } catch (err) {
    if (err instanceof AIUnavailableError) {
      if (err.quotaLike && env('DEMO_FALLBACK_ON_AI_QUOTA') === 'true') {
        return mockResult(input.profile, stats, true);
      }
      throw new ExtractionUnavailableError(
        err.quotaLike
          ? 'AI provider quota/rate limit reached. Add another provider key (Groq/OpenAI/Gemini/Anthropic) or wait for the quota to reset.'
          : `Extraction failed on every configured AI provider. Check the provider keys and model access. (${err.message.slice(0, 400)})`,
        err.quotaLike,
      );
    }
    throw err;
  }
}

export function extractionHealth() {
  return { enabled: isModuleEnabled('extraction'), configured: true, circuit: 'closed' as const };
}
