'use client';
import {RestoreTrash,CompleteImport,CancelOperation} from './library-advanced';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useT } from '@/i18n/client';
import { createLibrarySource, sourceCommand, cancelLibraryScan, planLibraryOperation, confirmLibraryOperation, importLibraryUrl, processLibraryVersion, reconnectSource, associateLibraryPhoto, suggestLibraryMetadata, reviewLibraryMetadata, linkLibraryDuplicate } from '@/actions/library';
import type { MessageKey } from '@/i18n/translate';
export function LibraryManager({ sources, scans, operations, entries, selected, parent }: {
    sources: any[];
    scans: any[];
    operations: any[];
    entries: any[];
    selected?: string;
    parent?: string;
}) {
    const t = useT(), router = useRouter();
    const [kind, setKind] = useState('local');
    const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [plan, setPlan] = useState<any>(null), [edit, setEdit] = useState<string>('');
    const run = async (fn: () => Promise<any>) => { setBusy(true); setMessage(''); try {
        const r = await fn();
        if (!r.ok)
            setMessage(r.error);
        else
            router.refresh();
        return r;
    }
    catch (e) {
        setMessage(String(e));
    }
    finally {
        setBusy(false);
    } };
    useEffect(() => { if (!scans.some(s => ['queued', 'running'].includes(s.status)) && !operations.some(o => ['queued', 'running'].includes(o.status)))
        return; const timer = setInterval(() => router.refresh(), 3000); return () => clearInterval(timer); }, [scans, operations, router]);
    const field = (name: string, label: string, password = false, required = false) => <label className="block" key={name}><span className="label">{label}</span><input className="input" name={name} type={password ? 'password' : 'text'} required={required} autoComplete={password ? 'new-password' : 'off'}/></label>;
    const formFields = (k: string) => <>
    <label><input type="checkbox" name="allowAi"/> {t('library.allowAi')}</label><label><input type="checkbox" name="analyzeOnScan"/> {t('library.analyzeOnScan')}</label>{field('scanIntervalMinutes', t('library.scanInterval'))}
    {k === 'local' && <p className="text-xs muted">LIBRARY_LOCAL_ROOTS · /sources (pruebas)</p>}
    {field('root', t('library.root'), false, k === 'local' || k === 'drive')}
    {['ftp', 'ftps', 'sftp'].includes(k) && <>{field('host', t('library.host'), false, true)}{field('port', t('library.port'))}</>}
    {['webdav', 's3'].includes(k) && field('endpoint', t('library.endpoint'), false, k === 'webdav')}
    {['ftp', 'ftps', 'sftp', 'webdav'].includes(k) && <>{field('username', t('library.username'), false, true)}{field('password', t('library.password'), true)}</>}
    {k === 'sftp' && field('hostFingerprint', t('library.fingerprint'), false, true)}
    {['drive', 'onedrive', 'dropbox'].includes(k) && <>{field('accessToken', t('library.token'), true)}{field('refreshToken', t('library.refreshToken'), true)}{field('clientId', t('library.clientId'))}{field('clientSecret', t('library.clientSecret'), true)}</>}
    {k === 'onedrive' && <>{field('driveId', t('library.driveId'))}{field('tenant', t('library.tenant'))}</>}
    {k === 's3' && <>{field('bucket', t('library.bucket'), false, true)}{field('region', t('library.region'))}{field('accessKeyId', t('library.accessKey'), true, true)}{field('secretAccessKey', t('library.secretKey'), true, true)}</>}
    {k === 'webdav' && <label><input type="checkbox" name="privateNetwork"/> {t('library.privateNetwork')}</label>}
  </>;
    const submit = async (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const form = e.currentTarget; const data = new FormData(form); const secret: Record<string, string> = {}, config: Record<string, any> = {}; const secrets = ['username', 'password', 'hostFingerprint', 'accessToken', 'refreshToken', 'clientId', 'clientSecret', 'accessKeyId', 'secretAccessKey']; data.forEach((v, k) => { if (secrets.includes(k)) {
        if (v)
            secret[k] = String(v);
    }
    else if (!['name', 'kind'].includes(k))
        config[k] = ['privateNetwork', 'allowAi', 'analyzeOnScan'].includes(k) ? v === 'on' : String(v); }); const r = await run(() => edit ? reconnectSource(edit, secret) : createLibrarySource({ name: data.get('name'), kind, config, secret })); if (r?.ok) {
        form.reset();
        setEdit('');
    } };
    return <div className="space-y-5">
    {message && <p role="alert" className="box-danger p-3 rounded">{message}</p>}
    <details className="card p-4" open={edit ? true : undefined}><summary className="font-semibold cursor-pointer">{edit ? t('library.connectAgain') : t('library.newSource')}</summary><form className="grid gap-3 sm:grid-cols-2 mt-4" onSubmit={submit}>
      {!edit && <>{field('name', t('library.name'), false, true)}<label><span className="label">{t('library.type')}</span><select className="input" value={kind} onChange={e => setKind(e.target.value)}>{['local', 'drive', 'ftp', 'ftps', 'sftp', 'webdav', 's3', 'onedrive', 'dropbox'].map(k => <option key={k}>{k}</option>)}</select></label></>}
      {formFields(kind)}<p className="text-sm muted sm:col-span-2">{t('library.shared')} · {t('library.readOnly')}</p><button className="btn-primary" disabled={busy}>{t('library.save')}</button>{edit && <button type="button" className="btn-ghost" onClick={() => setEdit('')}>{t('library.cancel')}</button>}
    </form></details>
    <div className="grid gap-3 lg:grid-cols-2">{sources.map(src => <article className="card p-4 space-y-2" key={src.id}><h2 className="font-semibold">{src.name} <span className="badge">{src.kind}</span></h2><p className="text-sm">{src.status} · {src.writable ? t('library.write') : t('library.readOnly')}</p><p className="text-xs muted">{t('library.lastScan')}: {src.lastScanAt ? new Date(src.lastScanAt).toLocaleString() : t('library.never')}</p>{src.error && <p className="text-sm text-red-600">{src.error}</p>}<div className="flex gap-2 flex-wrap">
      {(['test', 'scan', src.enabled ? 'pause' : 'resume', src.writable ? 'readonly' : 'write'] as const).map(cmd => <button key={cmd} disabled={busy} className="btn-ghost btn-sm" onClick={() => run(() => sourceCommand(src.id, cmd))}>{t(`library.${cmd === 'readonly' ? 'readOnly' : cmd}` as MessageKey)}</button>)}<Link className="btn-ghost btn-sm" href={`/archivos/fuentes?source=${src.id}`}>{t('library.browse')}</Link>{src.kind !== 'local' && <button className="btn-ghost btn-sm" onClick={() => { setEdit(src.id); setKind(src.kind); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{t('library.connectAgain')}</button>}
    </div></article>)}</div>
    {selected && <section className="card p-4 space-y-3"><h2 className="font-semibold">{t('library.browse')} · {sources.find(s => s.id === selected)?.name} · {parent || '/'}</h2><Link href={`/archivos/fuentes?source=${selected}`} className="btn-ghost btn-sm">/</Link><div className="overflow-auto"><table className="w-full text-sm"><thead><tr><th>{t('library.name')}</th><th>{t('library.state')}</th><th>{t('library.format')}</th></tr></thead><tbody>{entries.map(e => <tr key={e.id} className="border-b"><td className="py-2">{e.directory ? <Link href={`/archivos/fuentes?source=${selected}&parent=${encodeURIComponent(e.remoteId)}`}>📁 {e.name}</Link> : e.modelId ? <Link href={`/archivos/${e.modelId}`}>{e.name}</Link> : e.name}</td><td>{e.state}</td><td>{e.size} B</td></tr>)}</tbody></table></div>
      <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const entry = entries.find(e => e.id === f.get('entry')); const input = { kind: f.get('kind'), sourceId: selected, entryId: entry?.id, name: f.get('name'), parent: String(f.get('parent') || ''), destinationId: String(f.get('destination') || selected) }; const r = await run(() => planLibraryOperation(input)); if (r?.ok)
            setPlan(r.data); }}>
        <select className="input sm:!w-44" name="kind">{['rename', 'mkdir', 'copy', 'move', 'trash'].map(k => <option key={k} value={k}>{t(`library.${k}` as MessageKey)}</option>)}</select>
        <select className="input sm:!w-48" name="entry"><option value="">—</option>{entries.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select><input name="name" required className="input sm:!w-48" placeholder={t('library.newName')}/>
        <select name="destination" className="input sm:!w-44" defaultValue={selected}>{sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><input name="parent" className="input sm:!w-44" defaultValue={parent || ''} placeholder={t('library.parent')}/><button className="btn-ghost" disabled={busy}>{t('library.plan')}</button>
      </form>{plan && <div role="alertdialog" aria-label={t('library.confirm')} className="rounded border border-amber-400 p-4 space-y-2"><p>{t('library.effects')}</p><p>{plan.kind}: {plan.input.displayPath || '/'} → {plan.input.destinationName} / {plan.input.name}</p><button className="btn-primary" disabled={busy} onClick={async () => { const r = await run(() => confirmLibraryOperation(plan.id)); if (r?.ok)
            setPlan(null); }}>{t('library.confirm')}</button><button className="btn-ghost" onClick={() => setPlan(null)}>{t('library.cancel')}</button></div>}
    </section>}
    <section className="card p-4"><h2 className="font-semibold mb-3">{t('library.activity')}</h2><ul className="space-y-2 text-sm">{scans.map(scan => <li key={scan.id}>{sources.find(s => s.id === scan.sourceId)?.name} · {scan.status} · {scan.count} {t('library.entries')} {scan.error && <span className="text-red-600">{scan.error}</span>} {['queued', 'running'].includes(scan.status) && <button className="btn-ghost btn-sm" disabled={busy} onClick={() => run(() => cancelLibraryScan(scan.id))}>{t('library.cancel')}</button>}</li>)}{operations.map(op => <li key={op.id}>{op.kind} · {op.status} {op.error} {['planned','queued','running'].includes(op.status)&&<CancelOperation id={op.id}/>} {op.status==='done'&&op.result?.trashId&&<RestoreTrash id={op.id}/>} {op.status==='awaiting_file'&&<CompleteImport id={op.id}/>} {op.result?.modelId && <Link href={`/archivos/${op.result.modelId}`}>{t('library.browse')}</Link>}{op.status === 'awaiting_file' && <div className="mt-1"><p><strong>{op.result?.title}</strong></p>{op.result?.author && <p>{t('library.importAuthor')}: {op.result.author}</p>}{op.result?.license && <p>{t('library.importLicense')}: {op.result.license}</p>}<p><a href={op.result?.url} target="_blank" rel="noreferrer">{op.result?.url}</a></p><p>{op.result?.message}</p></div>}</li>)}</ul></section>
  </div>;
}
export {LibraryUrlImport} from './library-url-import';
export function LibraryProcess({ id }: {
    id: string;
}) { const t = useT(), router = useRouter(); const [busy, setBusy] = useState(false), [error, setError] = useState(''); return <div className="card p-3 mb-4"><p className="mb-2">{t('library.indexed')}</p><button className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); const r = await processLibraryVersion(id); setBusy(false); if (!r.ok)
    setError(r.error); router.refresh(); }}>{t('library.download')}</button>{error && <p role="alert">{error}</p>}</div>; }
export function LibraryPhotoAssociate({ modelId, photos }: {
    modelId: string;
    photos: {
        id: string;
        caption: string | null;
    }[];
}) { const t = useT(), router = useRouter(); const [error, setError] = useState(''); return <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const r = await associateLibraryPhoto(modelId, String(f.get('photo'))); if (!r.ok)
    setError(r.error); router.refresh(); }}><select name="photo" className="input" aria-label={t('library.photoId')}>{photos.map(p => <option key={p.id} value={p.id}>{p.caption || p.id.slice(0, 8)}</option>)}</select><button className="btn-ghost">{t('library.associate')}</button>{error && <p role="alert">{error}</p>}</form>; }
export function SaveLibraryView({scope}:{scope:string}) {
 const t=useT(),key=`mf-library-views:${scope}`;const [views,setViews]=useState<Record<string,string>>({});
 useEffect(()=>{try{setViews(JSON.parse(localStorage.getItem(key)||'{}'));}catch{}},[key]);
 const save=()=>{const name=window.prompt(t('library.savedName'));if(!name?.trim())return;const next={...views,[name.trim().slice(0,80)]:location.pathname+location.search};localStorage.setItem(key,JSON.stringify(next));setViews(next);};
 return <><button className="btn-ghost" onClick={save}>{t('library.saveView')}</button>{Object.entries(views).map(([name,href])=>href.startsWith('/archivos')&&<span key={name}><Link className="btn-ghost" href={href}>{name}</Link><button aria-label={t('library.cancel')} onClick={()=>{const next={...views};delete next[name];localStorage.setItem(key,JSON.stringify(next));setViews(next);}}>×</button></span>)}</>;
}
export function LibraryMetadata({ modelId }: {
    modelId: string;
}) { const t = useT(), router = useRouter(); const [proposal, setProposal] = useState<any>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''); return <div className="card p-3 space-y-2"><button className="btn-ghost" disabled={busy} onClick={async () => { setBusy(true); const r = await suggestLibraryMetadata(modelId); setBusy(false); if (r.ok)
    setProposal(r.data);
else
    setError(r.error); }}>{t('library.suggestMetadata')}</button>{error && <p role="alert">{error}</p>}{proposal && <div><h3>{proposal.result.title}</h3><p>{proposal.result.description}</p><p>{proposal.result.category} · {proposal.result.tags.join(', ')}</p>{[true, false].map(accept => <button key={String(accept)} className="btn-ghost" onClick={async () => { const r = await reviewLibraryMetadata(proposal.id, accept); if (r.ok) {
    setProposal(null);
    router.refresh();
}
else
    setError(r.error); }}>{t(accept ? 'library.accept' : 'library.reject')}</button>)}</div>}</div>; }
export function LibraryDuplicates({ modelId, duplicates }: {
    modelId: string;
    duplicates: {
        id: string;
        name: string;
    }[];
}) { const t = useT(), router = useRouter(); const [error, setError] = useState(''); return <div className="card p-3"><h3>{t('library.duplicates')}</h3>{duplicates.map(d => <div key={d.id}><Link href={`/archivos/${d.id}`}>{d.name}</Link><button className="btn-ghost btn-sm" onClick={async () => { if (!window.confirm(t('library.linkDuplicate')))
    return; const r = await linkLibraryDuplicate(modelId, d.id); if (r.ok)
    router.push(`/archivos/${d.id}`);
else
    setError(r.error); }}>{t('library.linkDuplicate')}</button></div>)}{error && <p role="alert">{error}</p>}</div>; }
