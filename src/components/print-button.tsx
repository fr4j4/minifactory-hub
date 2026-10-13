'use client';
import { useT } from '@/i18n/client';
export function PrintButton() {
  const t = useT(); return <button className="btn-primary" onClick={() => window.print()}>{t('common.print')}</button>; }
