import net from 'node:net';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { unzipSync, strFromU8 } from 'fflate';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { audit } from '../audit';
import { seal, unseal } from '../secret';
import { getBuffer } from '../storage';
import { BambuClient } from '../bambu/client';
import { uploadFile } from '../bambu/ftps';
import { modelFromCode } from '../bambu/models';
import { clientFor, reloadAccount, reloadLink } from '../bambu/manager';
import { cloudDevices, cloudTasks, cloudUsername, isAllowedCoverUrl, loginPassword, loginWithCode, loginWithTfa, tokenExpiry, type Region } from '../bambu/cloud';
import { randomUUID } from 'node:crypto';
import { startJob } from './production';
import { getT } from '@/i18n/server';
import { LocalizedError } from '@/i18n/errors';

/** Solo direcciones de la red local (o el propio equipo): el conector no debe usarse para alcanzar internet. */
export function assertLanHost(host: string) {
  const h = host.trim();
  if (!h || h.length > 253 || /[\s/@]/.test(h)) throw new LocalizedError('connector.invalidAddress');
  if (net.isIPv4(h)) {
    const [a, b] = h.split('.').map(Number);
    const ok = a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
    if (!ok) throw new LocalizedError('connector.mustBeLocalExample');
    return h;
  }
  if (net.isIPv6(h)) { if (!/^(::1$|fe80:|fc|fd)/i.test(h)) throw new LocalizedError('connector.mustBeLocal'); return h; }
  if (!/^[a-z0-9-]+(\.local)?$/i.test(h)) throw new LocalizedError('connector.useIpOrLocal');
  return h;
}
const CODE_RE = /^[A-Za-z0-9]{6,16}$/;

export interface ConnectInput { serial: string; host: string; accessCode: string; cloudAccountId?: string | null; model?: string | null; name?: string | null; machineId?: string | null; mqttPort?: number; cameraPort?: number | null; ftpPort?: number; userId?: string | null }

/** Prueba la conexión (MQTT con el código de acceso) y, si responde, la guarda y la deja conectada. */
export async function connectPrinter(i: ConnectInput) {
  const t = await getT();
  const host = assertLanHost(i.host); const serial = i.serial.trim().toUpperCase();
  // conexión LAN con el código de acceso que entrega Bambu Cloud (el código nunca pasa por el navegador)
  if (!i.accessCode && i.cloudAccountId) {
    const d = (await accountDevices(i.cloudAccountId)).find((x) => x.serial === serial);
    if (!d?.accessCode) throw new Error(t('machines.bambuCloudDidNotProvide'));
    i = { ...i, accessCode: d.accessCode, model: i.model ?? d.model };
  }
  if (!/^[A-Z0-9]{8,20}$/.test(serial)) throw new Error(t('machines.invalidSerialNumber'));
  if (!CODE_RE.test(i.accessCode.trim())) throw new Error(t('machines.theAccessCodeHas8'));
  const db = await getDb();
  const [dup] = await db.select().from(s.printerLinks).where(and(eq(s.printerLinks.serial, serial), isNull(s.printerLinks.deletedAt)));
  if (dup) throw new Error(t('machines.thisPrinterIsAlreadyConnected'));
  const md = modelFromCode(i.model, serial);
  const test = new BambuClient({ host, serial, accessCode: i.accessCode.trim(), mqttPort: i.mqttPort ?? 8883 });
  let fp: string | null = null; test.on('fingerprint', (f) => { fp = f; });
  test.connect();
  let st; try { st = await test.waitReady(12_000); } finally { test.close(); }
  // máquina nueva + vínculo en una transacción: si el vínculo falla no queda una máquina huérfana
  const { link, machineId } = await (await getDb()).transaction(async (db) => {
  let machineId = i.machineId ?? null;
  if (machineId) {
    const [m] = await db.select().from(s.machines).where(eq(s.machines.id, machineId)); if (!m) throw new Error(t('machines.machineNotFound'));
    const [taken] = await db.select().from(s.printerLinks).where(and(eq(s.printerLinks.machineId, machineId), isNull(s.printerLinks.deletedAt)));
    if (taken) throw new Error(t('machines.thatMachineAlreadyHasA'));
  } else {
    const [prof] = md ? await db.select().from(s.slicerProfiles).where(and(eq(s.slicerProfiles.type, 'machine'), eq(s.slicerProfiles.baseName, md.orcaMachine), isNull(s.slicerProfiles.deletedAt))).limit(1) : [];
    const slots = st.ams.reduce((a, u) => a + u.trays.length, 0);
    const [m] = await db.insert(s.machines).values({
      workspaceId: WORKSPACE_ID, name: i.name?.trim() || `Bambu Lab ${md?.name ?? serial}`, brand: t('common.bambuLab'), model: md?.name ?? i.model ?? null, tech: 'FDM', serial,
      volX: md?.vol[0] ?? 256, volY: md?.vol[1] ?? 256, volZ: md?.vol[2] ?? 256, enclosed: md?.enclosed ?? false, multicolorSlots: Math.max(1, slots),
      nozzles: [st.nozzle.diameter ?? '0.4'], materialsOk: md?.enclosed ? ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PA', 'PC'] : ['PLA', 'PETG', 'TPU'],
      watts: md?.family === 'A1' ? 95 : 140, machineProfileId: prof?.id ?? null, createdBy: i.userId ?? null,
    }).returning();
    machineId = m.id;
  }
  const [link] = await db.insert(s.printerLinks).values({
    workspaceId: WORKSPACE_ID, machineId, serial, host, accessCodeEnc: seal(i.accessCode.trim()), model: i.model ?? null, name: i.name?.trim() || null,
    mqttPort: i.mqttPort ?? 8883, cameraPort: i.cameraPort ?? null, ftpPort: i.ftpPort ?? 990, fingerprint: fp, lastStatus: st as unknown as Record<string, any>, lastSeenAt: new Date(), createdBy: i.userId ?? null,
  }).returning();
  await db.update(s.machines).set({ serial, connection: { vendor: 'bambu', linkId: link.id }, status: st.state === 'RUNNING' ? 'imprimiendo' : st.state === 'PAUSE' ? 'pausada' : 'disponible', updatedAt: new Date() }).where(eq(s.machines.id, machineId));
  return { link, machineId };
  });
  await audit('printer_link', link.id, 'conectar', { serial, host, model: i.model }, i.userId);
  await reloadLink(link.id);
  return { linkId: link.id, machineId };
}

export async function updatePrinter(id: string, p: { host?: string; accessCode?: string; enabled?: boolean; syncQueue?: boolean; name?: string; urlPrefix?: string; resetFingerprint?: boolean }, userId?: string | null) {
  const t = await getT();
  const db = await getDb(); const set: Partial<typeof s.printerLinks.$inferInsert> = { updatedAt: new Date() };
  if (p.host !== undefined) set.host = assertLanHost(p.host);
  if (p.accessCode) { if (!CODE_RE.test(p.accessCode.trim())) throw new Error(t('machines.invalidAccessCode')); set.accessCodeEnc = seal(p.accessCode.trim()); }
  if (p.enabled !== undefined) set.enabled = p.enabled;
  if (p.syncQueue !== undefined) set.syncQueue = p.syncQueue;
  if (p.name !== undefined) set.name = p.name.trim() || null;
  if (p.urlPrefix !== undefined) { if (!/^(file:\/\/\/[\w/]*\/|ftp:\/\/\/?)$/.test(p.urlPrefix)) throw new Error(t('machines.invalidPathPrefix')); set.urlPrefix = p.urlPrefix; }
  if (p.resetFingerprint) set.fingerprint = null;
  await db.update(s.printerLinks).set(set).where(eq(s.printerLinks.id, id));
  await audit('printer_link', id, 'editar', { ...p, accessCode: p.accessCode ? '***' : undefined }, userId);
  await reloadLink(id);
}

export async function removePrinter(id: string, userId?: string | null) {
  const db = await getDb(); const [l] = await db.select().from(s.printerLinks).where(eq(s.printerLinks.id, id)); if (!l) return;
  // el serial queda con sufijo (como los códigos de bobina): el índice único no impide volver a conectar la misma impresora
  await db.update(s.printerLinks).set({ deletedAt: new Date(), enabled: false, serial: sql`${s.printerLinks.serial} || ${'~' + Date.now().toString(36)}` }).where(eq(s.printerLinks.id, id));
  await db.update(s.machines).set({ connection: {} }).where(eq(s.machines.id, l.machineId));
  await audit('printer_link', id, 'desconectar', {}, userId);
  await reloadLink(id);
}

export type PrinterCommand = 'pause' | 'resume' | 'stop' | 'light_on' | 'light_off' | 'speed';
export async function printerCommand(id: string, cmd: PrinterCommand, arg?: number, userId?: string | null) {
  const t = await getT();
  const { client, link } = clientFor(id);
  if (!client.online) throw new Error(t('machines.thePrinterIsNotConnected'));
  const st = client.status.state;
  if (cmd === 'pause') { if (st !== 'RUNNING' && st !== 'PREPARE') throw new Error(t('machines.onlyAPrintInProgress')); client.pause(); }
  else if (cmd === 'resume') { if (st !== 'PAUSE') throw new Error(t('machines.thePrinterIsNotPaused')); client.resume(); }
  else if (cmd === 'stop') { if (!['RUNNING', 'PAUSE', 'PREPARE'].includes(st)) throw new Error(t('machines.thereIsNoPrintTo')); client.stop(); }
  else if (cmd === 'light_on' || cmd === 'light_off') client.light(cmd === 'light_on');
  else if (cmd === 'speed') { const lv = Number(arg); if (![1, 2, 3, 4].includes(lv)) throw new Error(t('machines.invalidSpeed')); client.speed(lv as 1 | 2 | 3 | 4); }
  if (cmd === 'stop' || cmd === 'pause' || cmd === 'resume') await audit('printer_link', link.id, cmd, { task: client.status.task }, userId);
}

/**
 * Lee del 3MF laminado el modelo de impresora, la boquilla y el material para no enviar un G-code ajeno.
 * Fuente principal: Metadata/project_settings.config (JSON). Respaldo: el bloque de configuración del G-code,
 * que en los archivos de Bambu/Orca va al principio y en otros al final (se revisan ambos extremos).
 */
export function inspectSliced3mf(buf: Buffer, plate = 1) {
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => ['Metadata/project_settings.config', `Metadata/plate_${plate}.gcode`, `Metadata/plate_${plate}.gcode.md5`].includes(f.name) });
  const g = files[`Metadata/plate_${plate}.gcode`]; if (!g) throw new LocalizedError('connector.noPlate', { plate });
  let cfg: Record<string, any> = {};
  try { if (files['Metadata/project_settings.config']) cfg = JSON.parse(strFromU8(files['Metadata/project_settings.config'])); } catch { /* se usa el G-code */ }
  const text = strFromU8(g.subarray(0, Math.min(g.length, 3_000_000))) + '\n' + (g.length > 3_000_000 ? strFromU8(g.subarray(g.length - 1_000_000)) : '');
  const pick = (k: string) => text.match(new RegExp(`^; ${k} = (.*)$`, 'm'))?.[1]?.trim() ?? null;
  const first = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? '') : v != null ? String(v) : '').split(/[;,]/)[0].trim() || null;
  return {
    printerModel: first(cfg.printer_model) ?? pick('printer_model'),
    nozzle: first(cfg.nozzle_diameter) ?? pick('nozzle_diameter')?.split(',')[0] ?? null,
    filamentType: first(cfg.filament_type) ?? pick('filament_type')?.split(';')[0] ?? null,
    md5: files[`Metadata/plate_${plate}.gcode.md5`] ? strFromU8(files[`Metadata/plate_${plate}.gcode.md5`]).trim() : '',
  };
}

export interface SendInput { linkId: string; runId: string; plate?: number; useAms: boolean; amsSlot?: number; timelapse?: boolean; bedLeveling?: boolean; jobId?: string | null; userId?: string | null }
export async function sendToPrinter(i: SendInput) {
  const t = await getT();
  const db = await getDb(); const e = clientFor(i.linkId); const L = e.link; const md = modelFromCode(L.model, L.serial);
  if (L.mode === 'cloud' || !L.host) throw new Error(t('machines.sendingAPrintRequiresA'));
  if (!e.client.online) throw new Error(t('machines.thePrinterIsNotConnected'));
  const st = e.client.status;
  if (!['IDLE', 'FINISH', 'FAILED'].includes(st.state)) throw new Error(t('machines.thePrinterIsWaitUntil', { status: t(st.stateLabel) }));
  const [run] = await db.select().from(s.sliceRuns).where(eq(s.sliceRuns.id, i.runId));
  if (!run || run.status !== 'done' || !run.threemfKey) throw new Error(t('machines.thatSliceHasNo3mf'));
  const buf = await getBuffer(run.threemfKey); const info = inspectSliced3mf(buf, i.plate ?? 1);
  const expected = md ? t('machines.bambuLab2', { model: md.name }) : null;
  // si no se puede comprobar para qué impresora se laminó, no se envía (fallar cerrado)
  if (!info.printerModel) throw new Error(t('machines.couldNotVerifyWhichPrinter'));
  if (!expected) throw new Error(t('machines.unknownPrinterModelTheFile'));
  if (info.printerModel !== expected) throw new Error(t('machines.thisFileWasSlicedFor', { sliced: info.printerModel, printer: expected}));
  if (st.nozzle.diameter && info.nozzle && Number(st.nozzle.diameter) !== Number(info.nozzle)) throw new Error(t('machines.theFileIsForA', { file: info.nozzle, printer: st.nozzle.diameter }));
  if (i.useAms) {
    const slot = i.amsSlot ?? 0; const tray = st.ams.flatMap((u) => u.trays).find((tt) => Number(tt.slot) === slot);
    if (!tray || tray.empty) throw new Error(t('machines.theSelectedAmsTrayIs'));
    if (info.filamentType && tray.type && tray.type.toUpperCase() !== info.filamentType.toUpperCase()) throw new Error(t('machines.theFileUsesAndThe', { file: info.filamentType, tray: tray.type }));
  } else if (!st.external || st.external.empty) {
    if (st.ams.length) throw new Error(t('machines.noExternalSpoolIsLoaded'));
  }
  const base = (run.label ?? 'pieza').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '_').slice(0, 40) || 'pieza';
  const fileName = `MF_${run.id.slice(0, 8)}_${base}.3mf`;
  await uploadFile({ host: L.host!, accessCode: unseal(L.accessCodeEnc), port: L.ftpPort, fingerprint: L.fingerprint }, fileName, buf);
  (e.client as BambuClient).startProject({ fileName, plate: i.plate ?? 1, urlPrefix: L.urlPrefix, useAms: i.useAms, amsMapping: i.useAms ? [i.amsSlot ?? 0] : [], timelapse: i.timelapse, bedLeveling: i.bedLeveling ?? true, md5: info.md5 });
  if (i.jobId) await startJob(i.jobId, { machineId: L.machineId, userId: i.userId });
  await audit('printer_link', L.id, 'enviar_impresion', { runId: run.id, fileName, jobId: i.jobId ?? null, useAms: i.useAms, amsSlot: i.amsSlot ?? null }, i.userId);
  return { fileName };
}

/** Laminados con 3MF listos para enviar (los más recientes primero). */
export async function sendableRuns(limit = 30) {
  const db = await getDb();
  return db.select({ id: s.sliceRuns.id, label: s.sliceRuns.label, timeS: s.sliceRuns.timeS, filament: s.sliceRuns.filament, createdAt: s.sliceRuns.createdAt, profileVersions: s.sliceRuns.profileVersions })
    .from(s.sliceRuns).where(and(eq(s.sliceRuns.status, 'done'), isNotNull(s.sliceRuns.threemfKey))).orderBy(desc(s.sliceRuns.createdAt)).limit(limit);
}

/** Asocia una bobina del inventario a una bandeja del AMS (o a la bobina externa). */
export async function assignTraySpool(linkId: string, slotLabel: string, spoolId: string | null, userId?: string | null) {
  const t = await getT();
  const db = await getDb(); const [l] = await db.select().from(s.printerLinks).where(eq(s.printerLinks.id, linkId)); if (!l) throw new Error(t('machines.printerNotFound'));
  await db.update(s.spools).set({ slot: null, updatedAt: new Date() }).where(and(eq(s.spools.machineId, l.machineId), eq(s.spools.slot, slotLabel)));
  if (spoolId) {
    const [sp] = await db.select().from(s.spools).where(eq(s.spools.id, spoolId)); if (!sp) throw new Error(t('common.spoolNotFound'));
    await db.update(s.spools).set({ machineId: l.machineId, slot: slotLabel, status: sp.status === 'nueva' ? 'abierta' : sp.status, openedAt: sp.openedAt ?? new Date().toISOString().slice(0, 10), updatedAt: new Date() }).where(eq(s.spools.id, spoolId));
  }
  await audit('printer_link', linkId, 'asignar_bobina', { slot: slotLabel, spoolId }, userId);
}

/* ── Bambu Cloud ─────────────────────────────────────────────────────────────────────────────── */
type Pending = { region: Region; account: string; kind: 'code' | 'tfa'; tfaKey?: string; userId?: string | null; exp: number };
const gp = globalThis as unknown as { __cloudPending?: Map<string, Pending> };
const pending = () => (gp.__cloudPending ??= new Map());

/** Paso 1 del login. La contraseña se usa solo en esta llamada y no se guarda. */
export async function cloudStartLogin(i: { region: Region; account: string; password: string; userId?: string | null }) {
  const t = await getT();
  const account = i.account.trim().toLowerCase(); if (!account || !i.password) throw new Error(t('machines.enterTheEmailAndPassword'));
  const r = await loginPassword(i.region, account, i.password);
  if (r.kind === 'token') return { state: 'done' as const, accountId: await saveCloudAccount(i.region, account, r.token, r.expiresIn, i.userId) };
  for (const [k, v] of pending()) if (v.exp < Date.now()) pending().delete(k);
  const id = randomUUID(); pending().set(id, { region: i.region, account, kind: r.kind, tfaKey: r.kind === 'tfa' ? r.tfaKey : undefined, userId: i.userId, exp: Date.now() + 10 * 60_000 });
  return { state: r.kind, pendingId: id };
}
/** Paso 2: código del correo o de la app autenticadora. */
export async function cloudFinishLogin(i: { pendingId: string; code: string }) {
  const t = await getT();
  const p = pending().get(i.pendingId); if (!p || p.exp < Date.now()) throw new Error(t('machines.theSignInExpiredStart'));
  const code = i.code.replace(/\s/g, ''); if (!/^\d{4,8}$/.test(code)) throw new Error(t('machines.theCodeHas6Digits'));
  const tt = p.kind === 'tfa' ? await loginWithTfa(p.region, p.tfaKey!, code) : await loginWithCode(p.region, p.account, code);
  pending().delete(i.pendingId);
  return { accountId: await saveCloudAccount(p.region, p.account, tt.token, tt.expiresIn, p.userId) };
}
async function saveCloudAccount(region: Region, email: string, token: string, expiresIn: number | null, userId?: string | null) {
  const db = await getDb(); const who = await cloudUsername(region, token); const exp = tokenExpiry(token, expiresIn);
  const [prev] = await db.select().from(s.cloudAccounts).where(and(eq(s.cloudAccounts.email, email), eq(s.cloudAccounts.region, region), isNull(s.cloudAccounts.deletedAt)));
  const values = { tokenEnc: seal(token), tokenExpiresAt: exp, uid: who.uid, username: who.username, displayName: who.name, status: 'activa', lastError: null, updatedAt: new Date() };
  let id: string;
  if (prev) { await db.update(s.cloudAccounts).set(values).where(eq(s.cloudAccounts.id, prev.id)); id = prev.id; }
  else { const [a] = await db.insert(s.cloudAccounts).values({ workspaceId: WORKSPACE_ID, region, email, createdBy: userId ?? null, ...values }).returning(); id = a.id; }
  await audit('cloud_account', id, 'iniciar_sesion', { email, region }, userId);
  await reloadAccount(id);
  return id;
}
async function accountToken(accountId: string) {
  const t = await getT();
  const db = await getDb(); const [a] = await db.select().from(s.cloudAccounts).where(eq(s.cloudAccounts.id, accountId));
  if (!a || a.deletedAt || a.status !== 'activa' || !a.tokenEnc) throw new Error(t('machines.theBambuCloudAccountHas'));
  return { a, token: unseal(a.tokenEnc), region: a.region as Region };
}
/** Impresoras de la cuenta (incluye el código LAN; solo se usa en el servidor). */
export async function accountDevices(accountId: string) {
  const { a, token, region } = await accountToken(accountId);
  try { return await cloudDevices(region, token); }
  catch (e) {
    if ((e as { code?: string }).code === 'unauthorized') { const db = await getDb(); await db.update(s.cloudAccounts).set({ status: 'expirada', lastError: (e as Error).message }).where(eq(s.cloudAccounts.id, a.id)); }
    throw e;
  }
}
export async function cloudDeviceList(accountId: string) {
  const db = await getDb(); const linked = await db.select({ serial: s.printerLinks.serial, mode: s.printerLinks.mode }).from(s.printerLinks).where(isNull(s.printerLinks.deletedAt));
  return (await accountDevices(accountId)).map(({ accessCode, ...d }) => ({ ...d, hasLanCode: !!accessCode, modelName: modelFromCode(d.model, d.serial)?.name ?? d.productName, linked: linked.find((l) => l.serial === d.serial)?.mode ?? null }));
}

/** Agrega una impresora de la cuenta en modo nube (solo lectura). */
export async function addCloudPrinter(i: { accountId: string; serial: string; name?: string | null; machineId?: string | null; userId?: string | null }) {
  const t = await getT();
  const db = await getDb(); const d = (await accountDevices(i.accountId)).find((x) => x.serial === i.serial);
  if (!d) throw new Error(t('machines.thatPrinterIsNotIn'));
  const [dup] = await db.select().from(s.printerLinks).where(and(eq(s.printerLinks.serial, d.serial), isNull(s.printerLinks.deletedAt)));
  if (dup) throw new Error(t('machines.thisPrinterIsAlreadyConnected'));
  const md = modelFromCode(d.model, d.serial);
  const { link, machineId } = await db.transaction(async (db) => {
  let machineId = i.machineId ?? null;
  if (machineId) {
    const [taken] = await db.select().from(s.printerLinks).where(and(eq(s.printerLinks.machineId, machineId), isNull(s.printerLinks.deletedAt)));
    if (taken) throw new Error(t('machines.thatMachineAlreadyHasA'));
  } else {
    const [prof] = md ? await db.select().from(s.slicerProfiles).where(and(eq(s.slicerProfiles.type, 'machine'), eq(s.slicerProfiles.baseName, md.orcaMachine), isNull(s.slicerProfiles.deletedAt))).limit(1) : [];
    const [m] = await db.insert(s.machines).values({ workspaceId: WORKSPACE_ID, name: i.name?.trim() || d.name || `Bambu Lab ${md?.name ?? d.serial}`, brand: t('common.bambuLab'), model: md?.name ?? d.productName, tech: 'FDM', serial: d.serial,
      volX: md?.vol[0] ?? 256, volY: md?.vol[1] ?? 256, volZ: md?.vol[2] ?? 256, enclosed: md?.enclosed ?? false, nozzles: [d.nozzle ?? '0.4'], machineProfileId: prof?.id ?? null, watts: md?.family === 'A1' ? 95 : 140, createdBy: i.userId ?? null }).returning();
    machineId = m.id;
  }
  const [link] = await db.insert(s.printerLinks).values({ workspaceId: WORKSPACE_ID, machineId, mode: 'cloud', cloudAccountId: i.accountId, serial: d.serial, host: null, accessCodeEnc: seal(d.accessCode ?? ''), model: d.model, name: i.name?.trim() || d.name, createdBy: i.userId ?? null }).returning();
  await db.update(s.machines).set({ serial: d.serial, connection: { vendor: 'bambu', linkId: link.id, mode: 'cloud' }, updatedAt: new Date() }).where(eq(s.machines.id, machineId));
  return { link, machineId };
  });
  await audit('printer_link', link.id, 'conectar_nube', { serial: d.serial, accountId: i.accountId }, i.userId);
  await reloadLink(link.id);
  return { linkId: link.id, machineId };
}

export async function cloudLogout(accountId: string, userId?: string | null) {
  const db = await getDb();
  await db.update(s.cloudAccounts).set({ status: 'cerrada', tokenEnc: null, updatedAt: new Date() }).where(eq(s.cloudAccounts.id, accountId));
  await audit('cloud_account', accountId, 'cerrar_sesion', {}, userId);
  await reloadAccount(accountId);
}

/** Miniatura de la placa del trabajo más reciente (la cámara en vivo no está disponible por la nube). */
const covers = new Map<string, { at: number; jpg: Buffer; type: string }>();
export async function cloudCover(linkId: string) {
  const t = await getT();
  const db = await getDb(); const [l] = await db.select().from(s.printerLinks).where(eq(s.printerLinks.id, linkId));
  if (!l?.cloudAccountId) throw new Error(t('machines.itIsNotAPrinter'));
  const hit = covers.get(linkId); if (hit && Date.now() - hit.at < 60_000) return hit;
  const { token, region } = await accountToken(l.cloudAccountId);
  const tt = (await cloudTasks(region, token, l.serial, 5)).find((x) => x.cover);
  if (!tt?.cover || !isAllowedCoverUrl(tt.cover)) throw new Error(t('machines.thereIsNoPreviewOf'));
  const r = await fetch(tt.cover, { signal: AbortSignal.timeout(15_000) }); if (!r.ok) throw new Error(t('machines.couldNotDownloadThePreview'));
  const out = { at: Date.now(), jpg: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') ?? 'image/png' };
  covers.set(linkId, out); return out;
}
