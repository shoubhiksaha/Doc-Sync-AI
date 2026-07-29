import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { loadSettings } from '@/lib/settings-loader';

export type SuggestedField = {
  key: string;
  label: string;
  example: string;
  confidence: number;
  reason: string;
  required: boolean;
};


import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

const SuggestedFieldSchema = z.object({
  fields: z.array(z.object({
    key: z.string(),
    label: z.string(),
    example: z.string(),
    confidence: z.number(),
    reason: z.string(),
    required: z.boolean(),
  }))
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { extractedData, profileId } = body;

    if (!extractedData || !profileId) {
      return NextResponse.json({ error: 'Missing extractedData or profileId' }, { status: 400 });
    }

    const { openaiKey: loadedOpenaiKey } = await loadSettings(req);
    const openaiKey = loadedOpenaiKey || req.headers.get('x-openai-key') || process.env.OPENAI_API_KEY || process.env.GITHUB_TOKEN || undefined;

    // If no AI key, return smart static defaults based on profile
    if (!openaiKey) {
      return NextResponse.json({ fields: getStaticDefaults(profileId, extractedData) });
    }

    const isGitHubToken = openaiKey.startsWith('ghp_') || openaiKey.startsWith('github_pat_');
    const openai = new OpenAI({
      apiKey: openaiKey,
      ...(isGitHubToken && { baseURL: 'https://models.inference.ai.azure.com' }),
    });

    const dataStr = JSON.stringify(extractedData, null, 2);
    const prompt = `You are a data analyst helping design a Google Sheet for a ${profileId === 'ngo-receipt' ? 'NGO donation receipt tracker' : 'factory scrap weight-slip tracker'}.

The AI has extracted the following data from a document:
${dataStr}

Your task:
1. Propose the IDEAL set of column headers for a Google Sheet that will store data from many such documents.
2. For each field that is DIRECTLY extracted from the document, give it a high confidence (80-100).
3. If a field is DERIVED (e.g., "Net Weight" = Gross - Tare) or you're UNSURE about its format/name, give it lower confidence (40-70) and flag it for user review.
4. Only include fields that correspond to the provided extracted data or standard derived fields. Do not add arbitrary metadata like Timestamp or Sync Status unless explicitly present in the data.

Return ONLY a JSON object with a single key "fields", which contains an array of your proposed columns. Exactly like this:
{
  "fields": [
    {
      "key": "snake_case_key",
      "label": "Human Readable Label",
      "example": "example value",
      "confidence": 95,
      "reason": "Directly extracted from document",
      "required": true
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0].message.content || '{}';
    let parsedData: any = {};
    
    try {
      // Sometimes LLMs return markdown blocks even with json_object
      const cleanJson = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(cleanJson);
    } catch (e) {
      console.warn("Failed to parse suggest-schema json:", raw);
    }

    // Robust extraction of the array
    let fieldsArray: any[] = [];
    if (Array.isArray(parsedData)) {
      fieldsArray = parsedData;
    } else if (parsedData && Array.isArray(parsedData.fields)) {
      fieldsArray = parsedData.fields;
    } else if (parsedData && Array.isArray(parsedData.columns)) {
      fieldsArray = parsedData.columns;
    } else if (parsedData && typeof parsedData === 'object') {
      const firstVal = Object.values(parsedData)[0];
      if (Array.isArray(firstVal)) fieldsArray = firstVal;
    }

    if (!fieldsArray || fieldsArray.length === 0) {
       return NextResponse.json({ fields: getStaticDefaults(profileId, extractedData) });
    }

    return NextResponse.json({ fields: fieldsArray });

  } catch (error) {
    console.error('Schema suggestion error:', error);
    return NextResponse.json({ error: 'Failed to generate schema suggestion' }, { status: 500 });
  }
}

function getStaticDefaults(profileId: string, extractedData: Record<string, unknown>): SuggestedField[] {
  if (profileId === 'ngo-receipt') {
    return [
      { key: 'date', label: 'Date', example: String(extractedData.date || ''), confidence: 95, reason: 'Directly extracted', required: true },
      { key: 'donor_name', label: 'Donor Name', example: String(extractedData.donorName || ''), confidence: 95, reason: 'Directly extracted', required: true },
      { key: 'amount', label: 'Amount (₹)', example: String(extractedData.amount || ''), confidence: 95, reason: 'Directly extracted', required: true },
      { key: 'pan_number', label: 'PAN Number', example: String(extractedData.panNumber || ''), confidence: 80, reason: 'May be absent on small receipts', required: false },
    ];
  }
  return [
    { key: 'date', label: 'Date', example: String(extractedData.date || ''), confidence: 95, reason: 'Directly extracted', required: true },
    { key: 'vehicle_number', label: 'Vehicle Number', example: String(extractedData.vehicleNumber || ''), confidence: 95, reason: 'Directly extracted', required: true },
    { key: 'gross_weight', label: 'Gross Weight (kg)', example: String(extractedData.grossWeight || ''), confidence: 95, reason: 'Directly extracted', required: true },
    { key: 'tare_weight', label: 'Tare Weight (kg)', example: String(extractedData.tareWeight || ''), confidence: 95, reason: 'Directly extracted', required: true },
    { key: 'net_weight', label: 'Net Weight (kg)', example: String((Number(extractedData.grossWeight || 0) - Number(extractedData.tareWeight || 0)) || ''), confidence: 60, reason: 'Derived: Gross - Tare. Verify formula is correct.', required: false },
  ];
}

