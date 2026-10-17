import { EventEmitter } from 'node:events';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { notify } from '../audit';
import { unseal } from '../secret';
import { BambuClient } from './client';
import { CloudSession, type CloudDeviceClient } from './cloud-mqtt';
import { cloudDevices, type Region } from './cloud';
import { cameraFrames } from './camera';
import { modelFromCode } from './models';
import type { PrintState, PrinterStatus } from './state';
import { normalize } from './state';
import { getT } from '@/i18n/server';
import type { MessageKey } from '@/i18n/translate';
import { LocalizedError, tDefault } from '@/i18n/errors';

/**
 * Gestor de impresoras conectadas: un cliente MQTT por impresora habilitada, dentro del proceso del servidor
 * (igual que el worker del laminador). Publica cada cambio de estado a los suscriptores (SSE), guarda el
 * último estado en la base cada 15 s o cuando cambia el estado, y sincroniza la cola de producción.
 */
type Link = typeof s.printerLinks.$inferSelect;
export interface LiveRow { id: string; machineId: string; name: string; model: string | null; modelName: string | null; mode: 'lan' | 'cloud'; online: boolean; error: string | null; status: PrinterStatus }
type Conn = BambuClient | CloudDeviceClient;
interface Entry { link: Link; client: Conn; prev: PrintState | null; lastDb: number; hmsSeen: Set<string>; cam: CamHub | null }
interface AccountSession { session: CloudSession; timer: NodeJS.Timeout; region: Region; token: string; notified: boolean }

class Manager extends EventEmitter {
  entries = new Map<string, Entry>(); accounts = new Map<string, AccountSession>(); started = false;
  constructor() { super(); this.setMaxListeners(200); }
}
const g = globalThis as unknown as { __bambu?: Manager };
const mgr = () => (g.__bambu ??= new Manager());

export function ensureBambu() {
  const m = mgr(); if (m.started || process.env.BAMBU_DISABLED === '1') return; m.started = true;
  (async () => {
    const db = await getDb();
    const links = await db.select().from(s.printerLinks).where(and(eq(s.printerLinks.enabled, true), isNull(s.printerLinks.deletedAt)));
    for (const l of links) await start(l);
  })().catch((e) => console.error('[bambu] no se pudieron cargar las impresoras', e));
}

async function start(link: Link) {
  const t = await getT();
  const m = mgr(); stop(link.id);
  let client: Conn;
  if (link.mode === 'cloud') {
    const acc = link.cloudAccountId ? await accountSession(link.cloudAccountId) : null;
    if (!acc) { const db = await getDb(); await db.update(s.printerLinks).set({ lastError: tDefault('connector.cloudNoSession') }).where(eq(s.printerLinks.id, link.id)); return; }
    client = acc.session.device(link.serial);
  } else {
    client = new BambuClient({ host: link.host ?? '', serial: link.serial, accessCode: unseal(link.accessCodeEnc), mqttPort: link.mqttPort, fingerprint: link.fingerprint });
  }
  const e: Entry = { link, client, prev: null, lastDb: 0, hmsSeen: new Set(), cam: null };
  m.entries.set(link.id, e);
  client.on('error', async (err: Error & { code?: string }) => {
    const db = await getDb(); await db.update(s.printerLinks).set({ lastError: err.message, updatedAt: new Date() }).where(eq(s.printerLinks.id, link.id));
    if (link.mode === 'lan' && (err.code === 'cert_changed' || err.code === 'auth')) await notify('impresora', t('machines.connectionRefused', { name: link.name ?? link.serial }), err.message, `/maquinas/${link.machineId}`);
    m.emit('update', row(e));
  });
  client.on('fingerprint', async (fp: string) => { const db = await getDb(); await db.update(s.printerLinks).set({ fingerprint: fp }).where(eq(s.printerLinks.id, link.id)); e.link = { ...e.link, fingerprint: fp }; });
  client.on('offline', () => m.emit('update', row(e)));
  client.on('online', () => m.emit('update', row(e)));
  client.on('status', (st: PrinterStatus) => { m.emit('update', row(e)); onStatus(e, st).catch((err) => console.error('[bambu]', err)); });
  client.connect();
}

/** Sesión de nube compartida por todas las impresoras de una cuenta; revisa cada 5 min qué impresoras están en línea. */
async function accountSession(accountId: string): Promise<AccountSession | null> {
  const m = mgr(); const have = m.accounts.get(accountId); if (have) return have;
  const db = await getDb(); const [a] = await db.select().from(s.cloudAccounts).where(eq(s.cloudAccounts.id, accountId));
  if (!a || a.deletedAt || a.status !== 'activa' || !a.tokenEnc || !a.username) return null;
  const token = unseal(a.tokenEnc); const region = a.region as Region;
  const session = new CloudSession({ region, username: a.username, token });
  const acc: AccountSession = { session, region, token, notified: false, timer: setInterval(() => syncAccount(accountId).catch(() => {}), 5 * 60_000) };
  session.on('session-error', async (err: Error & { code?: string }) => {
    if (err.code !== 'auth' || acc.notified) return; acc.notified = true;
    await expireAccount(accountId, err.message);
  });
  m.accounts.set(accountId, acc);
  setTimeout(() => syncAccount(accountId).catch(() => {}), 1500);
  return acc;
}
async function expireAccount(accountId: string, msg: string) {
  const t = await getT();
  const db = await getDb(); const [a] = await db.select().from(s.cloudAccounts).where(eq(s.cloudAccounts.id, accountId));
  await db.update(s.cloudAccounts).set({ status: 'expirada', lastError: msg, updatedAt: new Date() }).where(eq(s.cloudAccounts.id, accountId));
  await notify('impresora', t('machines.bambuCloudSignInAgain'), t('machines.cloudSessionExpired', { account: a?.email ?? t('machines.theAccount') }), '/maquinas/conectores');
}
async function syncAccount(accountId: string) {
  const acc = mgr().accounts.get(accountId); if (!acc) return;
  try {
    const list = await cloudDevices(acc.region, acc.token);
    for (const e of mgr().entries.values()) if (e.link.cloudAccountId === accountId && e.link.mode === 'cloud') { const d = list.find((x) => x.serial === e.link.serial); (e.client as CloudDeviceClient).setDeviceOnline?.(!!d?.online); }
    const db = await getDb(); await db.update(s.cloudAccounts).set({ lastSyncAt: new Date(), lastError: null }).where(eq(s.cloudAccounts.id, accountId));
  } catch (err) { if ((err as { code?: string }).code === 'unauthorized' && !acc.notified) { acc.notified = true; await expireAccount(accountId, (err as Error).message); } }
}
export async function reloadAccount(accountId: string) {
  const m = mgr(); const acc = m.accounts.get(accountId);
  if (acc) { clearInterval(acc.timer); acc.session.removeAllListeners(); acc.session.close(); m.accounts.delete(accountId); }
  const db = await getDb();
  const links = await db.select().from(s.printerLinks).where(and(eq(s.printerLinks.cloudAccountId, accountId), eq(s.printerLinks.mode, 'cloud'), eq(s.printerLinks.enabled, true), isNull(s.printerLinks.deletedAt)));
  for (const l of links) await start(l);
  m.emit('update', null);
}
export function accountOnline(accountId: string) { return !!mgr().accounts.get(accountId)?.session.connected; }

function stop(id: string) { const e = mgr().entries.get(id); if (!e) return; e.client.removeAllListeners(); e.client.close(); e.cam?.close(); mgr().entries.delete(id); }

export async function reloadLink(id: string) {
  ensureBambu(); const db = await getDb();
  const [l] = await db.select().from(s.printerLinks).where(eq(s.printerLinks.id, id));
  if (!l || l.deletedAt || !l.enabled) { stop(id); mgr().emit('update', null); return; }
  await start(l);
}

function row(e: Entry): LiveRow {
  const md = modelFromCode(e.link.model, e.link.serial);
  return { id: e.link.id, machineId: e.link.machineId, name: e.link.name ?? e.link.serial, model: e.link.model, modelName: md?.name ?? null, mode: e.link.mode === 'cloud' ? 'cloud' : 'lan', online: e.client.online, error: e.client.online ? null : e.client.lastError ?? e.link.lastError, status: e.client.status };
}
export function liveRows(): LiveRow[] { ensureBambu(); return [...mgr().entries.values()].map(row); }
export function liveByMachine(): Record<string, LiveRow> { return Object.fromEntries(liveRows().map((r) => [r.machineId, r])); }
export function onUpdate(cb: (r: LiveRow | null) => void) { const m = mgr(); m.on('update', cb); return () => { m.off('update', cb); }; }
export function clientFor(id: string) { ensureBambu(); const e = mgr().entries.get(id); if (!e) throw new LocalizedError('connector.disconnectedOrDisabled'); return e; }
/** Último estado guardado (si el servidor recién partió o la impresora está apagada). */
export function storedStatus(l: Link): PrinterStatus { return l.lastStatus ? (l.lastStatus as PrinterStatus) : normalize(null, false); }

/** Cambios de estado → máquina, cola y avisos. Solo actúa sobre transiciones (no al conectarse por primera vez). */
async function onStatus(e: Entry, st: PrinterStatus) {
  const t = await getT();
  const db = await getDb(); const now = Date.now(); const prev = e.prev; const cur = st.state; const L = e.link; const name = L.name ?? L.serial;
  if (cur !== prev || now - e.lastDb > 15_000) {
    e.lastDb = now;
    await db.update(s.printerLinks).set({ lastStatus: st as unknown as Record<string, any>, lastSeenAt: new Date(), lastError: null }).where(eq(s.printerLinks.id, L.id));
  }
  // avisos HMS nuevos
  for (const h of st.hms) if (!e.hmsSeen.has(h.code)) { e.hmsSeen.add(h.code); if (prev !== null) await notify('impresora', t('machines.hmsNotice', { name, code: h.code }), t('machines.severityCheckItOnThe', { severity: t(`machines.severity.${h.severity === 'común' ? 'comun' : h.severity}` as 'machines.severity.fatal') }), `/maquinas/${L.machineId}`); }
  if (cur === 'UNKNOWN' || cur === 'OFFLINE') return;
  e.prev = cur;
  if (prev === null && L.syncQueue) {
    // primer estado tras conectar: alinear la máquina con lo que informa la impresora, sin avisos
    const want = cur === 'RUNNING' || cur === 'PREPARE' ? 'imprimiendo' : cur === 'PAUSE' ? 'pausada' : null;
    const [mm] = await db.select({ status: s.machines.status }).from(s.machines).where(eq(s.machines.id, L.machineId));
    if (want && mm && mm.status !== want && mm.status !== 'mantenimiento' && mm.status !== 'fuera_de_servicio') await db.update(s.machines).set({ status: want, updatedAt: new Date() }).where(eq(s.machines.id, L.machineId));
    else if (!want && mm && (mm.status === 'imprimiendo' || mm.status === 'pausada')) {
      const [running] = await db.select({ id: s.printJobs.id }).from(s.printJobs).where(and(eq(s.printJobs.machineId, L.machineId), eq(s.printJobs.status, 'imprimiendo'))).limit(1);
      if (!running) await db.update(s.machines).set({ status: 'disponible', updatedAt: new Date() }).where(eq(s.machines.id, L.machineId));
    }
    return;
  }
  if (prev === null || prev === cur || !L.syncQueue) return;
  const [job] = await db.select().from(s.printJobs).where(and(eq(s.printJobs.machineId, L.machineId), eq(s.printJobs.status, prev === 'PAUSE' ? 'pausado' : 'imprimiendo'))).limit(1);
  const setMachine = (status: string) => db.update(s.machines).set({ status, updatedAt: new Date() }).where(eq(s.machines.id, L.machineId));
  const task = st.task ?? st.file ?? 'trabajo';
  if ((cur === 'RUNNING' || cur === 'PREPARE') && prev !== 'RUNNING' && prev !== 'PREPARE') {
    if (prev === 'PAUSE' && job) await db.update(s.printJobs).set({ status: 'imprimiendo', updatedAt: new Date() }).where(eq(s.printJobs.id, job.id));
    await setMachine('imprimiendo');
    if (!job && prev !== 'PAUSE') await notify('impresora', t('machines.startedPrinting', { name, task }), t('machines.thereIsNoQueueJob'), '/cola');
  } else if (cur === 'PAUSE') {
    await setMachine('pausada'); if (job) await db.update(s.printJobs).set({ status: 'pausado', updatedAt: new Date() }).where(eq(s.printJobs.id, job.id));
    await notify('impresora', t('machines.isPaused', { name }), st.stage ? (st.stage.startsWith('stage:') ? t('machines.stageUnknown', { n: st.stage.slice(6) }) : t(st.stage as MessageKey)) : undefined, `/maquinas/${L.machineId}`);
  } else if (cur === 'FINISH') {
    await setMachine('disponible');
    await notify('impresora', t('machines.finished', { name, task }), job ? t('machines.recordTheResultOfIn', { job: job.number }) : t('machines.removeThePartFromThe'), job ? '/cola' : `/maquinas/${L.machineId}`);
  } else if (cur === 'FAILED') {
    await setMachine('disponible');
    await notify('impresora', t('machines.thePrintFailedOrWas', { name, task }), st.errorCode ? t('machines.code', { code: st.errorCode }) : undefined, job ? '/cola' : `/maquinas/${L.machineId}`);
  } else if (cur === 'IDLE' && (prev === 'RUNNING' || prev === 'PAUSE')) await setMachine('disponible');
}

/**
 * Cámara compartida: una sola conexión hacia la impresora (la cámara de P1/A1 acepta pocos clientes) que
 * se reparte a todos los visores; se cierra 5 s después de que se va el último.
 */
class CamHub {
  private subs = new Set<(f: Buffer) => void>(); private ac: AbortController | null = null; private idle: NodeJS.Timeout | null = null;
  last: { at: number; jpg: Buffer } | null = null; error: string | null = null;
  constructor(private e: Entry) {}
  subscribe(cb: (f: Buffer) => void) {
    this.subs.add(cb); if (this.idle) { clearTimeout(this.idle); this.idle = null; }
    if (!this.ac) this.run();
    return () => { this.subs.delete(cb); if (!this.subs.size && !this.idle) this.idle = setTimeout(() => this.close(), 5000); };
  }
  private async run() {
    const L = this.e.link; const md = modelFromCode(L.model, L.serial);
    const ac = new AbortController(); this.ac = ac; this.error = null;
    try {
      if (L.mode === 'cloud') throw new LocalizedError('connector.cloudNoCamera');
      for await (const f of cameraFrames({ host: L.host ?? '', accessCode: unseal(L.accessCodeEnc), kind: md?.camera ?? 'jpeg-tls', port: L.cameraPort ?? undefined, fingerprint: L.fingerprint }, ac.signal)) {
        this.last = { at: Date.now(), jpg: f }; for (const cb of this.subs) cb(f);
      }
    } catch (err) { this.error = (err as Error).message; for (const cb of this.subs) cb(Buffer.alloc(0)); }
    finally { if (this.ac === ac) this.ac = null; }
  }
  close() { this.ac?.abort(); this.ac = null; if (this.idle) clearTimeout(this.idle); this.idle = null; }
}
export function camHub(id: string) { const e = clientFor(id); return (e.cam ??= new CamHub(e)); }
export async function cameraSnapshot(id: string, timeoutMs = 15_000): Promise<Buffer> {
  const t = await getT();
  const hub = camHub(id);
  if (hub.last && Date.now() - hub.last.at < 2500) return hub.last.jpg;
  return new Promise((res, rej) => {
    const tt = setTimeout(() => { un(); rej(new Error(hub.error ?? t('machines.theCameraDidNotDeliver'))); }, timeoutMs);
    const un = hub.subscribe((f) => { clearTimeout(tt); un(); if (f.length) res(f); else rej(new Error(hub.error ?? t('machines.cameraError'))); });
  });
}
