import { NextResponse } from 'next/server';
import { and, ilike, isNull, or, eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';

export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json([], { status: 401 });
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json([]);
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const db = await getDb();
  const out: Array<{ kind: string; label: string; sub?: string; href: string }> = [];
  if (can(user, 'clientes')) for (const c of await db.select().from(s.customers).where(and(isNull(s.customers.deletedAt), or(ilike(s.customers.name, like), ilike(s.customers.phone, like), ilike(s.customers.email, like)))).limit(5)) out.push({ kind: 'Cliente', label: c.name, sub: c.phone ?? '', href: `/clientes/${c.id}` });
  if (can(user, 'pedidos')) for (const o of await db.select().from(s.orders).where(and(isNull(s.orders.deletedAt), or(ilike(s.orders.number, like), ilike(s.orders.customerName, like), ilike(s.orders.title, like)))).limit(5)) out.push({ kind: 'Pedido', label: `${o.number} · ${o.title ?? o.customerName ?? ''}`, sub: o.status, href: `/pedidos/${o.id}` });
  if (can(user, 'presupuestos')) for (const o of await db.select().from(s.quotes).where(and(isNull(s.quotes.deletedAt), or(ilike(s.quotes.number, like), ilike(s.quotes.customerName, like), ilike(s.quotes.title, like)))).limit(5)) out.push({ kind: 'Presupuesto', label: `${o.number} v${o.version} · ${o.title ?? o.customerName ?? ''}`, sub: o.status, href: `/presupuestos/${o.id}` });
  if (can(user, 'catalogo')) for (const v of await db.select({ v: s.productVariants, p: s.products }).from(s.productVariants).innerJoin(s.products, eq(s.products.id, s.productVariants.productId)).where(and(isNull(s.productVariants.deletedAt), or(ilike(s.productVariants.sku, like), ilike(s.products.name, like)))).limit(5)) out.push({ kind: 'Producto', label: `${v.p.name} ${Object.values(v.v.attrs ?? {}).join(' ')}`.trim(), sub: v.v.sku, href: `/catalogo/${v.p.id}` });
  if (can(user, 'archivos')) for (const f of await db.select().from(s.modelFiles).where(and(isNull(s.modelFiles.deletedAt), ilike(s.modelFiles.name, like))).limit(5)) out.push({ kind: 'Archivo 3D', label: f.name, sub: f.format ?? '', href: `/archivos/${f.id}` });
  if (can(user, 'inventario')) for (const b of await db.select({ b: s.spools, m: s.materials }).from(s.spools).innerJoin(s.materials, eq(s.materials.id, s.spools.materialId)).where(and(isNull(s.spools.deletedAt), or(ilike(s.spools.code, like), ilike(s.materials.colorName, like), ilike(s.materials.type, like)))).limit(5)) out.push({ kind: 'Bobina', label: `${b.b.code} · ${b.m.type} ${b.m.colorName}`, sub: `${Math.round(b.b.remainingG)} g`, href: `/inventario/bobinas/${b.b.id}` });
  return NextResponse.json(out);
}
