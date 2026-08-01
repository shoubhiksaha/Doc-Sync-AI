import { OpenAI, toFile } from "openai";


import { UniversalAIAdapter } from './UniversalAIAdapter';

function detectProviderAndModel(key: string) {
  if (key.startsWith('gsk_')) {
    return { provider: 'groq', modelName: 'llama-3.2-90b-vision-preview' };
  } else if (key.startsWith('sk-') || key.startsWith('proj-')) {
    return { provider: 'openai', modelName: 'gpt-4o' };
  } else {
    // Default to Gemini 3.6 Flash (100% free and amazing at OCR)
    return { provider: 'google', modelName: 'gemini-2.5-flash' };
  }
}

export async function extractDocumentData(imageBuffer: Buffer, profileId: string, customApiKey?: string) {
  // 1. Prioritize user-provided key from settings, then fallback to env variables
  const envGemini = process.env.GEMINI_API_KEY;
  const envGroq = process.env.GROQ_API_KEY;
  const envOpenAI = process.env.OPENAI_API_KEY;
  
  const apiKey = customApiKey || envGemini || envGroq || envOpenAI || 'dummy_key';

  // If no API key is provided, we return mock data immediately
  if (apiKey === 'dummy_key') {
    console.warn("No API Keys set. Using mock extraction.");
    return getMockData(profileId);
  }

  const { provider, modelName } = detectProviderAndModel(apiKey);
  
  const adapter = new UniversalAIAdapter({
    apiKey: apiKey,
    provider: provider,
    modelName: modelName,
  });

  const base64Image = imageBuffer.toString('base64');
  
  // 2. Select schema structure based on profile
  let systemPrompt = `You are an expert document extraction AI. Your entire response MUST be valid JSON and exactly match the required schema. DO NOT include markdown formatting like \`\`\`json. Return raw JSON.`;
  
  if (profileId === 'ngo-receipt') {
    systemPrompt += `\nSchema: { "date": "DD-MMM-YYYY", "donorName": "string", "amount": number, "panNumber": "string" }`;
    systemPrompt += `\nExtract date, donor name, amount, and PAN number from the NGO donation receipt.`;
  } else if (profileId === 'factory-weight-slip') {
    systemPrompt += `\nSchema: { "date": "DD-MMM-YYYY", "vehicleNumber": "string", "grossWeight": number, "tareWeight": number }`;
    systemPrompt += `\nExtract date, vehicle number, gross weight, and tare weight from the factory scrap weight slip.`;
  } else {
    throw new Error('Unsupported profile ID');
  }

  try {
    const rawJsonString = await adapter.chat(
      systemPrompt, 
      "Extract the data from this document image with extremely high precision.", 
      [{ mimeType: "image/jpeg", base64Data: base64Image }]
    );

    const parsedData = JSON.parse(rawJsonString);
    return parsedData;
  } catch (error) {
    console.error(`Extraction error with ${provider}:`, error);
    throw new Error("Failed to extract document data.");
  }
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

export async function transcribeAudio(audioBuffer: Buffer, fileName: string, customApiKey?: string) {
  const envGroq = process.env.GROQ_API_KEY;
  const envGemini = process.env.GEMINI_API_KEY;
  const envOpenAI = process.env.OPENAI_API_KEY;

  const runGroq = async (key: string) => {
    const client = new OpenAI({ apiKey: key, baseURL: 'https://api.groq.com/openai/v1' });
    const file = await toFile(audioBuffer, fileName);
    const response = await client.audio.transcriptions.create({
      file: file,
      model: 'whisper-large-v3',
    });
    return response.text;
  };

  const runGemini = async (key: string) => {
    const base64Audio = audioBuffer.toString('base64');
    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash'];
    
    for (const model of modelsToTry) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const payload = {
        contents: [{
          role: "user",
          parts: [
            { text: "Transcribe the following audio file accurately. Return ONLY the raw transcribed text. Do not include quotes or any conversational filler." },
            { inlineData: { mimeType: fileName.endsWith('.mp3') ? "audio/mp3" : "audio/webm", data: base64Audio } }
          ]
        }]
      };
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text.trim();
      } else {
        if (response.status >= 500 || response.status === 404 || response.status === 429) continue;
        break;
      }
    }
    return null;
  };

  const runOpenAI = async (key: string) => {
    const client = new OpenAI({ apiKey: key, baseURL: 'https://api.openai.com/v1' });
    const file = await toFile(audioBuffer, fileName);
    const response = await client.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
    });
    return response.text;
  };

  const attemptPipeline: { run: (k: string) => Promise<string | null>, key: string, name: string }[] = [];

  // Priority 1: BYOK (Any Provider)
  if (customApiKey) {
    if (customApiKey.startsWith('gsk_')) attemptPipeline.push({ run: runGroq, key: customApiKey, name: 'Groq (BYOK)' });
    else if (customApiKey.startsWith('AIza')) attemptPipeline.push({ run: runGemini, key: customApiKey, name: 'Gemini (BYOK)' });
    else if (customApiKey.startsWith('sk-') || customApiKey.startsWith('proj-')) attemptPipeline.push({ run: runOpenAI, key: customApiKey, name: 'OpenAI (BYOK)' });
  }

  // Priority 2: Groq (Env) - specifically for transcribing
  if (envGroq) attemptPipeline.push({ run: runGroq, key: envGroq, name: 'Groq (Env)' });
  // Priority 3: Gemini (Env)
  if (envGemini) attemptPipeline.push({ run: runGemini, key: envGemini, name: 'Gemini (Env)' });
  // Priority 4: OpenAI (Env)
  if (envOpenAI) attemptPipeline.push({ run: runOpenAI, key: envOpenAI, name: 'OpenAI (Env)' });

  // Execute pipeline
  for (const attempt of attemptPipeline) {
    try {
      console.log(`Trying transcription with ${attempt.name}...`);
      const result = await attempt.run(attempt.key);
      if (result) return result;
    } catch (error) {
      console.error(`Transcription pipeline attempt failed (${attempt.name}):`, error);
    }
  }

  console.warn("All transcription methods failed or no keys available.");
  return null;
}
