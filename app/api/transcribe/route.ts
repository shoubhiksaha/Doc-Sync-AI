import { NextRequest, NextResponse } from 'next/server';
export const maxDuration = 60;
import { transcribeAudio } from '@/lib/openai';
import { loadSettings } from '@/lib/settings-loader';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }
    
    if (audioFile.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Audio file too large (max 10MB)' }, { status: 413 });
    }
    if (!audioFile.type.startsWith('audio/') && !audioFile.type.startsWith('video/')) {
      return NextResponse.json({ error: 'Invalid file type. Only audio files are allowed.' }, { status: 400 });
    }
    
    const { openaiKey } = await loadSettings(req);
    const resolvedKey = req.headers.get('x-openai-key') || openaiKey;

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    
    // Call the whisper transcription
    const text = await transcribeAudio(audioBuffer, 'voicenote.webm', resolvedKey);
    
    if (text) {
      return NextResponse.json({ text });
    } else {
      return NextResponse.json({ error: 'Transcription failed (Check your API Keys)' }, { status: 500 });
    }
  } catch (error) {
    console.error('Transcription route error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
