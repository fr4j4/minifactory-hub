'use server';
import { eq } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { hashPassword, requirePerm, requireUser, verifyPassword } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { getSettings, saveSettings, type AppSettings } from '@/lib/settings';
import { safe } from './common';
import { getT } from '@/i18n/server';
import { LocalizedError } from '@/i18n/errors';

export async function saveSettingsAction(patch: Partial<AppSettings>) {
  return safe(async () => {
    const u = await requirePerm('config', 'E');
    const { ai: _ignored, ...safePatch } = patch as Partial<AppSettings>; // la IA se guarda solo con saveAiSettingsAction
    const before = await getSettings(); const next = await saveSettings(safePatch);
    if (patch.rates) await audit('settings', null, 'tarifas', { before: before.rates, after: next.rates }, u.id);
    return true;
  }, ['/configuracion', '/']);
}

export async function saveUserAction(i: { id?: string; name: string; email: string; role: string; password?: string; active: boolean; permOverrides?: Record<string, string> }) {
  const t = await getT();
  return safe(async () => {
    const u = await requirePerm('config', i.id ? 'E' : 'C'); const db = await getDb();
    // roles y permisos los gestiona solo un administrador: con config E un no-admin podría hacerse admin a sí mismo
    if (u.role !== 'admin') throw new Error(t('auth.noPermission', { mod: 'config', action: i.id ? 'E' : 'C' }));
    if (!(['admin', 'operador', 'ventas'] as string[]).includes(i.role)) throw new LocalizedError('edit.invalid');
    if (!i.name.trim() || !i.email.trim()) throw new Error(t('settings.nameAndEmailAreRequired'));
    if (!i.id && (!i.password || i.password.length < 8)) throw new Error(t('settings.thePasswordMustBeAt'));
    if (i.password && i.password.length < 8) throw new Error(t('settings.thePasswordMustBeAt'));
    const v: Record<string, any> = { name: i.name.trim(), email: i.email.trim().toLowerCase(), role: i.role, active: i.active, permOverrides: i.permOverrides ?? {}, updatedAt: new Date() };
    if (i.password) v.passwordHash = await hashPassword(i.password);
    if (i.id) { if (i.id === u.id && (!i.active || i.role !== 'admin')) throw new Error(t('settings.youCannotRemoveYourOwn')); await db.update(s.users).set(v).where(eq(s.users.id, i.id)); await audit('user', i.id, 'editar', { role: i.role, active: i.active }, u.id); return i.id; }
    const [r] = await db.insert(s.users).values({ workspaceId: WORKSPACE_ID, passwordHash: v.passwordHash, ...v } as any).returning({ id: s.users.id }); await audit('user', r.id, 'crear', { role: i.role }, u.id); return r.id;
  }, ['/configuracion']);
}

export async function saveProfileAction(i: { notifPrefs: Record<string, boolean>; currentPassword?: string; newPassword?: string }) {
  const t = await getT();
  return safe(async () => {
    const u = await requireUser(); const db = await getDb(); const patch: Record<string, any> = { notifPrefs: i.notifPrefs, updatedAt: new Date() };
    if (i.newPassword) { const [me] = await db.select().from(s.users).where(eq(s.users.id, u.id)); if (!(await verifyPassword(me.passwordHash, i.currentPassword ?? ''))) throw new Error(t('settings.theCurrentPasswordDoesNot')); if (i.newPassword.length < 8) throw new Error(t('settings.theNewPasswordMustBe')); patch.passwordHash = await hashPassword(i.newPassword); }
    await db.update(s.users).set(patch).where(eq(s.users.id, u.id));
  }, ['/configuracion/perfil']);
}

export async function savePriceListAction(i: { id?: string; name: string; adjustPct: number }) {
  return safe(async () => {
    const u = await requirePerm('config', 'E'); const db = await getDb();
    if (!i.name?.trim()) throw new LocalizedError('edit.required');
    if (!Number.isFinite(i.adjustPct) || i.adjustPct <= -100) throw new LocalizedError('edit.invalid'); // -100 % o menos deja precios en cero o negativos
    if (i.id) await db.update(s.priceLists).set({ name: i.name.trim(), adjustPct: i.adjustPct }).where(eq(s.priceLists.id, i.id)); else await db.insert(s.priceLists).values({ workspaceId: WORKSPACE_ID, name: i.name.trim(), adjustPct: i.adjustPct, createdBy: u.id });
  }, ['/configuracion']);
}
export async function markNotificationsReadAction(ids?: string[]) {
  return safe(async () => { await requireUser(); const db = await getDb(); const { inArray } = await import('drizzle-orm'); if (ids?.length) await db.update(s.notifications).set({ read: true }).where(inArray(s.notifications.id, ids)); else await db.update(s.notifications).set({ read: true }).where(eq(s.notifications.read, false)); }, ['/notificaciones', '/']);
}

export async function saveSupplierAction(i: { id?: string; name: string; kind: string; country: string; city?: string; url?: string; notes?: string; verified?: boolean; recoversVat?: boolean; active: boolean }) {
  const t = await getT();
  return safe(async () => {
    const u = await requirePerm('config', 'E'); const db = await getDb();
    if (!i.name.trim()) throw new Error(t('settings.supplierNeedsName'));
    const url = i.url?.trim() ? (/^https?:\/\//i.test(i.url.trim()) ? i.url.trim() : `https://${i.url.trim()}`) : null;
    const v = { name: i.name.trim(), kind: i.kind, country: i.country.trim().toUpperCase().slice(0, 6) || 'CL', city: i.city?.trim() || null, url, notes: i.notes?.trim() || null, verified: !!i.verified, recoversVat: !!i.recoversVat, active: i.active, updatedAt: new Date() };
    if (i.id) {
      // quién y cuándo lo verificó: solo cambia cuando pasa de «sin verificar» a «verificado» (o al revés)
      const [cur] = await db.select({ verified: s.suppliers.verified }).from(s.suppliers).where(eq(s.suppliers.id, i.id));
      const stamp = v.verified && !cur?.verified ? { verifiedAt: new Date(), verifiedBy: u.id } : !v.verified ? { verifiedAt: null, verifiedBy: null } : {};
      await db.update(s.suppliers).set({ ...v, ...stamp }).where(eq(s.suppliers.id, i.id)); await audit('supplier', i.id, 'editar', { name: v.name }, u.id); return i.id; }
    const [r] = await db.insert(s.suppliers).values({ workspaceId: WORKSPACE_ID, createdBy: u.id, ...v, ...(v.verified ? { verifiedAt: new Date(), verifiedBy: u.id } : {}) }).returning({ id: s.suppliers.id });
    await audit('supplier', r.id, 'crear', { name: v.name }, u.id); return r.id;
  }, ['/configuracion', '/inventario']);
}

/** Guarda la plantilla del documento de presupuesto (modelo JSON tipado, normalizado en el servidor). */
export async function saveDocTemplateAction(raw: unknown) {
  return safe(async () => {
    const u = await requirePerm('config', 'E');
    const { normalizeTemplate } = await import('@/lib/documents');
    const tpl = normalizeTemplate(raw);
    await saveSettings({ documents: { quote: tpl } });
    await audit('settings', 'documents', 'editar', { sections: tpl.sections.filter((x) => x.visible).map((x) => x.id) }, u.id);
    return tpl;
  }, ['/configuracion']);
}

export async function setCalcLevelAction(level: 'basico' | 'avanzado') {
  return safe(async () => {
    const u = await requireUser(); const db = await getDb();
    await db.update(s.users).set({ calcLevel: level === 'avanzado' ? 'avanzado' : 'basico', updatedAt: new Date() }).where(eq(s.users.id, u.id));
  }, ['/calculadora']);
}
