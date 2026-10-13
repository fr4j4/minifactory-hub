import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { requireUser } from '@/lib/auth';
import { getDb, s } from '@/db';
import { can, ROLE_LABEL, type Module } from '@/lib/perm';
import { AppShell, type NavItem } from '@/components/shell';
import { expireQuotes } from '@/lib/services/quotes';
import { ensureWorker } from '@/lib/slicer/queue';
import { ensureBambu } from '@/lib/bambu/manager';

export const dynamic = 'force-dynamic';

const NAV: Array<NavItem & { mod: Module }> = [
  { href: '/', label: 'Inicio', icon: 'home', group: 'main', mod: 'pedidos' },
  { href: '/pedidos', label: 'Pedidos', icon: 'orders', group: 'main', mod: 'pedidos' },
  { href: '/presupuestos', label: 'Presupuestos', icon: 'quote', group: 'main', mod: 'presupuestos' },
  { href: '/calculadora', label: 'Calculadora', icon: 'calc', group: 'more', mod: 'presupuestos' },
  { href: '/clientes', label: 'Clientes', icon: 'users', group: 'more', mod: 'clientes' },
  { href: '/archivos', label: 'Archivos 3D', icon: 'cube', group: 'main', mod: 'archivos' },
  { href: '/laminador', label: 'Laminador', icon: 'slice', group: 'more', mod: 'laminador' },
  { href: '/catalogo', label: 'Catálogo', icon: 'bag', group: 'more', mod: 'catalogo' },
  { href: '/ventas', label: 'Ventas', icon: 'cart', group: 'more', mod: 'ventas' },
  { href: '/inventario', label: 'Inventario', icon: 'box', group: 'main', mod: 'inventario' },
  { href: '/maquinas', label: 'Máquinas', icon: 'printer', group: 'more', mod: 'maquinas' },
  { href: '/cola', label: 'Cola', icon: 'queue', group: 'main', mod: 'cola' },
  { href: '/galeria', label: 'Galería', icon: 'image', group: 'more', mod: 'galeria' },
  { href: '/reportes', label: 'Reportes', icon: 'chart', group: 'more', mod: 'reportes' },
  { href: '/configuracion', label: 'Configuración', icon: 'cog', group: 'more', mod: 'config' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const db = await getDb();
  ensureWorker(); ensureBambu();
  await expireQuotes().catch(() => {});
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.notifications).where(and(eq(s.notifications.read, false), or(isNull(s.notifications.userId), eq(s.notifications.userId, user.id))));
  const nav = NAV.filter((n) => can(user, n.mod, 'V'));
  return <AppShell nav={nav} user={{ name: user.name, role: ROLE_LABEL[user.role] }} unread={Number(n)}>{children}</AppShell>;
}
