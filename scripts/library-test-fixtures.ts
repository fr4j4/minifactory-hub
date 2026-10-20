/** Explicitly limited to the isolated compose database. Never copies workshop data. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
async function main(){const url=new URL(process.env.DATABASE_URL||'http://invalid');if(process.env.MF_TEST_DEPLOYMENT!=='1'||url.hostname!=='db'||url.pathname!=='/library_test'||process.env.STORAGE_DIR!=='/data/storage')throw new Error('Only library-test compose is permitted');
 const {getDb,s}=await import('../src/db');const {saveSource,startScan}=await import('../src/lib/library/catalog');const db=await getDb();const [user]=await db.select().from(s.users).where(eq(s.users.email,'biblioteca-test@minifactory.local'));if(!user)throw new Error('Test administrator is not initialized');
 for(const dir of ['entrada','destino'])await fs.mkdir('/sources/'+dir,{recursive:true});
 const stl=['solid cube'];const p=[[0,0,0],[20,0,0],[20,20,0],[0,20,0],[0,0,20],[20,0,20],[20,20,20],[0,20,20]];const faces=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];for(const face of faces){stl.push('facet normal 0 0 0','outer loop');for(const i of face)stl.push('vertex '+p[i].join(' '));stl.push('endloop','endfacet');}stl.push('endsolid cube');await fs.writeFile('/sources/entrada/cubo-prueba.stl',stl.join('\n'));
 for(const [name,root] of [['Entrada de pruebas','/sources/entrada'],['Destino de pruebas','/sources/destino']]){const [exists]=await db.select().from(s.librarySources).where(eq(s.librarySources.name,name));const id=exists?.id||await saveSource({name,kind:'local',config:{root,analyzeOnScan:true},writable:true},user.id);await startScan(id,user.id);}
 console.log('Synthetic test sources ready. No production data copied.');}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
