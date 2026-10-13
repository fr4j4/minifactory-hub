import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { getT } from '@/i18n/server';

/**
 * Exporta un perfil del sitio como preajuste de usuario de Bambu Studio / OrcaSlicer: hereda del perfil de
 * fábrica y lleva solo tus cambios. Se importa en el programa con Archivo → Importar → Importar configuraciones.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const u = await getSession(); if (!u || !can(u, 'laminador', 'V')) return new Response(t('common.unauthorized'), { status: 401 });
  const { id } = await params; const db = await getDb(); const [p] = await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.id, id));
  if (!p || p.deletedAt) return new Response(t('common.doesNotExist'), { status: 404 });
  const idKey = p.type === 'machine' ? 'printer_settings_id' : p.type === 'process' ? 'print_settings_id' : 'filament_settings_id';
  const body: Record<string, unknown> = { type: p.type, name: p.name, inherits: p.baseName, from: 'User', instantiation: 'true', [idKey]: p.type === 'filament' ? [p.name] : p.name, version: '1.0.0.0', ...(p.changes ?? {}) };
  const file = `${p.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\- ]+/g, '').trim() || 'perfil'}.json`;
  return new Response(JSON.stringify(body, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${file}"`, 'Cache-Control': 'no-store' } });
}
