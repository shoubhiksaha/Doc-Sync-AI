import { NextRequest, NextResponse } from 'next/server';
import { errorText, parseJson, resolveCaller, unauthorized } from '@/core/http';
import { checkDemoDailyBudget } from '@/core/rate-limit';
import { ExtractionUnavailableError, extractFields, MAX_DOCUMENT_BYTES } from '@/modules/extraction';
import { getProfile } from '@/modules/profiles';
import { loadSettings } from '@/modules/settings';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const caller = await resolveCaller(req);
  if (!caller) return unauthorized();

  try {
    const formData = await req.formData();
    const file = formData.get('document');
    const profile = getProfile(formData.get('profileId') as string | null);

    if (!(file instanceof File)) return NextResponse.json({ error: 'No document provided' }, { status: 400 });
    if (!profile) return NextResponse.json({ error: 'Unknown document profile' }, { status: 400 });
    if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Only images allowed' }, { status: 400 });
    if (file.size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 413 });

    const { openaiKey } = await loadSettings(req);
    const customApiKey = req.headers.get('x-openai-key') || openaiKey;
    if (caller.isGuest && !customApiKey && !(await checkDemoDailyBudget())) {
      return NextResponse.json({ error: 'The demo has reached its daily AI limit. Please try again tomorrow or sign in.' }, { status: 429 });
    }

    const result = await extractFields({
      document: Buffer.from(await file.arrayBuffer()),
      profile,
      focusFields: parseJson<unknown[]>(formData.get('customFields'), []).filter((f): f is string => typeof f === 'string'),
      customApiKey,
    });

    const response = NextResponse.json({ success: true, ...result });
    if (result.quotaFallback) response.headers.set('x-docsync-ai-fallback', 'quota');
    return response;
  } catch (error) {
    if (error instanceof ExtractionUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: error.quotaLike ? 429 : 502 });
    }
    console.error('[extract] unexpected error:', errorText(error));
    return NextResponse.json({ error: 'Extraction failed. Please try again.' }, { status: 500 });
  }
}
