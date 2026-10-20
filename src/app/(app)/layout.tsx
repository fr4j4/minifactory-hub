import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { getDb, s } from '@/db';
import { can, type Module } from '@/lib/perm';
import { getT } from '@/i18n/server';
import type { MessageKey } from '@/i18n/translate';
import { AppShell, type IconName, type NavItem } from '@/components/shell';
import { expireQuotes, followUpQuotes } from '@/lib/services/quotes';
import { ensureWorker } from '@/lib/slicer/queue';
import { ensureBambu } from '@/lib/bambu/manager';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/', label: 'nav.home', icon: 'home', group: 'main', mod: 'pedidos' },
  { href: '/pedidos', label: 'nav.orders', icon: 'orders', group: 'main', mod: 'pedidos' },
  { href: '/presupuestos', label: 'nav.quotes', icon: 'quote', group: 'main', mod: 'presupuestos' },
  { href: '/calculadora', label: 'nav.calculator', icon: 'calc', group: 'more', mod: 'presupuestos' },
  { href: '/clientes', label: 'nav.customers', icon: 'users', group: 'more', mod: 'clientes' },
  { href: '/archivos', label: 'nav.files', icon: 'cube', group: 'main', mod: 'archivos' },
  { href: '/laminador', label: 'nav.slicer', icon: 'slice', group: 'more', mod: 'laminador' },
  { href: '/catalogo', label: 'nav.catalog', icon: 'bag', group: 'more', mod: 'catalogo' },
  { href: '/ventas', label: 'nav.sales', icon: 'cart', group: 'more', mod: 'ventas' },
  { href: '/inventario', label: 'nav.inventory', icon: 'box', group: 'main', mod: 'inventario' },
  { href: '/filamentos', label: 'nav.filaments', icon: 'tag', group: 'more', mod: 'inventario' },
  { href: '/maquinas', label: 'nav.machines', icon: 'printer', group: 'more', mod: 'maquinas' },
  { href: '/cola', label: 'nav.queue', icon: 'queue', group: 'main', mod: 'cola' },
  { href: '/galeria', label: 'nav.gallery', icon: 'image', group: 'more', mod: 'galeria' },
  { href: '/reportes', label: 'nav.reports', icon: 'chart', group: 'more', mod: 'reportes' },
  { href: '/configuracion', label: 'nav.settings', icon: 'cog', group: 'more', mod: 'config' },
] as const satisfies ReadonlyArray<{ href: string; label: MessageKey; icon: IconName; group: 'main' | 'more'; mod: Module }>;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const t = await getT();
  const db = await getDb();
  ensureWorker(); ensureBambu();
  (await import('@/lib/jobs')).ensureJobWorker();
  await expireQuotes().catch(() => {});
  await followUpQuotes().catch(() => {});
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.notifications).where(and(eq(s.notifications.read, false), or(isNull(s.notifications.userId), eq(s.notifications.userId, user.id))));
  const nav: NavItem[] = NAV.filter((n) => can(user, n.mod, 'V')).map((n) => ({ href: n.href, label: t(n.label), icon: n.icon, group: n.group }));
  return <AppShell nav={nav} user={{ name: user.name, role: t(`roles.${user.role}`) }} unread={Number(n)} shopPalette={(await getSettings()).shop.palette}>{process.env.MF_TEST_DEPLOYMENT === '1' && <div role="status" className="mb-4 rounded border border-amber-400 bg-amber-100 p-3 text-sm text-amber-950">PRUEBAS · Biblioteca multifuente · Datos independientes · Impresoras desactivadas</div>}{children}</AppShell>;
}
