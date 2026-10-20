import {it,expect} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import {webdavConnector} from '@/lib/library/connectors/webdav';
it('desktop agent authenticates, exposes one root and rejects symlinks and writes',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mf-agent-'));const password=crypto.randomBytes(24).toString('hex');await fs.writeFile(path.join(root,'part.stl'),'synthetic');await fs.symlink('/etc/passwd',path.join(root,'outside.stl'));const child=spawn('python3',['scripts/library-agent.py','--root',root,'--port','0'],{env:{...process.env,LIBRARY_AGENT_PASSWORD:password},stdio:['ignore','pipe','pipe']});
 try{const port=await new Promise<number>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Agent startup timeout')),10000);child.stdout.on('data',data=>{const m=String(data).match(/127\.0\.0\.1:(\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]));}});child.on('error',reject);});const endpoint=`http://127.0.0.1:${port}/`;expect((await fetch(endpoint)).status).toBe(401);const c=await webdavConnector({endpoint,privateNetwork:true},{username:'agent',password});expect(c.capabilities.upload).toBe(false);expect((await c.list('')).entries.map(x=>x.name)).toEqual(['part.stl']);const stream=await c.read('part.stl');let text='';for await(const chunk of stream)text+=chunk.toString();expect(text).toBe('synthetic');await expect(c.read('outside.stl')).rejects.toThrow();await expect(c.read('../passwd')).rejects.toThrow();await c.close();}finally{child.kill();await fs.rm(root,{recursive:true,force:true});}
});
