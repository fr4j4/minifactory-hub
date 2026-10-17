'use client';
import { useT } from '@/i18n/client';
import { Icon } from '@/components/shell';
export function PrintButton() {
  const t = useT(); return <button className="btn-primary" onClick={() => window.print()}><Icon name="printer" className="h-4 w-4" />{t('common.print')}</button>; }
