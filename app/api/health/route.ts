import { NextResponse } from 'next/server';
import { appEnvironment, appVersion } from '@/core/env';
import { aiHealth } from '@/modules/ai';
import { extractionHealth } from '@/modules/extraction';
import { mediaHealth } from '@/modules/media';
import { notionHealth } from '@/modules/notion';
import { settingsHealth } from '@/modules/settings';
import { sheetsHealth } from '@/modules/sheets';
import { transcriptionHealth } from '@/modules/transcription';

export const dynamic = 'force-dynamic';

type ModuleHealth = { enabled: boolean; configured: boolean; circuit: 'closed' | 'open' };

/** Each probe is isolated: a module whose health check throws is reported as unhealthy, not a 500. */
function probe(fn: () => ModuleHealth): ModuleHealth & { error?: string } {
  try {
    return fn();
  } catch (err) {
    return { enabled: false, configured: false, circuit: 'open', error: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET() {
  const modules = {
    ai: probe(aiHealth),
    extraction: probe(extractionHealth),
    transcription: probe(transcriptionHealth),
    sheets: probe(sheetsHealth),
    notion: probe(notionHealth),
    media: probe(mediaHealth),
    settings: probe(settingsHealth),
  };
  const degraded = Object.values(modules).some(m => m.enabled && m.circuit === 'open') || !modules.settings.configured;

  return NextResponse.json(
    {
      status: degraded ? 'degraded' : 'ok',
      environment: appEnvironment(),
      version: appVersion(),
      checkedAt: new Date().toISOString(),
      modules,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
