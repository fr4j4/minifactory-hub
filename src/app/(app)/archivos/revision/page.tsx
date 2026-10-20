import Link from 'next/link';
import {and,eq,isNotNull,isNull,inArray,desc,sql} from 'drizzle-orm';
import {getDb,s} from '@/db';
import {pagePerm} from '@/lib/auth';
import {modelAccess} from '@/lib/library/access';
import {getT} from '@/i18n/server';
import {RecoveryButton} from '@/components/library-advanced';
export default async function Review(){const u=await pagePerm('archivos','V'),t=await getT(),db=await getDb();
 const archived=await db.select().from(s.modelFiles).where(and(modelAccess(u),isNotNull(s.modelFiles.deletedAt))).orderBy(desc(s.modelFiles.updatedAt)).limit(100);
 const unknown=await db.select().from(s.modelFiles).where(and(modelAccess(u),isNull(s.modelFiles.deletedAt),eq(s.modelFiles.license,'desconocida'))).limit(100);
 const ops=u.role==='admin'?await db.select().from(s.libraryOperations).where(and(eq(s.libraryOperations.workspaceId,u.workspaceId),inArray(s.libraryOperations.status,['error','partial']))).orderBy(desc(s.libraryOperations.updatedAt)).limit(100):[];
 return <div className="space-y-4"><h1 className="text-xl">{t('library.review')}</h1><Link className="btn-ghost" href="/archivos">{t('nav.files')}</Link><section className="card p-4"><h2>{t('library.archived')}</h2>{archived.map(m=><div key={m.id}>{m.name}<RecoveryButton id={m.id} kind="model"/></div>)}</section><section className="card p-4"><h2>{t('library.noLicense')}</h2>{unknown.map(m=><p key={m.id}><Link href={`/archivos/${m.id}`}>{m.name}</Link></p>)}</section><section className="card p-4"><h2>{t('library.activity')}</h2>{ops.map(op=><div key={op.id}>{op.kind} · {op.error||op.status}{['rename','mkdir','copy','move','trash','url.import'].includes(op.kind)&&<RecoveryButton kind="operation" id={op.id}/>}</div>)}</section></div>;
}
