import { Client } from '@notionhq/client';
import { BlockObjectRequest, CreatePageBodyParameters } from '@notionhq/client/build/src/api-endpoints';
import { uploadToNotion } from 'notion-multipart-uploader';
import { NgoReceiptData, FactoryWeightSlipData } from "./schemas";

export async function syncToNotion(
  data: NgoReceiptData | FactoryWeightSlipData,
  profileId: string,
  customNotionKey?: string | null,
  customDbId?: string | null,
  archiveBuffer?: Buffer | null
) {
  const apiKey = customNotionKey || process.env.NOTION_API_KEY;
  const databaseId = customDbId || process.env.NOTION_DATABASE_ID;

  if (!apiKey || !databaseId) {
    console.warn("Notion keys missing. Skipping Notion sync.");
    return { success: true, dummy: true, url: null };
  }

  const notion = new Client({ auth: apiKey });

  try {
    type NotionProperties = NonNullable<CreatePageBodyParameters['properties']>;
    const properties: NotionProperties = {
      "Date": { date: { start: data.date as string } },
    };

    if (profileId === 'ngo-receipt') {
      const ngoData = data as NgoReceiptData;
      properties["Name"] = { title: [{ text: { content: ngoData.donorName as string } }] };
      properties["Amount"] = { number: Number(ngoData.amount) || 0 };
      properties["PAN"] = { rich_text: [{ text: { content: (ngoData.panNumber as string) || '' } }] };
      properties["Profile"] = { select: { name: 'NGO Receipt' } };
    } else if (profileId === 'factory-weight-slip') {
      const factoryData = data as FactoryWeightSlipData;
      properties["Name"] = { title: [{ text: { content: factoryData.vehicleNumber as string } }] };
      properties["Gross Weight"] = { number: Number(factoryData.grossWeight) || 0 };
      properties["Tare Weight"] = { number: Number(factoryData.tareWeight) || 0 };
      properties["Net Weight"] = { number: (Number(factoryData.grossWeight) || 0) - (Number(factoryData.tareWeight) || 0) };
      properties["Profile"] = { select: { name: 'Factory Weight Slip' } };
    } else {
      throw new Error('Unsupported profile ID');
    }

    let notionFileId: string | null = null;
    
    // Upload image to Notion's S3 first to get a file ID
    if (archiveBuffer) {
      try {
        notionFileId = await uploadToNotion(
          apiKey,
          archiveBuffer,
          'image/webp',
          `${profileId}_${Date.now()}.webp`
        );
      } catch (uploadError) {
        console.error('Failed to upload image to Notion S3:', uploadError);
      }
    }

    const children: BlockObjectRequest[] = [];
    
    if (notionFileId) {
      children.push({
        object: 'block',
        type: 'image',
        image: {
          type: 'file_upload',
          file_upload: { id: notionFileId }
        }
      } as BlockObjectRequest);
    }

    // Add confirmed text from the review
    children.push({
      object: 'block',
      type: 'code',
      code: {
        rich_text: [{ type: 'text', text: { content: JSON.stringify(data, null, 2) } }],
        language: 'json',
      },
    });

    const response = await notion.pages.create({
      parent: { database_id: databaseId },
      properties,
      children,
    });

    return { 
      success: true, 
      url: ('url' in response) ? response.url : null 
    };
  } catch (error) {
    console.error("Notion sync error:", error);
    throw new Error("Failed to sync to Notion");
  }
}
