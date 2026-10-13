import { pagePerm } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { QrScanner } from '@/components/inventory-bits';
export const metadata = { title: 'Escanear QR' };
export default async function ScanPage() { await pagePerm('inventario', 'V'); return (<><PageHeader back={{ href: '/inventario', label: 'Inventario' }} title="Escanear QR" subtitle="Apunta la cámara a la etiqueta para abrir la bobina, pesarla o asignarla a una máquina." /><QrScanner /></>); }
