'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signIn, signOut, useSession } from 'next-auth/react';
import { Info, Languages, LogOut, Settings } from 'lucide-react';
import { useI18n } from '@/client/i18n/I18nProvider';
import { clearScans } from '@/client/scan-store';
import { Button, Dialog } from './ui';
import { clearOfflineCaches } from './ServiceWorkerRegister';
import styles from './Navbar.module.css';

/** Clears everything this device holds for the session, then signs out (or ends the demo). */
async function signOutEverywhere(hasSession: boolean) {
  await fetch('/api/auth/guest', { method: 'DELETE' }).catch(() => undefined);
  await clearScans();
  await clearOfflineCaches();
  try {
    Object.keys(localStorage).filter(k => k.startsWith('docsync_')).forEach(k => localStorage.removeItem(k));
  } catch {
    // storage unavailable: nothing to clear
  }
  if (hasSession) await signOut({ callbackUrl: '/login' });
  else window.location.href = '/login';
}

export default function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const { t, lang, setLang } = useI18n();
  const [demoOpen, setDemoOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (pathname === '/login') return null;
  const isGuest = status === 'unauthenticated';
  const other = lang === 'en' ? 'hi' : 'en';

  return (
    <header className={styles.header}>
      <nav className={`container ${styles.nav}`} aria-label={t('nav.main')}>
        <Link href="/" className={styles.brand} aria-label={t('nav.home')}>
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG logo */}
          <img src="/icon.svg" alt="" width={28} height={28} />
          <span aria-hidden>DocSync AI</span>
        </Link>

        <div className={styles.actions}>
          {isGuest && (
            <button type="button" className={styles.demoChip} onClick={() => setDemoOpen(true)} aria-haspopup="dialog">
              <Info size={16} aria-hidden />
              {t('nav.demo')}
            </button>
          )}
          <button type="button" className={styles.navButton} onClick={() => setLang(other)} aria-label={t('nav.switchLanguageLabel')}>
            <Languages size={20} aria-hidden />
            <span lang={other}>{t('nav.switchLanguage')}</span>
          </button>
          <Link href="/settings" className={styles.navButton} aria-current={pathname === '/settings' ? 'page' : undefined}>
            <Settings size={20} aria-hidden />
            <span className={styles.collapsible}>{t('nav.settings')}</span>
          </Link>
          {session?.user?.image && (
            /* eslint-disable-next-line @next/next/no-img-element -- remote Google avatar, tiny */
            <img className={styles.avatar} src={session.user.image} alt={session.user.name || t('nav.account')} width={32} height={32} referrerPolicy="no-referrer" />
          )}
          <button
            type="button"
            className={styles.navButton}
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              await signOutEverywhere(Boolean(session));
            }}
          >
            <LogOut size={20} aria-hidden />
            <span className={styles.collapsible}>{t('nav.signOut')}</span>
          </button>
        </div>
      </nav>

      <Dialog
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        title={t('nav.demoTitle')}
        closeLabel={t('common.close')}
        description={t('nav.demoBody')}
        actions={
          <>
            <Button onClick={() => setDemoOpen(false)}>{t('common.close')}</Button>
            <Button variant="primary" wrap onClick={() => signIn('google', { callbackUrl: '/' })}>{t('nav.demoCta')}</Button>
          </>
        }
      />
    </header>
  );
}
