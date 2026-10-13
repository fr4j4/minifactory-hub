import { pagePerm } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { QrScanner } from '@/components/inventory-bits';
import { getT } from '@/i18n/server';
export async function generateMetadata() { return { title: (await getT())('meta.scanQr') }; }
export default async function ScanPage() {
  const t = await getT(); await pagePerm('inventario', 'V'); return (<><PageHeader back={{ href: '/inventario', label: t('nav.inventory') }} title={t('inventory.scanQr')} subtitle={t('inventory.pointTheCameraAtThe')} /><QrScanner /></>); }
