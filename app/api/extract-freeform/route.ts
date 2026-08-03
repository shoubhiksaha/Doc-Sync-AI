import { NextRequest, NextResponse } from 'next/server';
export const maxDuration = 60;
import sharp from 'sharp';
import { UniversalAIAdapter } from '@/lib/UniversalAIAdapter';
import { loadSettings } from '@/lib/settings-loader';
import { checkRateLimit } from '@/lib/rate-limit';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

type ProviderConfig = {
  provider: string;
  modelName: string;
};

type ProviderCandidate = ProviderConfig & {
  apiKey: string;
  source: string;
};

function detectProviderAndModel(key: string): ProviderConfig {
  if (key.startsWith('gsk_')) {
    return { provider: 'groq', modelName: 'llama-3.2-90b-vision-preview' };
  } else if (key.startsWith('sk-') || key.startsWith('proj-')) {
    return { provider: 'openai', modelName: 'gpt-4o' };
  } else {
    // Default to Gemini (starts with AIza... or AQ...)
    return { provider: 'google', modelName: 'gemini-3.5-flash' };
  }
}

function buildProviderCandidates(customApiKey?: string): ProviderCandidate[] {
  const rawCandidates = [
    customApiKey ? { apiKey: customApiKey, source: 'saved key' } : null,
    process.env.GROQ_API_KEY ? { apiKey: process.env.GROQ_API_KEY, source: 'GROQ_API_KEY' } : null,
    process.env.OPENAI_API_KEY ? { apiKey: process.env.OPENAI_API_KEY, source: 'OPENAI_API_KEY' } : null,
    process.env.GEMINI_API_KEY ? { apiKey: process.env.GEMINI_API_KEY, source: 'GEMINI_API_KEY' } : null,
  ].filter(Boolean) as { apiKey: string; source: string }[];

  const seen = new Set<string>();
  return rawCandidates.flatMap(({ apiKey, source }) => {
    if (seen.has(apiKey)) return [];
    seen.add(apiKey);
    return [{ apiKey, source, ...detectProviderAndModel(apiKey) }];
  });
}

function isRecoverableProviderError(message: string): boolean {
  return /\b(408|409|429|5\d\d)\b/.test(message)
    || message.includes('RESOURCE_EXHAUSTED')
    || message.toLowerCase().includes('quota')
    || message.toLowerCase().includes('rate limit')
    || message.toLowerCase().includes('model not found');
}

function getMockExtraction(buffer: Buffer, imgBuffer: Buffer) {
  return NextResponse.json({
    success: true,
    documentType: 'Mock Document',
    fields: [
      { key: 'date', label: 'Date', value: '24-Oct-2023', confidence: 95, category: 'date' },
      { key: 'receiptNumber', label: 'Receipt Number', value: 'REC-2023-4521', confidence: 88, category: 'identity' },
      { key: 'donorName', label: 'Donor Name', value: 'Rahul Sharma', confidence: 97, category: 'identity' },
      { key: 'amount', label: 'Amount', value: '₹5,000', confidence: 99, category: 'financial' },
      { key: 'paymentMode', label: 'Payment Mode', value: 'Cheque', confidence: 85, category: 'financial' },
      { key: 'panNumber', label: 'PAN Number', value: 'ABCDE1234F', confidence: 91, category: 'identity' },
      { key: 'ngoName', label: 'NGO Name', value: 'Help India Foundation', confidence: 96, category: 'identity' },
      { key: 'section80g', label: 'Section 80G Ref', value: 'AAACH2345K/2023-24', confidence: 72, category: 'metadata' },
    ],
    stats: { originalSize: buffer.length, processedSize: imgBuffer.length },
    isMock: true,
  });
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 20 extractions per 10 minutes per IP
    const isAllowed = await checkRateLimit(req, 20, 10 * 60 * 1000);
    if (!isAllowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const formData = await req.formData();
    const file = formData.get('document') as File | null;
    const profileId = (formData.get('profileId') as string) || 'unknown';
    const customFields = formData.get('customFields') as string | null; // JSON array of field keys to focus on

    if (!file) return NextResponse.json({ error: 'No document provided' }, { status: 400 });
    if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Only images allowed' }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 413 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Compress for vision API
    let imgBuffer = await sharp(buffer)
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer();

    if (imgBuffer.length > 5 * 1024 * 1024) {
      imgBuffer = await sharp(buffer)
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 65 })
        .toBuffer();
    }

    const { openaiKey } = await loadSettings(req);
    const customApiKey = req.headers.get('x-openai-key') || openaiKey;
    const candidates = buildProviderCandidates(customApiKey);

    // If no API key — return mock data
    if (candidates.length === 0) {
      return getMockExtraction(buffer, imgBuffer);
    }

    const base64Image = imgBuffer.toString('base64');

    // Build the system prompt — if user has saved a template, focus on those fields
    let focusPrompt = '';
    if (customFields) {
      const fields: string[] = JSON.parse(customFields);
      if (fields.length > 0) {
        focusPrompt = `\n\nThe user has indicated this is a standard template. PRIORITIZE extracting these fields: ${fields.join(', ')}. Also extract any additional fields you can see.`;
      }
    }

    const systemPrompt = `You are an expert document analysis AI. Your job is to extract EVERY visible field from the document image.
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
Return every field you can possibly identify.${focusPrompt}`;

    let parsed: { documentType?: string; fields?: unknown[]; totalFieldsVisible?: number } | null = null;
    let lastError = 'No provider attempted extraction.';

    for (const candidate of candidates) {
      try {
        const adapter = new UniversalAIAdapter({
          apiKey: candidate.apiKey,
          provider: candidate.provider,
          modelName: candidate.modelName,
        });

        const rawJsonString = await adapter.chat(
          systemPrompt,
          `Extract ALL fields from this ${profileId} document. Be exhaustive.`,
          [{ mimeType: "image/jpeg", base64Data: base64Image }]
        );

        parsed = JSON.parse(rawJsonString);
        break;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        lastError = msg;
        console.warn(`Extraction failed with ${candidate.provider} (${candidate.source}):`, msg);

        if (!isRecoverableProviderError(msg)) {
          break;
        }
      }
    }

    if (!parsed || !Array.isArray(parsed.fields)) {
      const quotaLike = isRecoverableProviderError(lastError);
      if (quotaLike && process.env.DEMO_FALLBACK_ON_AI_QUOTA === 'true') {
        const response = getMockExtraction(buffer, imgBuffer);
        response.headers.set('x-docsync-ai-fallback', 'quota');
        return response;
      }

      return NextResponse.json({
        error: quotaLike
          ? 'AI provider quota/rate limit reached. Add another provider key (Groq/OpenAI/Gemini) or wait for quota reset.'
          : 'Extraction failed. Please check the configured AI provider key and model access.',
      }, { status: quotaLike ? 429 : 500 });
    }

    return NextResponse.json({
      success: true,
      documentType: parsed.documentType,
      fields: parsed.fields,
      totalFieldsVisible: parsed.totalFieldsVisible,
      stats: { originalSize: buffer.length, processedSize: imgBuffer.length },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Freeform extraction error:', msg);
    return NextResponse.json({ error: `Extraction failed: ${msg}` }, { status: 500 });
  }
}
