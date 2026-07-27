import { Client } from '@notionhq/client';
// In a real scenario, you'd import NotionMultipartUploader here if you needed file uploads
// import NotionMultipartUploader from 'notion-multipart-uploader';
import { NgoReceiptData, FactoryWeightSlipData } from "./schemas";

export async function syncToNotion(
  data: NgoReceiptData | FactoryWeightSlipData, 
  profileId: string,
  customNotionKey?: string | null,
  customDbId?: string | null
) {
  // If no Notion integration keys are configured, return mock success
  const apiKey = customNotionKey || process.env.NOTION_API_KEY;
  const databaseId = customDbId || process.env.NOTION_DATABASE_ID;

  if (!apiKey || !databaseId) {
    console.warn("Notion keys missing. Skipping external sync.");
    return { success: true, dummy: true };
  }

  const notion = new Client({ auth: apiKey });

  try {
    if (!databaseId) throw new Error("Missing NOTION_DATABASE_ID");

    // Map data to Notion properties based on profile
    const properties: Record<string, unknown> = {
      "Date": { date: { start: data.date as string } },
    };

    if (profileId === 'ngo-receipt') {
      const ngoData = data as NgoReceiptData;
      properties["Name"] = { title: [{ text: { content: ngoData.donorName as string } }] };
      properties["Amount"] = { number: ngoData.amount as number };
      properties["PAN"] = { rich_text: [{ text: { content: (ngoData.panNumber as string) || '' } }] };
      properties["Profile"] = { select: { name: 'NGO Receipt' } };
    } else if (profileId === 'factory-weight-slip') {
      const factoryData = data as FactoryWeightSlipData;
      properties["Name"] = { title: [{ text: { content: factoryData.vehicleNumber as string } }] };
      properties["Gross Weight"] = { number: factoryData.grossWeight as number };
      properties["Tare Weight"] = { number: factoryData.tareWeight as number };
      properties["Net Weight"] = { number: (factoryData.grossWeight as number) - (factoryData.tareWeight as number) };
      properties["Profile"] = { select: { name: 'Factory Weight Slip' } };
    } else {
      throw new Error('Unsupported profile ID');
    }

    const response = await notion.pages.create({
      parent: { database_id: databaseId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      properties: properties as any,
    });

    return { success: true, id: response.id };
  } catch (error) {
    console.error("Notion sync error:", error);
    throw new Error("Failed to sync to Notion");
  }
}
