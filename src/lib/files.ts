import fsp from 'node:fs/promises';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { unzipSync } from 'fflate';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { absPath, newKey, putBuffer, putFile, sha256File, getBuffer, remove } from './storage';
import { analyze, decimate, renderThumbnail, renderTurntable, toPreviewBin, weld } from './mesh/ops';
import { extOf, parseMesh, SUPPORTED_MESH, GCODE_EXT, IMAGE_EXT } from './mesh/parse';
import { parseAms } from './mesh/threemf-ams';
import { buildGcodePreview, gcodePreviewToBin, hasSlicedData, parse3mfSliceMeta, parseGcodeMeta } from './gcode';
import { audit } from './audit';
import { getT } from '@/i18n/server';

export const MODEL_EXT = [...SUPPORTED_MESH, ...GCODE_EXT, ...IMAGE_EXT] as string[];
export const formatLabel = (ext: string) => ({ stp: 'STEP', step: 'STEP', gcode: 'G-code', gco: 'G-code', bgcode: 'BGCODE', jpg: 'JPG', jpeg: 'JPG' } as Record<string, string>)[ext] ?? ext.toUpperCase();
export const kindOfExt = (ext: string): 'malla' | 'gcode' | 'imagen' | 'otro' =>
  (SUPPORTED_MESH as readonly string[]).includes(ext) ? 'malla' : (GCODE_EXT as readonly string[]).includes(ext) ? 'gcode' : (IMAGE_EXT as readonly string[]).includes(ext) ? 'imagen' : 'otro';

export interface IngestInput {
  tmpPath: string; filename: string; userId?: string | null; modelFileId?: string; comment?: string;
  customerId?: string | null; folder?: string | null; tags?: string[]; origin?: string | null; license?: string | null; author?: string | null;
  sync?: boolean; // esperar el procesamiento (pruebas y scripts)
}

/** Guarda el archivo, crea el modelo (o una versión nueva) y lanza el análisis en segundo plano. */
export async function ingestModel(i: IngestInput) {
  const t = await getT();
  const db = await getDb();
  const ext = extOf(i.filename);
  if (!MODEL_EXT.includes(ext)) throw new Error(t('files.unsupportedFormat', { ext }));
  const sha = await sha256File(i.tmpPath);
  const size = (await fsp.stat(i.tmpPath)).size;
  const key = newKey('models', ext);
  await putFile(key, i.tmpPath, true);
  // duplicado por hash
  const [dup] = await db.select({ id: s.modelFiles.id, name: s.modelFiles.name }).from(s.modelFiles).where(and(eq(s.modelFiles.hash, sha), isNull(s.modelFiles.deletedAt))).limit(1);
  let modelId = i.modelFileId; let number = 1;
  if (!modelId) {
    const base = i.filename.replace(/\.[^.]+$/, '');
    const [m] = await db.insert(s.modelFiles).values({
      workspaceId: WORKSPACE_ID, name: base, folder: (await (await import('./library/folders')).ensureFolder(i.folder, db)), tags: i.tags ?? [], format: ext, hash: sha, customerId: i.customerId ?? null,
      origin: i.origin ?? null, license: i.license ?? 'propia', author: i.author ?? null, createdBy: i.userId ?? null,
    }).returning({ id: s.modelFiles.id });
    modelId = m.id;
  } else {
    const [mx] = await db.select({ n: sql<number>`coalesce(max(${s.fileVersions.number}),0)` }).from(s.fileVersions).where(eq(s.fileVersions.modelFileId, modelId));
    number = Number(mx.n) + 1;
  }
  const [v] = await db.insert(s.fileVersions).values({
    workspaceId: WORKSPACE_ID, modelFileId: modelId, number, storageKey: key, format: ext, size, sha256: sha, comment: i.comment ?? null,
    meta: { status: 'processing' }, createdBy: i.userId ?? null,
  }).returning({ id: s.fileVersions.id });
  await db.update(s.modelFiles).set({ currentVersionId: v.id, hash: sha, format: ext, updatedAt: new Date() }).where(eq(s.modelFiles.id, modelId));
  await (await import('./library/connectors/managed')).registerManagedVersion(v.id);
  await audit('model_file', modelId, number === 1 ? 'crear' : 'nueva_version', { filename: i.filename, version: number }, i.userId);
  // el análisis va a la cola persistente (reintenta y sobrevive a reinicios); en modo sync se espera su resultado
  const { enqueueJob, runJobNow } = await import('./jobs');
  const jobId = await enqueueJob('file.process', { versionId: v.id }, { userId: i.userId, claimed: i.sync });
  if (i.sync) await runJobNow(jobId, { claimed: true });
  return { modelFileId: modelId, versionId: v.id, version: number, duplicateOf: dup && dup.id !== modelId ? dup : null };
}

/** Análisis: dimensiones, volumen, malla cerrada, miniatura, vista previa y metadatos del laminador. */
export async function processVersion(versionId: string) {
  const t = await getT();
  const db = await getDb();
  const [v] = await db.select().from(s.fileVersions).where(eq(s.fileVersions.id, versionId));
  if (!v) return;
  const localKey = await (await import('./library/content')).ensureVersionLocal(versionId, false);
  const ext = v.format; const buf = kindOfExt(ext)==='malla'&&!['obj','gltf'].includes(ext)?new Uint8Array():new Uint8Array(await getBuffer(localKey));
  const dependencies=await (await import('./library/dependencies')).recordDependencies(versionId,buf,v.format);
  const meta: Record<string, any> = { ...(v.meta ?? {}), ...(dependencies?{dependencies}:{}), status: 'ready', kind: kindOfExt(ext) }; delete meta.error;
  const t0 = Date.now();
  let thumbKey: string | null = null;
  const mfUpdate: Partial<typeof s.modelFiles.$inferInsert> = {};
  if (meta.kind === 'malla') {
    const rendered=await (await import('./library/render-worker')).isolatedMesh(absPath(localKey),ext);
    const a=rendered.analysis;meta.analysis=a;meta.previewKey=rendered.previewKey;meta.decimated=rendered.decimated;meta.render={...rendered.render,hash:v.sha256};thumbKey=rendered.thumbKey;if(rendered.turnKey)meta.turnKey=rendered.turnKey;
    Object.assign(meta,rendered.extra||{});if(rendered.plates)meta.plates=rendered.plates;if(rendered.gcodePreviewKey)meta.gcodePreviewKey=rendered.gcodePreviewKey;
    Object.assign(mfUpdate, { dimX: a.dimX, dimY: a.dimY, dimZ: a.dimZ, volumeCm3: a.volumeCm3, areaCm2: a.areaCm2, triangles: a.triangles, closed: a.closed });
  } else if (meta.kind === 'gcode') {
    if (ext === 'bgcode') {
      meta.sliced = { slicer: t('files.prusaslicerBinary'), timeS: null, filaments: [], totalG: null, layers: null, layerHeight: null, maxZ: null, machine: null, notes: [t('files.binaryGCodeBgcodeRequires')] };
    } else {
      const txt = new TextDecoder().decode(buf);
      const sm = parseGcodeMeta(txt);
      meta.sliced = sm; meta.hasSlicedData = hasSlicedData(sm);
      const prev = buildGcodePreview(txt);
      meta.gcodePreviewKey = await putBuffer(newKey('preview', 'mfg'), gcodePreviewToBin(prev));
      meta.layersCount = prev.layers.length;
      const bb = prev.bbox;
      Object.assign(mfUpdate, { dimX: bb.max[0] - bb.min[0], dimY: bb.max[1] - bb.min[1], dimZ: bb.max[2] });
      thumbKey = await putBuffer(newKey('thumbs', 'webp'), await gcodeTopSvgToWebp(prev));
    }
  } else if (meta.kind === 'imagen' && ext !== 'pdf' && ext !== 'svg') {
    thumbKey = await putBuffer(newKey('thumbs', 'webp'), await sharp(Buffer.from(buf)).rotate().resize(480, 360, { fit: 'inside' }).webp({ quality: 80 }).toBuffer());
  }
  if(dependencies?.incomplete)meta.status='partial';
  meta.processMs = Date.now() - t0;
  await db.update(s.fileVersions).set({ meta, thumbKey, updatedAt: new Date() }).where(eq(s.fileVersions.id, versionId));
  // un reanálisis deja archivos nuevos: los de la pasada anterior se borran (nadie más los usa)
  const prevMeta = (v.meta ?? {}) as Record<string, any>;
  for (const k of [prevMeta.previewKey, prevMeta.turnKey, prevMeta.gcodePreviewKey, v.thumbKey]) if (typeof k === 'string' && k && ![meta.previewKey, meta.turnKey, meta.gcodePreviewKey, thumbKey].includes(k)) await remove(k).catch(() => {});
  const [mf] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.id, v.modelFileId));
  if (mf?.currentVersionId === versionId) {
    await db.update(s.modelFiles).set({ ...mfUpdate, updatedAt: new Date() }).where(eq(s.modelFiles.id, v.modelFileId));
    await (await import('./library/auto')).autoTagFile(v.modelFileId).catch(() => []);
  }
}

async function gcodeTopSvgToWebp(p: ReturnType<typeof buildGcodePreview>) {
  const W = 480, H = 360;
  const { min, max } = p.bbox; const w = max[0] - min[0] || 1, h = max[1] - min[1] || 1;
  const sc = Math.min((W * 0.84) / w, (H * 0.84) / h);
  const ox = (W - w * sc) / 2 - min[0] * sc, oy = (H + h * sc) / 2 + min[1] * sc;
  const colors = ['#1d62f0', '#9aa7b8', '#2fb170', '#e0853a', '#888'];
  let paths = '';
  const step = Math.max(1, Math.floor(p.layers.length / 10));
  for (let li = 0; li < p.layers.length; li += step) {
    for (const [ti, off, cnt] of p.layers[li].t) {
      if (ti === 1 && li % (step * 4) !== 0) continue;
      let d = '';
      for (let k = 0; k < cnt; k++) { const o = (off + k) * 4; d += `M${(p.segments[o] * sc + ox).toFixed(1)} ${(-p.segments[o + 1] * sc + oy).toFixed(1)}L${(p.segments[o + 2] * sc + ox).toFixed(1)} ${(-p.segments[o + 3] * sc + oy).toFixed(1)}`; }
      if (d) paths += `<path d="${d}" stroke="${colors[ti]}" stroke-width="1" fill="none" stroke-opacity="0.55"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#f2f4f8"/>${paths}</svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
}

export async function currentVersion(modelFileId: string) {
  const db = await getDb();
  const [m] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.id, modelFileId));
  if (!m?.currentVersionId) return null;
  const [v] = await db.select().from(s.fileVersions).where(eq(s.fileVersions.id, m.currentVersionId));
  return v ?? null;
}

/** Ruta absoluta del archivo de una versión (para el laminador). */
export const versionPath = (storageKey: string) => absPath(storageKey);


/** Límites de un ZIP de modelos: cantidad de archivos y tamaño total descomprimido. */
export const ZIP_LIMITS = { files: 200, totalBytes: 1.5 * 1024 * 1024 * 1024 };
/**
 * Descomprime un .zip de modelos y crea un modelo por cada archivo compatible; la estructura de carpetas pasa a `folder`.
 * Ignora carpetas del sistema (`__MACOSX`, archivos ocultos) y entradas con rutas peligrosas.
 */
export async function ingestZip(i: { tmpPath: string; filename: string; userId?: string | null; folder?: string | null; tags?: string[]; customerId?: string | null; importId?:string }) {
  const { unzipSync } = await import('fflate'); const os = await import('node:os'); const path = await import('node:path'); const crypto = await import('node:crypto');
  const t = await getT();
  const zip = new Uint8Array(await fsp.readFile(i.tmpPath));
  let total = 0; let count = 0;
  const entries = unzipSync(zip, { filter: (f) => {
    const n = f.name.replace(/\\/g, '/');
    if (n.endsWith('/') || n.split('/').some((p) => p === '..' || p.startsWith('.') || p === '__MACOSX') || n.startsWith('/') || ![...MODEL_EXT,'mtl','bin','txt','md','json'].includes(extOf(n))) return false;
    if (++count > ZIP_LIMITS.files) throw new Error(t('files.zipTooMany', { n: ZIP_LIMITS.files }));
    total += f.originalSize; if (total > ZIP_LIMITS.totalBytes) throw new Error(t('files.zipTooBig'));
    return true;
  } });
  const names = Object.keys(entries).filter(n=>MODEL_EXT.includes(extOf(n)));  if (!names.length) throw new Error(t('files.zipEmpty'));
  const created: Array<{ modelFileId: string; name: string }> = []; const failed: string[] = [];
  for (const name of names) {
    const clean = name.replace(/\\/g, '/'); const parts = clean.split('/'); const file = parts.pop()!; const sub = parts.join('/');
    const tmp = path.join(os.tmpdir(), `${crypto.randomUUID()}-${file.replace(/[^\w.-]/g, '_')}`);
    try {
      await fsp.writeFile(tmp, entries[name]);
      const folder = [i.folder, sub].filter(Boolean).join('/') || null;
      const db=await getDb();let deterministic:string|undefined;
      if(i.importId){const hash=crypto.createHash('sha256').update(i.importId+'|'+clean).digest('hex');deterministic=hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-8'+hash.slice(17,20)+'-'+hash.slice(20,32);const [existing]=await db.select().from(s.fileVersions).where(eq(s.fileVersions.modelFileId,deterministic));if(existing){created.push({modelFileId:deterministic,name:file});await fsp.rm(tmp,{force:true});continue;}await db.insert(s.modelFiles).values({id:deterministic,workspaceId:WORKSPACE_ID,name:file.replace(/\.[^.]+$/,''),folder,license:'desconocida',createdBy:i.userId}).onConflictDoNothing();}
      const r = await ingestModel({ tmpPath: tmp, filename: file, modelFileId:deterministic,userId: i.userId, folder, tags: i.tags, customerId: i.customerId,license:'desconocida' });
      const {dependencyNames}=await import('./library/dependencies');
      const refs=dependencyNames(entries[name],extOf(name));
      for(const ref of refs){const key=path.posix.join(sub,ref);const data=entries[key];await db.insert(s.libraryAssets).values({workspaceId:WORKSPACE_ID,modelId:r.modelFileId,versionId:r.versionId,role:'dependency',name:ref,storageKey:data?await putBuffer(newKey('attachments',extOf(ref)),data):null,data:{missing:!data,archive:i.filename}});}
      for(const [resource,bytes]of Object.entries(entries)){if(MODEL_EXT.includes(extOf(resource))||refs.includes(resource))continue;if(resource.startsWith(sub?sub+'/':''))await db.insert(s.libraryAssets).values({workspaceId:WORKSPACE_ID,modelId:r.modelFileId,versionId:r.versionId,role:extOf(resource)==='mtl'||extOf(resource)==='bin'?'dependency':'instructions',name:resource,storageKey:await putBuffer(newKey('attachments',extOf(resource)),bytes),data:{archive:i.filename}});}

      created.push({ modelFileId: r.modelFileId, name: file });
    } catch { failed.push(file); await fsp.rm(tmp, { force: true }); }
  }
  await fsp.rm(i.tmpPath, { force: true });
  return { zip: true as const, created: created.length, failed, modelFileId: created[0]?.modelFileId ?? null, models: created };
}


/**
 * Vuelve a analizar las versiones que quedaron en «processing» (el servidor se reinició a mitad del análisis).
 * Se llama una vez al arrancar el proceso; las que fallan quedan marcadas con su error en vez de «procesando» para siempre.
 */
export async function recoverPendingVersions(): Promise<number> {
  const db = await getDb();
  const rows = await db.select({ id: s.fileVersions.id }).from(s.fileVersions).where(and(isNull(s.fileVersions.deletedAt), sql`${s.fileVersions.meta}->>'status' = 'processing'`));
  // los que ya tienen un trabajo vivo en la cola los atiende el worker
  const live = new Set((await db.select({ p: s.jobs.payload }).from(s.jobs).where(and(eq(s.jobs.kind, 'file.process'), inArray(s.jobs.status, ['queued', 'running'])))).map((j) => String((j.p as any)?.versionId)));
  for (const r of rows.filter((x) => !live.has(x.id))) {
    try { await processVersion(r.id); }
    catch (e) { await db.update(s.fileVersions).set({ meta: { status: 'error', error: (e as Error).message } }).where(eq(s.fileVersions.id, r.id)); }
  }
  return rows.filter((x) => !live.has(x.id)).length;
}
