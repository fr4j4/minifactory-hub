import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {promisify} from 'node:util';
import {newKey,putBuffer} from '../storage';
export async function isolatedMesh(input:string,ext:string){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mf-mesh-'));
 try{await promisify(execFile)(process.execPath,['--max-old-space-size=768','--import','tsx',path.join(process.cwd(),'scripts/library-mesh-worker.ts'),input,ext,dir],{timeout:120000,maxBuffer:128*1024,env:{PATH:process.env.PATH,NODE_ENV:process.env.NODE_ENV,LANG:process.env.LANG,HOME:dir}});
 const result=JSON.parse(await fs.readFile(path.join(dir,'result.json'),'utf8'));
 const previewKey=await putBuffer(newKey('preview','mfm'),await fs.readFile(path.join(dir,'preview.mfm'))),thumbKey=await putBuffer(newKey('thumbs','webp'),await fs.readFile(path.join(dir,'thumb.webp')));
 const gcode=await fs.readFile(path.join(dir,'gcode.mfg')).catch(()=>null);const gcodePreviewKey=gcode?await putBuffer(newKey('preview','mfg'),gcode):null;
 const turn=await fs.readFile(path.join(dir,'turn.webp')).catch(()=>null);const plates=result.plates?await Promise.all(result.plates.map(async(p:any)=>{const {file,...rest}=p;return {...rest,previewKey:await putBuffer(newKey('preview','mfm'),await fs.readFile(path.join(dir,file)))};})):undefined;
 return {...result,plates,gcodePreviewKey,previewKey,thumbKey,turnKey:turn?await putBuffer(newKey('thumbs','webp'),turn):null};
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
