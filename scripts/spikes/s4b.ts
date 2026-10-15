import fs from 'node:fs';import path from 'node:path';
import { orca, profiles, wr } from './lib';
(async()=>{
 const f=fs.readdirSync('/tmp').filter(x=>x.startsWith('spike-s4-')).map(x=>'/tmp/'+x)[0];
 const P=profiles({}, { process: { curr_bed_type: 'Textured PEI Plate' } });
 for (const [label,extra] of [['plain',[]],['arrange',['--arrange','1']],['ensure',['--ensure-on-bed']],['debug',['--debug','4']]] as const){
  const r=await orca((d)=>{const m=wr(d,'m.json',P.machine),p=wr(d,'p.json',P.proc),fl=wr(d,'f.json',P.fil);const c=path.join(d,'in.3mf');fs.copyFileSync(path.join(f,'A1_un_objeto_en_128_128_.3mf'),c);return ['--slice','0','--load-settings',`${m};${p}`,'--load-filaments',fl,'--outputdir',path.join(d,'out'),...extra,c]});
  console.log(label,r.code,r.ms); if(r.code) console.log(r.log.split('\n').filter(l=>/error|fail|outside|plate|object/i.test(l)).slice(-8).join('\n'));
 }
})();
