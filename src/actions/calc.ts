'use server';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { requirePerm } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { getSettings, saveSettings } from '@/lib/settings';
import { calibrationData } from '@/lib/services/calibration';
import { safe } from './common';
import { getT } from '@/i18n/server';

/** Datos mínimos del asistente: costo de compra y potencia de las máquinas, costo por kg de los materiales. */
export async function saveCalcBasicsAction(i: { machines: Array<{ id: string; purchaseValue: number; residualValue: number; lifeHours: number; watts: number }>; materials: Array<{ id: string; costPerKg: number }> }) {
  const t = await getT();
  return safe(async () => {
    const u = await requirePerm('config', 'E'); const db = await getDb();
    for (const m of i.machines) {
      if (m.purchaseValue < 0 || m.watts < 0 || m.lifeHours <= 0) throw new Error(t('calc.err.badMachine'));
      await db.update(s.machines).set({ purchaseValue: Math.round(m.purchaseValue), residualValue: Math.round(m.residualValue), lifeHours: Math.round(m.lifeHours), watts: Math.round(m.watts), updatedAt: new Date() }).where(eq(s.machines.id, m.id));
    }
    for (const m of i.materials) {
      if (m.costPerKg < 0) throw new Error(t('calc.err.badMaterial'));
      await db.update(s.materials).set({ costPerKg: Math.round(m.costPerKg), updatedAt: new Date() }).where(eq(s.materials.id, m.id));
    }
    await audit('settings', null, 'asistente_calculadora', { machines: i.machines.length, materials: i.materials.length }, u.id);
    return true;
  }, ['/configuracion', '/maquinas', '/inventario', '/calculadora']);
}

export async function calibrationAction() { return safe(async () => { await requirePerm('config', 'V'); return calibrationData(); }); }

export async function setMachineTimeFactorAction(machineId: string, factor: number) {
  const t = await getT();
  return safe(async () => {
    const u = await requirePerm('config', 'E'); const db = await getDb();
    if (!(factor >= 0.5 && factor <= 3)) throw new Error(t('calc.err.badFactor'));
    await db.update(s.machines).set({ timeFactor: factor, updatedAt: new Date() }).where(eq(s.machines.id, machineId));
    await audit('machine', machineId, 'timeFactor', { factor }, u.id);
    return true;
  }, ['/configuracion', '/maquinas']);
}

/** Restaura las tarifas a un estado anterior del historial. */
export async function restoreRatesAction(auditId: string) {
  const t = await getT();
  return safe(async () => {
    const u = await requirePerm('config', 'E'); const db = await getDb(); const cur = await getSettings();
    const [row] = await db.select().from(s.activityLog).where(eq(s.activityLog.id, auditId));
    const before = (row?.changes as any)?.before as import('@/lib/pricing').Rates | undefined;
    if (!before) throw new Error(t('calc.err.noHistory'));
    await saveSettings({ rates: before });
    await audit('settings', null, 'tarifas', { before: cur.rates, after: before, restoredFrom: auditId }, u.id);
    return true;
  }, ['/configuracion', '/calculadora']);
}
