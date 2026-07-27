import { OpenAI } from "openai";
import { zodResponseFormat } from 'openai/helpers/zod';
import { NgoReceiptSchema, FactoryWeightSlipSchema } from './schemas';

export async function extractDocumentData(imageBuffer: Buffer, profileId: string, customApiKey?: string) {
  const openai = new OpenAI({
    apiKey: customApiKey || process.env.OPENAI_API_KEY || 'dummy_key',
  });

  // If no API key is provided, we return mock data immediately to bypass external connection
  if (!customApiKey && !process.env.OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY not set. Using mock extraction.");
    return getMockData(profileId);
  }

  const base64Image = imageBuffer.toString('base64');
  
  // Select schema and prompt based on profile
  let schema;
  let systemPrompt = "You are an expert document extraction AI. Extract the fields as requested.";
  
  if (profileId === 'ngo-receipt') {
    schema = zodResponseFormat(NgoReceiptSchema, "ngo_receipt");
    systemPrompt += " Extract date, donor name, amount, and PAN number from the NGO donation receipt.";
  } else if (profileId === 'factory-weight-slip') {
    schema = zodResponseFormat(FactoryWeightSlipSchema, "factory_weight_slip");
    systemPrompt += " Extract date, vehicle number, gross weight, and tare weight from the factory scrap weight slip.";
  } else {
    throw new Error('Unsupported profile ID');
  }

  try {
    // Agentic Pipeline Stage 1: Fast extraction with gpt-4o-mini
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (openai.beta as any).chat.completions.parse({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
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

    const parsedData = response.choices[0].message.parsed;
    
    // Agentic Pipeline Stage 2: Validation check (Confidence routing)
    // If mini fails to parse completely, we could escalate to gpt-4o here.
    if (!parsedData) {
      console.warn("gpt-4o-mini failed to parse, escalating to gpt-4o...");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const escalatedResponse = await (openai.beta as any).chat.completions.parse({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt + " Be extremely precise as this is a fallback for difficult handwriting." },
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
      return escalatedResponse.choices[0].message.parsed;
    }

    return parsedData;

  } catch (error) {
    console.error("OpenAI extraction error:", error);
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
