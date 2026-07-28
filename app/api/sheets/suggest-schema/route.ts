import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { getDecryptedCookie } from '@/lib/crypto';

export type SuggestedField = {
  key: string;        // machine key, e.g. "donor_name"
  label: string;      // human label, e.g. "Donor Name"
  example: string;    // value from the extracted data, e.g. "Rahul Sharma"
  confidence: number; // 0-100
  reason: string;     // why this field is included / why confidence is low
  required: boolean;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { extractedData, profileId } = body;

    if (!extractedData || !profileId) {
      return NextResponse.json({ error: 'Missing extractedData or profileId' }, { status: 400 });
    }

    const openaiKey = getDecryptedCookie(req, 'docsync_openai')
      || process.env.OPENAI_API_KEY
      || process.env.GITHUB_TOKEN;

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
4. Add a "Timestamp" column for when the row was synced (confidence 100).
5. Always include a "Sync Status" column (confidence 100).

Return ONLY a valid JSON array (no markdown, no explanation) in exactly this format:
[
  {
    "key": "snake_case_key",
    "label": "Human Readable Label",
    "example": "value from extracted data or example",
    "confidence": 95,
    "reason": "Directly extracted from document",
    "required": true
  }
]`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0].message.content || '{}';
    // The model returns a JSON object — unwrap the array
    const parsed = JSON.parse(raw);
    // Handle both {fields:[...]} and [...] responses
    const fields: SuggestedField[] = Array.isArray(parsed) ? parsed : (parsed.fields || parsed.columns || Object.values(parsed)[0] as SuggestedField[]);

    return NextResponse.json({ fields });

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
      { key: 'synced_at', label: 'Synced At', example: new Date().toISOString(), confidence: 100, reason: 'Auto-generated timestamp', required: true },
      { key: 'sync_status', label: 'Sync Status', example: 'Success', confidence: 100, reason: 'Auto-generated status', required: true },
    ];
  }
  return [
    { key: 'date', label: 'Date', example: String(extractedData.date || ''), confidence: 95, reason: 'Directly extracted', required: true },
    { key: 'vehicle_number', label: 'Vehicle Number', example: String(extractedData.vehicleNumber || ''), confidence: 95, reason: 'Directly extracted', required: true },
    { key: 'gross_weight', label: 'Gross Weight (kg)', example: String(extractedData.grossWeight || ''), confidence: 95, reason: 'Directly extracted', required: true },
    { key: 'tare_weight', label: 'Tare Weight (kg)', example: String(extractedData.tareWeight || ''), confidence: 95, reason: 'Directly extracted', required: true },
    { key: 'net_weight', label: 'Net Weight (kg)', example: String((Number(extractedData.grossWeight || 0) - Number(extractedData.tareWeight || 0)) || ''), confidence: 60, reason: 'Derived: Gross - Tare. Verify formula is correct.', required: false },
    { key: 'synced_at', label: 'Synced At', example: new Date().toISOString(), confidence: 100, reason: 'Auto-generated timestamp', required: true },
    { key: 'sync_status', label: 'Sync Status', example: 'Success', confidence: 100, reason: 'Auto-generated status', required: true },
  ];
}
