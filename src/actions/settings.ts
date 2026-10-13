'use server';
import { eq } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { hashPassword, requirePerm, requireUser, verifyPassword } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { getSettings, saveSettings, type AppSettings } from '@/lib/settings';
import { safe } from './common';

export async function saveSettingsAction(patch: Partial<AppSettings>) {
  return safe(async () => {
    const u = await requirePerm('config', 'E');
    const before = await getSettings(); const next = await saveSettings(patch);
    if (patch.rates) await audit('settings', null, 'tarifas', { before: before.rates, after: next.rates }, u.id);
    return true;
  }, ['/configuracion', '/']);
}

export async function saveUserAction(i: { id?: string; name: string; email: string; role: string; password?: string; active: boolean; permOverrides?: Record<string, string> }) {
  return safe(async () => {
    const u = await requirePerm('config', i.id ? 'E' : 'C'); const db = await getDb();
    if (!i.name.trim() || !i.email.trim()) throw new Error('Nombre y correo son obligatorios');
    if (!i.id && (!i.password || i.password.length < 8)) throw new Error('La contraseña debe tener al menos 8 caracteres');
    if (i.password && i.password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
    const v: Record<string, any> = { name: i.name.trim(), email: i.email.trim().toLowerCase(), role: i.role, active: i.active, permOverrides: i.permOverrides ?? {}, updatedAt: new Date() };
    if (i.password) v.passwordHash = await hashPassword(i.password);
    if (i.id) { if (i.id === u.id && (!i.active || i.role !== 'admin')) throw new Error('No puedes quitarte tu propio acceso de administrador'); await db.update(s.users).set(v).where(eq(s.users.id, i.id)); await audit('user', i.id, 'editar', { role: i.role, active: i.active }, u.id); return i.id; }
    const [r] = await db.insert(s.users).values({ workspaceId: WORKSPACE_ID, passwordHash: v.passwordHash, ...v } as any).returning({ id: s.users.id }); await audit('user', r.id, 'crear', { role: i.role }, u.id); return r.id;
  }, ['/configuracion']);
}

export async function saveProfileAction(i: { notifPrefs: Record<string, boolean>; currentPassword?: string; newPassword?: string }) {
  return safe(async () => {
    const u = await requireUser(); const db = await getDb(); const patch: Record<string, any> = { notifPrefs: i.notifPrefs, updatedAt: new Date() };
    if (i.newPassword) { const [me] = await db.select().from(s.users).where(eq(s.users.id, u.id)); if (!(await verifyPassword(me.passwordHash, i.currentPassword ?? ''))) throw new Error('La contraseña actual no coincide'); if (i.newPassword.length < 8) throw new Error('La nueva contraseña debe tener al menos 8 caracteres'); patch.passwordHash = await hashPassword(i.newPassword); }
    await db.update(s.users).set(patch).where(eq(s.users.id, u.id));
  }, ['/configuracion/perfil']);
}

export async function savePriceListAction(i: { id?: string; name: string; adjustPct: number }) {
  return safe(async () => { const u = await requirePerm('config', 'E'); const db = await getDb(); if (i.id) await db.update(s.priceLists).set({ name: i.name, adjustPct: i.adjustPct }).where(eq(s.priceLists.id, i.id)); else await db.insert(s.priceLists).values({ workspaceId: WORKSPACE_ID, name: i.name, adjustPct: i.adjustPct, createdBy: u.id }); }, ['/configuracion']);
}
export async function markNotificationsReadAction(ids?: string[]) {
  return safe(async () => { await requireUser(); const db = await getDb(); const { inArray } = await import('drizzle-orm'); if (ids?.length) await db.update(s.notifications).set({ read: true }).where(inArray(s.notifications.id, ids)); else await db.update(s.notifications).set({ read: true }).where(eq(s.notifications.read, false)); }, ['/notificaciones', '/']);
}
