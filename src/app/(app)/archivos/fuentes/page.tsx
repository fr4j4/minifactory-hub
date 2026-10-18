import {SourcePolicies} from '@/components/library-advanced';
import Link from 'next/link';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { pagePerm } from '@/lib/auth';
import { getT } from '@/i18n/server';
import { PageHeader } from '@/components/ui';
import { LibraryManager } from '@/components/library-manager';
import { openSource } from '@/lib/library/catalog';
export default async function SourcesPage({ searchParams }: {
    searchParams: Promise<{
        source?: string;
        parent?: string; page?: string;
    }>;
}) {
    const user = await pagePerm('config', 'E');
    if (user.role !== 'admin')
        return null;
    const t = await getT();
    const sp = await searchParams;
    const db = await getDb();
    const raw = await db.select().from(s.librarySources).where(and(eq(s.librarySources.workspaceId, WORKSPACE_ID), isNull(s.librarySources.deletedAt))).orderBy(desc(s.librarySources.createdAt));
    const sources = raw.map(({ secret, ...rest }) => {const {changeCursor,...config}=rest.config;return {...rest,config};});
    const selected = sources.find(s => s.id === sp.source);
    let parent = sp.parent;
    if (selected && parent === undefined) {
        parent = selected.kind === 'drive' || selected.kind === 'onedrive' ? selected.config.root || 'root' : selected.kind === 'dropbox' ? selected.config.root || '' : '';
    }
    const page = Math.max(1,Math.min(100000, Number(sp.page)||1));
    const entries = selected ? await db.select().from(s.libraryEntries).where(and(eq(s.libraryEntries.sourceId, selected.id), eq(s.libraryEntries.parentId, parent || ''))).orderBy(desc(s.libraryEntries.directory), s.libraryEntries.name).limit(101).offset((page-1)*100) : [];
    const scans = await db.select().from(s.libraryScans).where(eq(s.libraryScans.workspaceId, WORKSPACE_ID)).orderBy(desc(s.libraryScans.createdAt)).limit(30);
    const operations = await db.select().from(s.libraryOperations).where(eq(s.libraryOperations.workspaceId, WORKSPACE_ID)).orderBy(desc(s.libraryOperations.createdAt)).limit(30);
    return <><PageHeader title={t('library.title')} subtitle={t('library.help')} back={{ href: '/archivos', label: t('nav.files') }}/>{selected&&<SourcePolicies source={selected}/>}<LibraryManager sources={sources} scans={scans} operations={operations.map(op=>{const {secretUrl,...input}=op.input;return {...op,input};})} entries={entries.slice(0,100)} selected={selected?.id} parent={parent}/>{selected&&<nav className="flex gap-3 mt-4">{page>1&&<Link className="btn-ghost" href={`/archivos/fuentes?${new URLSearchParams({source:selected.id,parent:parent||'',page:String(page-1)})}`}>{t('library.previous')}</Link>}{entries.length>100&&<Link className="btn-ghost" href={`/archivos/fuentes?${new URLSearchParams({source:selected.id,parent:parent||'',page:String(page+1)})}`}>{t('library.next')}</Link>}</nav>}</>;
}
