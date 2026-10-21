'use client';
import { useI18n } from '@/client/i18n/I18nProvider';
import type { DuplicateInfo } from '@/client/scan-flow';
import { Button, Dialog } from '@/app/components/ui';
import styles from './scan.module.css';

interface DuplicateDialogProps {
  info: DuplicateInfo | null;
  allowReplace: boolean;
  onCancel: () => void;
  onAction: (action: 'keep_both' | 'replace') => void;
}

/** The safe choice (don't save) comes first; replacing rows is the visually distinct, destructive one. */
export default function DuplicateDialog({ info, allowReplace, onCancel, onAction }: DuplicateDialogProps) {
  const { t } = useI18n();
  return (
    <Dialog
      open={Boolean(info)}
      onClose={onCancel}
      title={t('dup.title')}
      closeLabel={t('common.close')}
      description={info && t('dup.body', { label: info.label, value: info.value, count: info.count })}
      actions={
        <>
          {allowReplace && info && (
            <Button variant="danger" wrap onClick={() => onAction('replace')}>
              {info.count > 1 ? t('dup.replaceMany', { count: info.count }) : t('dup.replace')}
            </Button>
          )}
          <Button wrap onClick={() => onAction('keep_both')}>{t('dup.keepBoth')}</Button>
          <Button variant="primary" wrap onClick={onCancel}>{t('dup.cancel')}</Button>
        </>
      }
    >
      {!allowReplace && <p className={`${styles.muted} ${styles.small}`}>{t('dup.demoNote')}</p>}
    </Dialog>
  );
}
