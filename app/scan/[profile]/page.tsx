import { notFound } from 'next/navigation';
import { getProfile, localizedProfile } from '@/modules/profiles';
import { serverI18n } from '@/client/i18n/server';
import ScanClient from './ScanClient';

export default async function ScanPage({
  params,
  searchParams,
}: {
  params: Promise<{ profile: string }>;
  searchParams: Promise<{ resume?: string | string[] }>;
}) {
  const [{ profile: profileId }, query] = await Promise.all([params, searchParams]);
  const profile = getProfile(profileId);
  if (!profile) notFound();

  const { lang } = await serverI18n();
  const resume = typeof query.resume === 'string' ? query.resume : null;

  return (
    <ScanClient
      profileId={profile.id}
      documentName={localizedProfile(profile, lang).documentName}
      sampleHref={profile.sampleDocument?.href ?? null}
      resumeId={resume}
    />
  );
}
