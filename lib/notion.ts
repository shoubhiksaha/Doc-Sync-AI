import { Client } from '@notionhq/client';
import { NgoReceiptData, FactoryWeightSlipData } from "./schemas";

export async function syncToNotion(
  data: NgoReceiptData | FactoryWeightSlipData,
  profileId: string,
  customNotionKey?: string | null,
  customDbId?: string | null,
  notionFileId?: string | null // file_upload ID from notion-multipart-uploader
) {
  const apiKey = customNotionKey || process.env.NOTION_API_KEY;
  const databaseId = customDbId || process.env.NOTION_DATABASE_ID;

  if (!apiKey || !databaseId) {
    console.warn("Notion keys missing. Skipping Notion sync.");
    return { success: true, dummy: true };
  }

  const notion = new Client({ auth: apiKey });

  try {
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

    // Build page children: image block and data payload block
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children: any[] = [];
    if (notionFileId) {
      children.push({
        object: 'block',
        type: 'image',
        image: {
          type: 'file_upload',
          file_upload: { id: notionFileId },
        },
      });
    }

    // Add confirmed text from the review
    children.push({
      object: 'block',
      type: 'code',
      code: {
        language: 'json',
        rich_text: [{
          type: 'text',
          text: { content: JSON.stringify(data, null, 2) }
        }]
      }
    });

    const response = await notion.pages.create({
      parent: { database_id: databaseId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      properties: properties as any,
      ...(children.length > 0 && { children }),
    });

    // Extract the URL using any to bypass strict PartialPageObjectResponse typing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageUrl = (response as any).url;
    
    return { success: true, id: response.id, url: pageUrl };
  } catch (error) {
    console.error("Notion sync error:", error);
    throw new Error("Failed to sync to Notion");
  }
}
