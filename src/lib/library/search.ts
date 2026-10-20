import {and,eq,ilike,isNull,or,sql} from 'drizzle-orm';
import {s,WORKSPACE_ID} from '@/db';
import {z} from 'zod';
import type {SessionUser} from '../auth';
import {modelAccess} from './access';
import {inFolder} from './folders';
export function libraryFilters(user:SessionUser,sp:Record<string,string|undefined>){
    const conds = [modelAccess(user),eq(s.modelFiles.workspaceId, WORKSPACE_ID), sp.archived ? sql`${s.modelFiles.deletedAt} is not null` : isNull(s.modelFiles.deletedAt)];
    if(sp.sources){const ids=sp.sources.split(',').filter(x=>z.uuid().safeParse(x).success);if(ids.length)conds.push(sql`exists(select 1 from library_entries le where le.model_id=${s.modelFiles.id} and le.source_id in (select jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)::uuid))`);}
    if(sp.formats)conds.push(sql`${s.modelFiles.format} in (select jsonb_array_elements_text(${JSON.stringify(sp.formats.split(','))}::jsonb))`);
    if(sp.anyTags)conds.push(sql`${s.modelFiles.tags} ?| array(select jsonb_array_elements_text(${JSON.stringify(sp.anyTags.split(',').map(x=>x.trim()))}::jsonb))`);
    if (sp.q) {
        const q = '%' + sp.q.slice(0, 200) + '%';
        conds.push(or(sql`translate(lower(${s.modelFiles.name}),'áéíóúüñ','aeiouun') like translate(lower(${q}),'áéíóúüñ','aeiouun')`, ilike(s.modelFiles.origin, q), ilike(s.modelFiles.author, q), sql `${s.fileVersions.meta}->>'libraryDescription' ilike ${q}`, sql`exists(select 1 from library_details ld where ld.model_id=${s.modelFiles.id} and ld.data::text ilike ${q})`, sql `${s.modelFiles.tags}::text ilike ${q}`, sql `exists(select 1 from library_entries le where le.model_id=${s.modelFiles.id} and le.path ilike ${q})`)!);
    }
    if (sp.tag)
        conds.push(sql `${s.modelFiles.tags} @> ${JSON.stringify([sp.tag])}::jsonb`);
    if (sp.folder)
        conds.push(inFolder(sp.folder));
    if (sp.fav)
        conds.push(eq(s.modelFiles.favorite, true));
    if (sp.format)
        conds.push(eq(s.modelFiles.format, sp.format));
    if (sp.license)
        conds.push(eq(s.modelFiles.license, sp.license));
    if (sp.source === 'internal')
        conds.push(sql `not exists(select 1 from library_entries le join library_sources ls on ls.id=le.source_id where le.model_id=${s.modelFiles.id} and ls.kind<>'managed-local')`);
    else if (sp.source && z.uuid().safeParse(sp.source).success)
        conds.push(sql `exists(select 1 from library_entries le where le.model_id=${s.modelFiles.id} and le.source_id=${sp.source}::uuid)`);
    if (sp.state === 'missing')
        conds.push(sql `exists(select 1 from library_entries le where le.model_id=${s.modelFiles.id} and le.state='missing')`);
    if (sp.state === 'local')
        conds.push(sql `${s.fileVersions.storageKey} <> ''`);
    if (sp.state === 'remote')
        conds.push(eq(s.fileVersions.storageKey, ''));
    if (sp.photo)
        conds.push(sql `exists(select 1 from photos p where p.model_file_id=${s.modelFiles.id} and p.deleted_at is null)`);
    if (sp.turn)
        conds.push(sql `${s.fileVersions.meta}->>'turnKey' is not null`);
    if (sp.collection && z.uuid().safeParse(sp.collection).success)
        conds.push(sql `exists(select 1 from library_collection_models cm where cm.model_id=${s.modelFiles.id} and cm.collection_id=${sp.collection}::uuid)`);
    const number = (k: string) => sp[k] !== undefined && Number.isFinite(Number(sp[k])) && Number(sp[k]) >= 0 ? Number(sp[k]) : undefined;
    const min = number('min'), max = number('max'), dim = number('dimension');
    if (min !== undefined)
        conds.push(sql `${s.fileVersions.size} >= ${min * 1048576}`);
    if (max !== undefined)
        conds.push(sql `${s.fileVersions.size} <= ${max * 1048576}`);
    if (dim !== undefined)
        conds.push(sql `greatest(${s.modelFiles.dimX},${s.modelFiles.dimY},${s.modelFiles.dimZ}) <= ${dim}`);
    if(sp.allTags)conds.push(sql`${s.modelFiles.tags} @> ${JSON.stringify(sp.allTags.split(',').map(x=>x.trim()).filter(Boolean))}::jsonb`);
    if(sp.closed==='yes')conds.push(eq(s.modelFiles.closed,true));
    if(sp.closed==='no')conds.push(eq(s.modelFiles.closed,false));
    if(sp.closed==='unknown')conds.push(isNull(s.modelFiles.closed));
    if(sp.processing)conds.push(sql`${s.fileVersions.meta}->>'status'=${sp.processing}`);
    if(sp.incomplete)conds.push(sql`${s.fileVersions.meta}->'dependencies'->>'incomplete'='true'`);
    if(sp.project)conds.push(sql`exists(select 1 from library_details ld where ld.model_id=${s.modelFiles.id} and ld.data->>'project'=${sp.project})`);
    if(sp.category)conds.push(sql`exists(select 1 from library_details ld where ld.model_id=${s.modelFiles.id} and ld.data->>'category'=${sp.category})`);
    if(sp.createdAfter&&Number.isFinite(Date.parse(sp.createdAfter)))conds.push(sql`${s.modelFiles.createdAt}>=${sp.createdAfter}::timestamptz`);
    if(sp.createdBefore&&Number.isFinite(Date.parse(sp.createdBefore)))conds.push(sql`${s.modelFiles.createdAt}<${sp.createdBefore}::date+interval '1 day'`);
    for(const [key,field,comparison]of [['trianglesMin',s.modelFiles.triangles,'>='],['trianglesMax',s.modelFiles.triangles,'<='],['volumeMin',s.modelFiles.volumeCm3,'>='],['volumeMax',s.modelFiles.volumeCm3,'<='],['dimX',s.modelFiles.dimX,'<='],['dimY',s.modelFiles.dimY,'<='],['dimZ',s.modelFiles.dimZ,'<=']] as const){const n=number(key);if(n!==undefined)conds.push(sql`${field} ${sql.raw(comparison)} ${n}`);}
    if(sp.used)conds.push(sql`exists(select 1 from quote_item_models qm where qm.model_file_id=${s.modelFiles.id})`);
    if(sp.multicolor)conds.push(sql`${s.fileVersions.meta}->'ams'->>'multicolor'='true'`);
    if(sp.fits&&z.uuid().safeParse(sp.fits).success)conds.push(fitsMachine(sql`${sp.fits}::uuid`));
    if(sp.author)conds.push(ilike(s.modelFiles.author,'%'+sp.author+'%'));
    if(sp.customer&&z.uuid().safeParse(sp.customer).success)conds.push(eq(s.modelFiles.customerId,sp.customer));
    if(sp.physical)conds.push(sql`exists(select 1 from library_entries le where le.model_id=${s.modelFiles.id} and le.path like ${sp.physical+'%'})`);
    return conds;
}

/** El modelo cabe en la máquina (compara las medidas ordenadas de mayor a menor, así que admite rotarlo). Los G-code quedan fuera: ya están laminados para una máquina. */
export function fitsMachine(machineId: ReturnType<typeof sql>) {
    const x = s.modelFiles.dimX, y = s.modelFiles.dimY, z = s.modelFiles.dimZ;
    return sql`(${x} is not null and ${y} is not null and ${z} is not null and coalesce(${s.modelFiles.format},'') not in ('gcode','bgcode','gco') and exists(select 1 from machines fm where fm.id=${machineId} and greatest(${x},${y},${z})<=greatest(fm.vol_x,fm.vol_y,fm.vol_z) and least(${x},${y},${z})<=least(fm.vol_x,fm.vol_y,fm.vol_z) and (${x}+${y}+${z}-greatest(${x},${y},${z})-least(${x},${y},${z}))<=(fm.vol_x+fm.vol_y+fm.vol_z-greatest(fm.vol_x,fm.vol_y,fm.vol_z)-least(fm.vol_x,fm.vol_y,fm.vol_z))))`;
}
