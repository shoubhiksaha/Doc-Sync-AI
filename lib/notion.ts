import { Client } from '@notionhq/client';
import { BlockObjectRequest, CreatePageParameters } from '@notionhq/client/build/src/api-endpoints';
import { uploadToNotion } from 'notion-multipart-uploader';
import { NgoReceiptData, FactoryWeightSlipData } from "./schemas";

export async function syncToNotion(
  data: NgoReceiptData | FactoryWeightSlipData,
  profileId: string,
  customNotionKey?: string | null,
  customDbId?: string | null,
  archiveBuffer?: Buffer | null,
  noteText?: string | null,
  audioBuffer?: Buffer | null
) {
  const apiKey = customNotionKey || process.env.NOTION_API_KEY;
  const databaseId = customDbId || process.env.NOTION_DATABASE_ID;

  if (!apiKey || !databaseId) {
    console.warn("Notion keys missing. Skipping Notion sync.");
    return { success: true, dummy: true, url: null };
  }

  const notion = new Client({ auth: apiKey });

  try {
    type NotionProperties = NonNullable<CreatePageParameters['properties']>;
    const properties: NotionProperties = {
      "Date": { date: { start: data.date as string } },
      "Scanned At": { date: { start: new Date().toISOString() } }
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

    if (noteText) {
      properties["Notes"] = { rich_text: [{ text: { content: noteText } }] };
    }

    let notionFileId: string | null = null;
    let notionAudioId: string | null = null;
    
    // Upload image
    if (archiveBuffer) {
      try {
        notionFileId = await uploadToNotion(apiKey, archiveBuffer, 'image/webp', `${profileId}_${Date.now()}.webp`);
      } catch (e) { console.error('Notion image upload err', e); }
    }

    // Upload audio
    if (audioBuffer) {
      try {
        notionAudioId = await uploadToNotion(apiKey, audioBuffer, 'audio/webm', `voicenote_${Date.now()}.webm`);
      } catch (e) { console.error('Notion audio upload err', e); }
    }

    const children: BlockObjectRequest[] = [];
    
    // Header
    children.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: '📄 Document Details' } }],
        color: 'blue_background'
      }
    });

    // Notes Section
    if (noteText || notionAudioId) {
      children.push({
        object: 'block',
        type: 'callout',
        callout: {
          rich_text: [{ type: 'text', text: { content: noteText || 'Voice note attached' } }],
          icon: { type: 'emoji', emoji: '📝' },
          color: 'gray_background',
          children: notionAudioId ? [
            {
              object: 'block',
              type: 'audio',
              audio: { type: 'file_upload', file_upload: { id: notionAudioId } }
            } as any
          ] : undefined
        }
      });
    }

    // Raw Data Code Block
    children.push({
      object: 'block',
      type: 'heading_3',
      heading_3: { rich_text: [{ type: 'text', text: { content: 'Raw Extracted Data' } }] }
    });
    children.push({
      object: 'block',
      type: 'code',
      code: {
        rich_text: [{ type: 'text', text: { content: JSON.stringify(data, null, 2) } }],
        language: 'json',
      },
    });

    // Original Image
    if (notionFileId) {
      children.push({
        object: 'block',
        type: 'heading_3',
        heading_3: { rich_text: [{ type: 'text', text: { content: 'Original Scan' } }] }
      });
      children.push({
        object: 'block',
        type: 'image',
        image: { type: 'file_upload', file_upload: { id: notionFileId } }
      } as BlockObjectRequest);
    }

    const response = await notion.pages.create({
      parent: { database_id: databaseId },
      properties,
      children,
    });

    return { success: true, url: ('url' in response) ? response.url : null };
  } catch (error) {
    console.error("Notion sync error:", error);
    throw new Error("Failed to sync to Notion");
  }
}

