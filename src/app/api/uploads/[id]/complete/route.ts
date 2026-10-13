import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { ingestModel } from '@/lib/files';
import { ingestPhoto } from '@/lib/photos';
import { newKey, putFile } from '@/lib/storage';

/** Cierra la subida y crea lo que corresponda: modelo 3D (nuevo o versión), foto/video o adjunto. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { id } = await params; const body = await req.json().catch(() => ({}));
  const db = await getDb();
  const [u] = await db.select().from(s.uploadSessions).where(eq(s.uploadSessions.id, id));
  if (!u) return NextResponse.json({ error: 'Subida no encontrada' }, { status: 404 });
  if (u.received !== u.size) return NextResponse.json({ error: 'Subida incompleta', received: u.received }, { status: 409 });
  try {
    let result: any;
    if (body.intent === 'photo') {
      if (!can(user, 'galeria', 'C')) throw new Error('Sin permiso');
      const p = await ingestPhoto({ tmpPath: u.tmpPath, filename: u.filename, userId: user.id, stage: body.stage, orderId: body.orderId, jobId: body.jobId, modelFileId: body.modelFileId, customerId: body.customerId, productId: body.productId, materialId: body.materialId, machineId: body.machineId, caption: body.caption });
      result = { photoId: p.id };
    } else if (body.intent === 'attachment') {
      const ext = u.filename.split('.').pop() ?? 'bin';
      const key = await putFile(newKey('attachments', ext), u.tmpPath, true);
      result = { key, name: u.filename };
    } else {
      if (!can(user, 'archivos', 'C')) throw new Error('Sin permiso');
      const r = await ingestModel({ tmpPath: u.tmpPath, filename: u.filename, userId: user.id, modelFileId: body.modelFileId, comment: body.comment, customerId: body.customerId, folder: body.folder, tags: body.tags, sync: !!body.sync });
      result = r;
    }
    await db.delete(s.uploadSessions).where(eq(s.uploadSessions.id, id));
    return NextResponse.json(result);
  } catch (e) {
    await fs.rm(u.tmpPath, { force: true }); await db.delete(s.uploadSessions).where(eq(s.uploadSessions.id, id));
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
