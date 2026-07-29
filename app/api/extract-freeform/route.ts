import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { OpenAI } from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

// The free-form schema: AI returns whatever fields it finds
const FreFormSchema = z.object({
  fields: z.array(z.object({
    key: z.string().describe('camelCase machine key, e.g. receiptNumber'),
    label: z.string().describe('Human-readable label, e.g. Receipt Number'),
    value: z.string().describe('The extracted value as a string'),
    confidence: z.number().min(0).max(100).describe('0-100 confidence score'),
    category: z.enum(['identity', 'financial', 'date', 'contact', 'metadata', 'other']),
  })),
  documentType: z.string().describe('Brief description of what document type this appears to be'),
  totalFieldsVisible: z.number().describe('Total number of distinct fields/sections visible in the document'),
});

function createOpenAIClient(customApiKey?: string) {
  const apiKey = customApiKey || process.env.OPENAI_API_KEY || process.env.GITHUB_TOKEN;
  const isGitHubToken = apiKey?.startsWith('ghp_') || apiKey?.startsWith('github_pat_');
  return new OpenAI({
    apiKey: apiKey || 'dummy_key',
    ...(isGitHubToken && { baseURL: 'https://models.inference.ai.azure.com' }),
  });
}

export async function POST(req: NextRequest) {
  try {
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

    const apiKey = req.headers.get('x-openai-key') || process.env.OPENAI_API_KEY || process.env.GITHUB_TOKEN;

    // If no API key — return mock data
    if (!apiKey) {
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

    const openai = createOpenAIClient(apiKey);
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

    const response = await openai.chat.completions.parse({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Extract ALL fields from this ${profileId} document. Be exhaustive.` },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
          ],
        },
      ],
      response_format: zodResponseFormat(FreFormSchema, 'extracted_document'),
      temperature: 0,
    });

    const parsed = response.choices[0].message.parsed;
    if (!parsed) throw new Error('AI returned empty response');

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
