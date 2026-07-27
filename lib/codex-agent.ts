import { OpenAI } from "openai";
import { zodResponseFormat } from 'openai/helpers/zod';
import { NgoReceiptSchema, FactoryWeightSlipSchema } from './schemas';
import { z } from "zod";

export type AuditLog = {
  stage: string;
  status: 'success' | 'warning' | 'error';
  message: string;
};

export async function runCodexPipeline(
  imageBuffer: Buffer, 
  profileId: string, 
  customApiKey?: string
): Promise<{ data: unknown, auditLogs: AuditLog[] }> {
  
  const openai = new OpenAI({
    apiKey: customApiKey || process.env.OPENAI_API_KEY || 'dummy_key',
  });

  // If no API key is provided, we return mock data immediately to bypass external connection
  if (!customApiKey && !process.env.OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY not set. Using mock extraction.");
    return { 
      data: getMockData(profileId), 
      auditLogs: [{ stage: 'System', status: 'warning', message: 'Used mock data due to missing API key.' }] 
    };
  }

  const base64Image = imageBuffer.toString('base64');
  const auditLogs: AuditLog[] = [];

  let schema;
  let contextPrompt = "";
  
  if (profileId === 'ngo-receipt') {
    schema = zodResponseFormat(NgoReceiptSchema, "ngo_receipt");
    contextPrompt = "Extract date, donor name, amount, and PAN number from the NGO donation receipt.";
  } else if (profileId === 'factory-weight-slip') {
    schema = zodResponseFormat(FactoryWeightSlipSchema, "factory_weight_slip");
    contextPrompt = "Extract date, vehicle number, gross weight, and tare weight from the factory scrap weight slip.";
  } else {
    throw new Error('Unsupported profile ID');
  }

  // --- STAGE 1: Schema Generation & Initial Extraction (Fast pass) ---
  auditLogs.push({ stage: 'Extraction', status: 'success', message: 'Initiated Stage 1: gpt-4o-mini fast extraction' });
  let extractedData;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (openai.beta as any).chat.completions.parse({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `You are an expert document extraction AI. ${contextPrompt}` },
        { 
          role: "user", 
          content: [
            { type: "text", text: "Extract the data from this document image." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
          ]
        }
      ],
      response_format: schema,
      temperature: 0,
    });
    extractedData = response.choices[0].message.parsed;
    auditLogs.push({ stage: 'Extraction', status: 'success', message: 'Stage 1 completed successfully.' });
  } catch {
    auditLogs.push({ stage: 'Extraction', status: 'error', message: 'Stage 1 failed. Triggering Self-Healing fallback.' });
    extractedData = null;
  }

  // --- STAGE 2: Self-Healing Data Transformer (Fallback to gpt-4o) ---
  if (!extractedData) {
    auditLogs.push({ stage: 'Self-Healing', status: 'warning', message: 'Escalating to gpt-4o for complex document parsing.' });
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const escalatedResponse = await (openai.beta as any).chat.completions.parse({
        model: "gpt-4o",
        messages: [
          { role: "system", content: `${contextPrompt} Be extremely precise, this is a fallback for difficult handwriting. Pay close attention to smudged text.` },
          { 
            role: "user", 
            content: [
              { type: "text", text: "Extract the data from this document image." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
            ]
          }
        ],
        response_format: schema,
        temperature: 0,
      });
      extractedData = escalatedResponse.choices[0].message.parsed;
      auditLogs.push({ stage: 'Self-Healing', status: 'success', message: 'Stage 2 recovered data successfully.' });
    } catch {
      auditLogs.push({ stage: 'Self-Healing', status: 'error', message: 'Stage 2 failed to recover data.' });
      throw new Error("Codex Pipeline failed to extract document data.");
    }
  }

  // --- STAGE 3: Logical Inconsistency Validator ---
  auditLogs.push({ stage: 'Validation', status: 'success', message: 'Running logical inconsistency checks.' });
  
  if (profileId === 'factory-weight-slip') {
    const fwData = extractedData as z.infer<typeof FactoryWeightSlipSchema>;
    if (fwData.tareWeight >= fwData.grossWeight) {
      auditLogs.push({ stage: 'Validation', status: 'warning', message: `Logical inconsistency detected: Tare weight (${fwData.tareWeight}) is >= Gross weight (${fwData.grossWeight}). Human review strictly required.` });
    } else {
      auditLogs.push({ stage: 'Validation', status: 'success', message: 'Weight logic checks passed.' });
    }
  }

  if (profileId === 'ngo-receipt') {
    const ngoData = extractedData as z.infer<typeof NgoReceiptSchema>;
    if (ngoData.amount > 2000 && (!ngoData.panNumber || ngoData.panNumber.trim() === '')) {
      auditLogs.push({ stage: 'Validation', status: 'warning', message: `Compliance warning: PAN is legally required for NGO donations over ₹2000. Found amount: ₹${ngoData.amount} with no PAN.` });
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
