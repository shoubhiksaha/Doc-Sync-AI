import { NextRequest, NextResponse } from 'next/server';
import { syncToNotion } from '@/lib/notion';
import { syncToGoogleSheets } from '@/lib/sheets';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { data, profileId } = body;

    if (!data || !profileId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log(`Syncing data for ${profileId}...`);

    const notionKey = req.headers.get('x-notion-key');
    const notionDbId = req.headers.get('x-notion-db-id');

    // Run both sync operations concurrently
    const [notionResult, sheetsResult] = await Promise.allSettled([
      syncToNotion(data, profileId, notionKey, notionDbId),
      syncToGoogleSheets(data, profileId)
    ]);

    const errors = [];
    if (notionResult.status === 'rejected') errors.push('Notion Sync Failed');
    if (sheetsResult.status === 'rejected') errors.push('Google Sheets Sync Failed');

    if (errors.length > 0) {
      // In a real app, you might want to log this to Sentry/Crashlytics
      console.error('Sync errors:', errors);
      return NextResponse.json({ success: false, errors }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Successfully synced to all destinations' });
  } catch (error: unknown) {
    console.error('API Sync Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to sync data';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
