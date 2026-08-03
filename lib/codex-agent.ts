import { UniversalAIAdapter } from './UniversalAIAdapter';
import { NgoReceiptSchema, FactoryWeightSlipSchema } from './schemas';
import { z } from "zod";

export type AuditLog = {
  stage: string;
  status: 'success' | 'warning' | 'error';
  message: string;
};

function detectProviderAndModel(key: string) {
  if (key.startsWith('gsk_')) return { provider: 'groq', modelName: 'llama-3.2-90b-vision-preview' };
  if (key.startsWith('sk-') || key.startsWith('proj-') || key.startsWith('ghp_') || key.startsWith('github_pat_')) return { provider: 'openai', modelName: 'gpt-4o' };
  return { provider: 'google', modelName: 'gemini-3.6-flash' };
}

export async function runCodexPipeline(
  imageBuffer: Buffer,
  profileId: string,
  customApiKey?: string
): Promise<{ data: unknown; auditLogs: AuditLog[] }> {

  const resolvedKey = customApiKey || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.GITHUB_TOKEN;

  // If no API key is available at all, return mock data immediately
  if (!resolvedKey) {
    console.warn("No API key set. Using mock extraction.");
    return {
      data: getMockData(profileId),
      auditLogs: [{ stage: 'System', status: 'warning', message: 'Used mock data — no API key configured. Add GEMINI_API_KEY or OPENAI_API_KEY to .env.local' }],
    };
  }

  const { provider, modelName } = detectProviderAndModel(resolvedKey);
  const adapter = new UniversalAIAdapter({ apiKey: resolvedKey, provider, modelName });
  const base64Image = imageBuffer.toString('base64');
  const auditLogs: AuditLog[] = [];

  let schemaString = "";
  let contextPrompt = "";

  if (profileId === 'ngo-receipt') {
    schemaString = `
{
  "date": "string (format: DD-MMM-YYYY)",
  "donorName": "string",
  "amount": "number",
  "panNumber": "string (optional)"
}`;
    contextPrompt = "Extract date, donor name, amount, and PAN number from the NGO donation receipt.";
  } else if (profileId === 'factory-weight-slip') {
    schemaString = `
{
  "date": "string (format: DD-MMM-YYYY)",
  "vehicleNumber": "string",
  "grossWeight": "number",
  "tareWeight": "number"
}`;
    contextPrompt = "Extract date, vehicle number, gross weight, and tare weight from the factory scrap weight slip.";
  } else {
    throw new Error('Unsupported profile ID');
  }

  const systemPrompt = `You are an expert document extraction AI. ${contextPrompt}
Your ENTIRE response MUST be ONLY valid JSON matching this schema exactly:
${schemaString}
DO NOT wrap the response in markdown \`\`\`json. Return raw JSON.`;

  // --- STAGE 1: Fast Extraction (Universal AI Adapter) ---
  auditLogs.push({ stage: 'Extraction', status: 'success', message: `Initiated Stage 1: ${modelName} extraction` });
  let extractedData;
  try {
    const responseText = await adapter.chat(
      systemPrompt, 
      "Extract the data from this document image.", 
      [{ mimeType: 'image/jpeg', base64Data: base64Image }]
    );
    const parsedJson = JSON.parse(responseText);
    
    // Validate with Zod
    if (profileId === 'ngo-receipt') {
      extractedData = NgoReceiptSchema.parse(parsedJson);
    } else {
      extractedData = FactoryWeightSlipSchema.parse(parsedJson);
    }
    
    auditLogs.push({ stage: 'Extraction', status: 'success', message: 'Stage 1 completed successfully.' });
  } catch (err) {
    auditLogs.push({ stage: 'Extraction', status: 'error', message: 'Stage 1 failed. Triggering Self-Healing fallback.' });
    extractedData = null;
  }

  // --- STAGE 2: Self-Healing Fallback ---
  if (!extractedData) {
    auditLogs.push({ stage: 'Self-Healing', status: 'warning', message: `Escalating to deeper parsing.` });
    try {
      const fallbackPrompt = systemPrompt + " Be extremely precise, this is a fallback for difficult handwriting. Pay close attention to smudged text.";
      const responseText = await adapter.chat(
        fallbackPrompt, 
        "Extract the data from this document image.", 
        [{ mimeType: 'image/jpeg', base64Data: base64Image }]
      );
      const parsedJson = JSON.parse(responseText);
      
      if (profileId === 'ngo-receipt') {
        extractedData = NgoReceiptSchema.parse(parsedJson);
      } else {
        extractedData = FactoryWeightSlipSchema.parse(parsedJson);
      }
      auditLogs.push({ stage: 'Self-Healing', status: 'success', message: 'Stage 2 recovered data successfully.' });
    } catch (err: unknown) {
      auditLogs.push({ stage: 'Self-Healing', status: 'error', message: 'Stage 2 failed to recover data.' });
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('401') || msg.includes('API Error')) {
        throw new Error(`Invalid API Key. Please check your token in Settings.`);
      }
      throw new Error(`Codex Pipeline failed to extract document data. Inner error: ${msg}`);
    }
  }

  // --- STAGE 3: Logical Inconsistency Validator ---
  auditLogs.push({ stage: 'Validation', status: 'success', message: 'Running logical inconsistency checks.' });

  if (profileId === 'factory-weight-slip') {
    const fwData = extractedData as z.infer<typeof FactoryWeightSlipSchema>;
    if (fwData.tareWeight >= fwData.grossWeight) {
      auditLogs.push({ stage: 'Validation', status: 'warning', message: `Logical inconsistency: Tare (${fwData.tareWeight}) >= Gross (${fwData.grossWeight}). Human review required.` });
    } else {
      auditLogs.push({ stage: 'Validation', status: 'success', message: 'Weight logic checks passed.' });
    }
  }

  if (profileId === 'ngo-receipt') {
    const ngoData = extractedData as z.infer<typeof NgoReceiptSchema>;
    if (ngoData.amount > 2000 && (!ngoData.panNumber || ngoData.panNumber.trim() === '')) {
      auditLogs.push({ stage: 'Validation', status: 'warning', message: `Compliance: PAN legally required for donations > ₹2000. Amount: ₹${ngoData.amount} has no PAN.` });
    } else {
      auditLogs.push({ stage: 'Validation', status: 'success', message: 'Compliance checks passed.' });
    }
  }

  return { data: extractedData, auditLogs };
}

function getMockData(profileId: string) {
  if (profileId === 'ngo-receipt') {
    return {
      date: '24-Oct-2023',
      donorName: 'Rahul Sharma',
      amount: 5000,
      panNumber: 'ABCDE1234F',
    };
  }
  return {
    date: '24-Oct-2023',
    vehicleNumber: 'MH-12-AB-1234',
    grossWeight: 15000,
    tareWeight: 5000,
  };
}
