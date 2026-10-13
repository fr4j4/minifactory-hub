import { EventEmitter } from 'node:events';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { notify } from '../audit';
import { unseal } from '../secret';
import { BambuClient } from './client';
import { cameraFrames } from './camera';
import { modelFromCode } from './models';
import type { PrintState, PrinterStatus } from './state';
import { normalize } from './state';

/**
 * Gestor de impresoras conectadas: un cliente MQTT por impresora habilitada, dentro del proceso del servidor
 * (igual que el worker del laminador). Publica cada cambio de estado a los suscriptores (SSE), guarda el
 * último estado en la base cada 15 s o cuando cambia el estado, y sincroniza la cola de producción.
 */
type Link = typeof s.printerLinks.$inferSelect;
export interface LiveRow { id: string; machineId: string; name: string; model: string | null; modelName: string | null; online: boolean; error: string | null; status: PrinterStatus }
interface Entry { link: Link; client: BambuClient; prev: PrintState | null; lastDb: number; hmsSeen: Set<string>; cam: CamHub | null }

class Manager extends EventEmitter {
  entries = new Map<string, Entry>(); started = false;
  constructor() { super(); this.setMaxListeners(200); }
}
const g = globalThis as unknown as { __bambu?: Manager };
const mgr = () => (g.__bambu ??= new Manager());

export function ensureBambu() {
  const m = mgr(); if (m.started || process.env.BAMBU_DISABLED === '1') return; m.started = true;
  (async () => {
    const db = await getDb();
    const links = await db.select().from(s.printerLinks).where(and(eq(s.printerLinks.enabled, true), isNull(s.printerLinks.deletedAt)));
    for (const l of links) start(l);
  })().catch((e) => console.error('[bambu] no se pudieron cargar las impresoras', e));
}

function start(link: Link) {
  const m = mgr(); stop(link.id);
  const client = new BambuClient({ host: link.host, serial: link.serial, accessCode: unseal(link.accessCodeEnc), mqttPort: link.mqttPort, fingerprint: link.fingerprint });
  const e: Entry = { link, client, prev: null, lastDb: 0, hmsSeen: new Set(), cam: null };
  m.entries.set(link.id, e);
  client.on('error', async (err: Error & { code?: string }) => {
    const db = await getDb(); await db.update(s.printerLinks).set({ lastError: err.message, updatedAt: new Date() }).where(eq(s.printerLinks.id, link.id));
    if (err.code === 'cert_changed' || err.code === 'auth') await notify('impresora', `${link.name ?? link.serial}: conexión rechazada`, err.message, `/maquinas/${link.machineId}`);
    m.emit('update', row(e));
  });
  client.on('fingerprint', async (fp: string) => { const db = await getDb(); await db.update(s.printerLinks).set({ fingerprint: fp }).where(eq(s.printerLinks.id, link.id)); e.link = { ...e.link, fingerprint: fp }; });
  client.on('offline', () => m.emit('update', row(e)));
  client.on('status', (st: PrinterStatus) => { m.emit('update', row(e)); onStatus(e, st).catch((err) => console.error('[bambu]', err)); });
  client.connect();
}
function stop(id: string) { const e = mgr().entries.get(id); if (!e) return; e.client.removeAllListeners(); e.client.close(); e.cam?.close(); mgr().entries.delete(id); }

export async function reloadLink(id: string) {
  ensureBambu(); const db = await getDb();
  const [l] = await db.select().from(s.printerLinks).where(eq(s.printerLinks.id, id));
  if (!l || l.deletedAt || !l.enabled) { stop(id); mgr().emit('update', null); return; }
  start(l);
}

function row(e: Entry): LiveRow {
  const md = modelFromCode(e.link.model, e.link.serial);
  return { id: e.link.id, machineId: e.link.machineId, name: e.link.name ?? e.link.serial, model: e.link.model, modelName: md?.name ?? null, online: e.client.online, error: e.client.online ? null : e.client.lastError ?? e.link.lastError, status: e.client.status };
}
export function liveRows(): LiveRow[] { ensureBambu(); return [...mgr().entries.values()].map(row); }
export function liveByMachine(): Record<string, LiveRow> { return Object.fromEntries(liveRows().map((r) => [r.machineId, r])); }
export function onUpdate(cb: (r: LiveRow | null) => void) { const m = mgr(); m.on('update', cb); return () => { m.off('update', cb); }; }
export function clientFor(id: string) { ensureBambu(); const e = mgr().entries.get(id); if (!e) throw new Error('La impresora no está conectada o está deshabilitada'); return e; }
/** Último estado guardado (si el servidor recién partió o la impresora está apagada). */
export function storedStatus(l: Link): PrinterStatus { return l.lastStatus ? (l.lastStatus as PrinterStatus) : normalize(null, false); }

/** Cambios de estado → máquina, cola y avisos. Solo actúa sobre transiciones (no al conectarse por primera vez). */
async function onStatus(e: Entry, st: PrinterStatus) {
  const db = await getDb(); const now = Date.now(); const prev = e.prev; const cur = st.state; const L = e.link; const name = L.name ?? L.serial;
  if (cur !== prev || now - e.lastDb > 15_000) {
    e.lastDb = now;
    await db.update(s.printerLinks).set({ lastStatus: st as unknown as Record<string, any>, lastSeenAt: new Date(), lastError: null }).where(eq(s.printerLinks.id, L.id));
  }
  // avisos HMS nuevos
  for (const h of st.hms) if (!e.hmsSeen.has(h.code)) { e.hmsSeen.add(h.code); if (prev !== null) await notify('impresora', `${name}: aviso HMS ${h.code}`, `Severidad ${h.severity}. Revísalo en la pantalla de la impresora o en la wiki de Bambu Lab.`, `/maquinas/${L.machineId}`); }
  if (cur === 'UNKNOWN' || cur === 'OFFLINE') return;
  e.prev = cur;
  if (prev === null || prev === cur || !L.syncQueue) return;
  const [job] = await db.select().from(s.printJobs).where(and(eq(s.printJobs.machineId, L.machineId), eq(s.printJobs.status, prev === 'PAUSE' ? 'pausado' : 'imprimiendo'))).limit(1);
  const setMachine = (status: string) => db.update(s.machines).set({ status, updatedAt: new Date() }).where(eq(s.machines.id, L.machineId));
  const task = st.task ?? st.file ?? 'trabajo';
  if ((cur === 'RUNNING' || cur === 'PREPARE') && prev !== 'RUNNING' && prev !== 'PREPARE') {
    if (prev === 'PAUSE' && job) await db.update(s.printJobs).set({ status: 'imprimiendo', updatedAt: new Date() }).where(eq(s.printJobs.id, job.id));
    await setMachine('imprimiendo');
    if (!job && prev !== 'PAUSE') await notify('impresora', `${name} empezó a imprimir «${task}»`, 'No hay un trabajo de la cola iniciado en esta máquina. Si corresponde a un pedido, inícialo en la cola para descontar material y llevar el tiempo.', '/cola');
  } else if (cur === 'PAUSE') {
    await setMachine('pausada'); if (job) await db.update(s.printJobs).set({ status: 'pausado', updatedAt: new Date() }).where(eq(s.printJobs.id, job.id));
    await notify('impresora', `${name} está en pausa`, st.stage ?? undefined, `/maquinas/${L.machineId}`);
  } else if (cur === 'FINISH') {
    await setMachine('disponible');
    await notify('impresora', `${name} terminó «${task}»`, job ? `Registra el resultado de ${job.number} en la cola (gramos y horas reales).` : 'Retira la pieza de la cama.', job ? '/cola' : `/maquinas/${L.machineId}`);
  } else if (cur === 'FAILED') {
    await setMachine('disponible');
    await notify('impresora', `${name}: la impresión «${task}» falló o se detuvo`, st.errorCode ? `Código ${st.errorCode}.` : undefined, job ? '/cola' : `/maquinas/${L.machineId}`);
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
      for await (const f of cameraFrames({ host: L.host, accessCode: unseal(L.accessCodeEnc), kind: md?.camera ?? 'jpeg-tls', port: L.cameraPort ?? undefined }, ac.signal)) {
        this.last = { at: Date.now(), jpg: f }; for (const cb of this.subs) cb(f);
      }
    } catch (err) { this.error = (err as Error).message; for (const cb of this.subs) cb(Buffer.alloc(0)); }
    finally { if (this.ac === ac) this.ac = null; }
  }
  close() { this.ac?.abort(); this.ac = null; if (this.idle) clearTimeout(this.idle); this.idle = null; }
}
export function camHub(id: string) { const e = clientFor(id); return (e.cam ??= new CamHub(e)); }
export async function cameraSnapshot(id: string, timeoutMs = 15_000): Promise<Buffer> {
  const hub = camHub(id);
  if (hub.last && Date.now() - hub.last.at < 2500) return hub.last.jpg;
  return new Promise((res, rej) => {
    const t = setTimeout(() => { un(); rej(new Error(hub.error ?? 'La cámara no entregó imagen a tiempo')); }, timeoutMs);
    const un = hub.subscribe((f) => { clearTimeout(t); un(); if (f.length) res(f); else rej(new Error(hub.error ?? 'Error de cámara')); });
  });
}
