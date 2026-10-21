import { notFound } from 'next/navigation';
import { getProfile } from '@/modules/profiles';
import ScanClient from './ScanClient';

export default async function ScanPage({ params }: { params: Promise<{ profile: string }> }) {
  const { profile: profileId } = await params;
  const profile = getProfile(profileId);
  if (!profile) notFound();

  return (
    <ScanClient
      profileId={profile.id}
      documentName={profile.documentName}
      sheetTitle={profile.sheetTitle}
      sampleDocument={profile.sampleDocument}
    />
  );
}
