'use server';
import { requirePerm } from '@/lib/auth';
import { scan } from '@/lib/bambu/discovery';
import { getDb, s } from '@/db';
import { isNull } from 'drizzle-orm';
import { addCloudPrinter, cloudDeviceList, cloudFinishLogin, cloudLogout, cloudStartLogin, assignTraySpool, connectPrinter, printerCommand, removePrinter, sendToPrinter, updatePrinter, type ConnectInput, type PrinterCommand, type SendInput } from '@/lib/services/printers';
import { safe } from './common';

const P = ['/maquinas', '/maquinas/conectores', '/'];

export async function discoverPrintersAction(seconds = 6) {
  return safe(async () => {
    await requirePerm('maquinas', 'C');
    const r = await scan(Math.min(15, Math.max(2, seconds)) * 1000);
    const db = await getDb(); const linked = new Set((await db.select({ serial: s.printerLinks.serial }).from(s.printerLinks).where(isNull(s.printerLinks.deletedAt))).map((x) => x.serial));
    return { ...r, found: r.found.map((f) => ({ ...f, linked: linked.has(f.serial) })).sort((a, b) => Number(a.linked) - Number(b.linked) || a.serial.localeCompare(b.serial)) };
  });
}
export async function connectPrinterAction(i: Omit<ConnectInput, 'userId'>) { return safe(async () => { const u = await requirePerm('maquinas', 'C'); return connectPrinter({ ...i, userId: u.id }); }, P); }
export async function updatePrinterAction(id: string, p: Parameters<typeof updatePrinter>[1]) { return safe(async () => { const u = await requirePerm('maquinas', 'E'); await updatePrinter(id, p, u.id); }, P); }
export async function removePrinterAction(id: string) { return safe(async () => { const u = await requirePerm('maquinas', 'X'); await removePrinter(id, u.id); }, P); }
export async function printerCommandAction(id: string, cmd: PrinterCommand, arg?: number) { return safe(async () => { const u = await requirePerm('maquinas', 'E'); await printerCommand(id, cmd, arg, u.id); }); }
export async function sendToPrinterAction(i: Omit<SendInput, 'userId'>) { return safe(async () => { const u = await requirePerm('cola', 'E'); return sendToPrinter({ ...i, userId: u.id }); }, ['/cola', '/maquinas']); }
export async function assignTraySpoolAction(linkId: string, slot: string, spoolId: string | null) { return safe(async () => { const u = await requirePerm('inventario', 'E'); await assignTraySpool(linkId, slot, spoolId, u.id); }, ['/maquinas', '/inventario']); }

export async function cloudLoginAction(i: { region: 'global' | 'china'; account: string; password: string }) { return safe(async () => { const u = await requirePerm('maquinas', 'C'); return cloudStartLogin({ ...i, userId: u.id }); }, P); }
export async function cloudVerifyAction(pendingId: string, code: string) { return safe(async () => { await requirePerm('maquinas', 'C'); return cloudFinishLogin({ pendingId, code }); }, P); }
export async function cloudDevicesAction(accountId: string) { return safe(async () => { await requirePerm('maquinas', 'C'); return cloudDeviceList(accountId); }); }
export async function addCloudPrinterAction(i: { accountId: string; serial: string; name?: string | null; machineId?: string | null }) { return safe(async () => { const u = await requirePerm('maquinas', 'C'); return addCloudPrinter({ ...i, userId: u.id }); }, P); }
export async function cloudLogoutAction(accountId: string) { return safe(async () => { const u = await requirePerm('maquinas', 'E'); await cloudLogout(accountId, u.id); }, P); }
