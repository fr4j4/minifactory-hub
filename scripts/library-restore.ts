/** Offline restore into a NEW directory. Never opens the deployment DATABASE_URL. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createReadStream,createWriteStream} from 'node:fs';
import {Unzip,UnzipInflate} from 'fflate';
import {once} from 'node:events';
async function main(){
const args=process.argv.slice(2),file=args[0],target=args[1];
if(!file||!target)throw new Error('Usage: npx tsx scripts/library-restore.ts backup.zip NEW_EMPTY_DIRECTORY');
const root=path.resolve(target);if(await fs.stat(root).then(()=>true,()=>false))throw new Error('Destination must not exist');
if(root==='/'||root===process.cwd()||root.startsWith(path.resolve('data')+path.sep))throw new Error('Use a new recovery directory outside deployment data');
process.env.DATABASE_URL='';process.env.PGLITE_DIR=path.join(root,'database');process.env.STORAGE_DIR=path.join(root,'storage');process.env.DATA_DIR=root;process.env.MF_EXTERNAL_WORKER='1';
await fs.mkdir(root,{recursive:true,mode:0o700});const unpack=path.join(root,'export');await fs.mkdir(unpack);
let total=0,count=0,error:Error|undefined;const pending:Promise<void>[]=[];
const unzip=new Unzip(entry=>{const name=entry.name;if(name.startsWith('/')||name.includes('\\')||name.split('/').some(p=>p==='..'||p==='.')||!(/^(datos|archivos)\//.test(name)||name==='MANIFIESTO.json')){error=new Error('Unsafe archive entry');return;}
 if(++count>100000){error=new Error('Too many archive entries');return;}if(name.endsWith('/'))return;
 const dest=path.join(unpack,name);const promise=(async()=>{await fs.mkdir(path.dirname(dest),{recursive:true});const out=createWriteStream(dest,{flags:'wx'});let chain=Promise.resolve();const completed=new Promise<void>((resolve,reject)=>{out.on('error',reject);entry.ondata=(err,data,final)=>{if(err){reject(err);return;}total+=data.length;if(total>20*1024**3){reject(new Error('Restore exceeds 20 GiB limit'));entry.terminate();return;}chain=chain.then(async()=>{if(!out.write(data))await once(out,'drain');if(final){out.end();await once(out,'finish');resolve();}}).catch(reject);};});entry.start();await completed;})();pending.push(promise);});unzip.register(UnzipInflate);
try{for await(const chunk of createReadStream(file,{highWaterMark:64*1024})){unzip.push(new Uint8Array(chunk));if(error)throw error;}unzip.push(new Uint8Array(),true);await Promise.all(pending);const manifest=JSON.parse(await fs.readFile(path.join(unpack,'MANIFIESTO.json'),'utf8'));if(manifest.format!==2)throw new Error('Unsupported backup format');
 for(const item of manifest.inventory||[]){if(!item.name.startsWith('archivos/')||item.name.includes('..'))throw new Error('Invalid inventory path');const h=crypto.createHash('sha256');let size=0;for await(const chunk of createReadStream(path.join(unpack,item.name))){h.update(chunk);size+=chunk.length;}if(h.digest('hex')!==item.sha256||size!==item.bytes)throw new Error('Backup integrity mismatch: '+item.name);}
 const {getDb,schema}=await import('../src/db');const {is,Table,getTableName,eq}=await import('drizzle-orm');const {getTableConfig}=await import('drizzle-orm/pg-core');const db=await getDb();const tables=Object.values(schema).filter(t=>is(t,Table)) as any[];const done=new Set<string>();let remaining=[...tables];
 while(remaining.length){const ready=remaining.filter(t=>getTableConfig(t).foreignKeys.every(f=>{const ref=getTableName(f.reference().foreignTable);return ref===getTableName(t)||done.has(ref);}));if(!ready.length)throw new Error('Unresolved table dependency');for(const table of ready){const name=getTableName(table);const rows=await fs.readFile(path.join(unpack,'datos',name+'.json'),'utf8').then(JSON.parse).catch(()=>[]);const columns=getTableConfig(table).columns;for(const row of rows){for(const col of columns){const key=Object.keys(table).find(k=>table[k]===col);if(key&&row[key]!=null&&col.dataType==='date')row[key]=new Date(row[key]);}if(name==='users'&&!row.passwordHash)row.passwordHash=await(await import('../src/lib/auth')).hashPassword(crypto.randomUUID());if(name==='library_sources'){row.secret=null;row.enabled=false;row.status='disconnected';}if(name==='jobs'&&['running','queued'].includes(row.status)){row.status='error';row.error='Restored: reconnect sources before retry';}await(db as any).insert(table).values(row).onConflictDoNothing();}done.add(name);}remaining=remaining.filter(t=>!ready.includes(t));}
 await fs.cp(path.join(unpack,'archivos'),path.join(root,'storage'),{recursive:true,errorOnExist:true}).catch(async e=>{if(e.code!=='ENOENT')throw e;});
 const {s}=await import('../src/db');const {sha256File,exists}=await import('../src/lib/storage');let verified=0,remote=0;for(const v of await db.select().from(s.fileVersions)){if(v.storageKey&&await exists(v.storageKey)){if(v.sha256&&await sha256File(path.join(root,'storage',v.storageKey))!==v.sha256)throw new Error(`Hash mismatch: ${v.id}`);verified++;}else{remote++;await db.update(s.fileVersions).set({storageKey:'',meta:{...v.meta,status:'indexed',restoreMissing:true}}).where(eq(s.fileVersions.id,v.id));}}
 const [admin]=await db.select().from(s.users).where(eq(s.users.role,'admin'));if(admin){const password=process.env.MF_RESTORE_PASSWORD||crypto.randomBytes(20).toString('base64url');await db.update(s.users).set({passwordHash:await(await import('../src/lib/auth')).hashPassword(password),active:true}).where(eq(s.users.id,admin.id));await fs.writeFile(path.join(root,'ACCESS.txt'),`Email: ${admin.email}\nPassword: ${password}\n`,{mode:0o600});}
 await fs.writeFile(path.join(root,'RESTORE.json'),JSON.stringify({verified,missingOriginals:remote,credentials:'reconnect',accounts:'reset passwords through authorized bootstrap',completedAt:new Date().toISOString()},null,2));console.log(JSON.stringify({root,verified,missingOriginals:remote}));
}catch(e){await fs.writeFile(path.join(root,'RESTORE_FAILED.txt'),String(e));throw e;}
process.exit(0);

}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
