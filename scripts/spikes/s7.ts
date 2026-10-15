/** S7: multicolor por objeto (extruder en model_settings) con 2 filamentos cargados. */
import fs from 'node:fs';import path from 'node:path';
import { orca, profiles, wr } from './lib';
import { execSync } from 'node:child_process';
(async()=>{
 const dir=fs.mkdtempSync('/tmp/s7-build-'); const src=fs.readdirSync('/tmp').filter(x=>x.startsWith('spike-s4-')).map(x=>'/tmp/'+x).sort().pop()!;
 const P=profiles({}, { process: { curr_bed_type: 'Textured PEI Plate' } });
 const P2=profiles({filament:'Bambu PLA Basic @BBL A1'},{filament:{filament_colour:['#00AA00']},process:{curr_bed_type:'Textured PEI Plate'}});
 for (const [label,file,extra,two] of [['C1 ext1/ext2 sin ids','C1_extrusor_2_para_el_engranaje_2_filamentos_PLA_.3mf',[],true],['C1 con --allow-multicolor-oneplate',  'C1_extrusor_2_para_el_engranaje_2_filamentos_PLA_.3mf',['--allow-multicolor-oneplate'],true],['C1 un solo filamento','C1_extrusor_2_para_el_engranaje_2_filamentos_PLA_.3mf',[],false]] as const){
  const r=await orca((d)=>{const m=wr(d,'m.json',P.machine),p=wr(d,'p.json',P.proc),f1=wr(d,'f1.json',P.fil),f2=wr(d,'f2.json',P2.fil);const c=path.join(d,'in.3mf');fs.copyFileSync(path.join(src,file),c);
   return ['--slice','0','--load-settings',`${m};${p}`,'--load-filaments',two?`${f1};${f2}`:f1,'--outputdir',path.join(d,'out'),...extra,c]});
  console.log('##',label,r.code,r.ms);
  if(r.code===0){const g=fs.readFileSync(path.join(r.dir,'out','plate_1.gcode'),'utf8');console.log('T changes:',(g.match(/^T\d+/gm)??[]).join(','),'| filament used:',g.match(/filament used \[g\] = ([^\n]+)/)?.[1],'| time',g.match(/total estimated time: ([^;\n]+)/)?.[1], '| wipe tower:', /wipe_tower|WIPE_TOWER/i.test(g));}
  else{try{console.log(JSON.parse(fs.readFileSync(path.join(r.dir,'out','result.json'),'utf8')).error_string)}catch{console.log(r.log.slice(-200))}}
 }
})();
