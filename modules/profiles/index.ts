/**
 * Profiles module — the registry of document "utility apps".
 * Pure data and functions with no server dependencies, so it is safe to import from client
 * components. To add a document type, create a profile file and add it to PROFILES.
 */
import { factoryWeightSlip } from './factory-weight-slip';
import { ngoReceipt } from './ngo-receipt';
import type { ComingSoonProfile, DocumentProfile, Lang, LocalizedProfileText, RecordField } from './types';

export type {
  ComingSoonProfile, DocumentProfile, FieldCategory, Lang, LocalizedProfileText, NotionPropertySpec, NotionPropertyType, ProfileGroup, RecordField,
} from './types';
export { PROFILE_GROUPS } from './types';
export { comingSoonProfiles } from './catalog';
export { fieldValue, findField } from './fields';

const PROFILES: readonly DocumentProfile[] = [ngoReceipt, factoryWeightSlip];

export function activeProfiles(): readonly DocumentProfile[] {
  return PROFILES;
}

export function getProfile(id: string | null | undefined): DocumentProfile | undefined {
  return PROFILES.find(p => p.id === id);
}

/** Title, document name and description in `lang`, falling back to English. */
export function localizedProfile(profile: DocumentProfile, lang: Lang): LocalizedProfileText {
  const english = { title: profile.title, documentName: profile.documentName, description: profile.description };
  return lang === 'en' ? english : { ...english, ...profile.translations?.[lang] };
}

export function localizedComingSoon(item: ComingSoonProfile, lang: Lang): { title: string; description: string } {
  return lang === 'hi' && item.hi ? item.hi : { title: item.title, description: item.description };
}

/** Runs the profile's derive() and returns the input unchanged if it throws. */
export function deriveFields(profile: DocumentProfile, fields: RecordField[]): RecordField[] {
  if (!profile.derive) return fields;
  try {
    return profile.derive(fields);
  } catch (err) {
    console.error(`[profiles:${profile.id}] derive failed:`, err);
    return fields;
  }
}

/** Runs the profile's validate(); a buggy validator becomes a warning, never an error. */
export function validateFields(profile: DocumentProfile, fields: RecordField[]): string[] {
  if (!profile.validate) return [];
  try {
    return profile.validate(fields);
  } catch (err) {
    console.error(`[profiles:${profile.id}] validate failed:`, err);
    return ['Automatic checks for this document type are unavailable right now. Please review the values manually.'];
  }
}

/** Every Notion property any profile writes — used when creating a database during Notion OAuth. */
export function notionPropertyUnion(): { name: string; type: string }[] {
  const seen = new Map<string, string>();
  for (const profile of PROFILES) {
    for (const prop of profile.notion.properties) seen.set(prop.name, prop.type);
  }
  return [...seen].map(([name, type]) => ({ name, type }));
}
