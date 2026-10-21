import Link from 'next/link';
import { ArrowRight, FileText, Receipt, Scale, type LucideIcon } from 'lucide-react';
import { activeProfiles, comingSoonProfiles, localizedComingSoon, localizedProfile } from '@/modules/profiles';
import { serverI18n } from '@/client/i18n/server';
import { buttonClass } from './components/ui';
import RecentScans from './components/RecentScans';
import styles from './home.module.css';

// Purely visual; a profile without an entry gets the generic document icon.
const PROFILE_ICONS: Record<string, LucideIcon> = { 'ngo-receipt': Receipt, 'factory-weight-slip': Scale };

export default async function Home() {
  const { lang, t } = await serverI18n();
  const profiles = activeProfiles().map(p => ({ id: p.id, ...localizedProfile(p, lang) }));
  const comingSoon = comingSoonProfiles.map(p => localizedComingSoon(p, lang));

  return (
    <main id="main" className="container page">
      <div className={styles.hero}>
        <h1 className={styles.title}>{t('home.title')}</h1>
        <p className={styles.subtitle}>{t('home.subtitle')}</p>
      </div>

      <ul className={styles.profiles}>
        {profiles.map(profile => {
          const Icon = PROFILE_ICONS[profile.id] ?? FileText;
          return (
            <li key={profile.id}>
              <Link href={`/scan/${profile.id}`} className={styles.profileCard}>
                <span className={styles.profileIcon} aria-hidden><Icon size={28} /></span>
                <span className={styles.profileText}>
                  <span className={styles.profileTitle}>{profile.title}</span>
                  <span className={styles.profileDescription}>{profile.description}</span>
                </span>
                <span className={buttonClass({ variant: 'primary', className: styles.profileCta })} aria-hidden>
                  {t('home.scan')}
                  <ArrowRight size={18} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <RecentScans profileNames={Object.fromEntries(profiles.map(p => [p.id, p.documentName]))} />

      <details className={styles.comingSoon}>
        <summary>{t('home.comingSoon', { count: comingSoon.length })}</summary>
        <ul className={styles.chips}>
          {comingSoon.map(item => <li key={item.title} title={item.description}>{item.title}</li>)}
        </ul>
      </details>

      <p className={styles.footer}>{t('home.footer')}</p>
    </main>
  );
}
