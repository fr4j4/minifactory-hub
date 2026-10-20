// CPU/parser process: no database access, IPC through a bounded result directory.
import fs from 'node:fs/promises';
import path from 'node:path';
import {unzipSync} from 'fflate';
import {parseAms} from '../src/lib/mesh/threemf-ams';
import {parse3mfSliceMeta,hasSlicedData,buildGcodePreview,gcodePreviewToBin} from '../src/lib/gcode';
import {parseMesh} from '../src/lib/mesh/parse';
import {analyze,weld,decimate,toPreviewBin,renderThumbnail,renderTurntable} from '../src/lib/mesh/ops';
async function main(){
const [input,ext,out]=process.argv.slice(2);if(!input||!out)throw new Error('Missing worker paths');
globalThis.fetch=async()=>{throw new Error('Parser network disabled');};
const buf=new Uint8Array(await fs.readFile(input));const mesh=await parseMesh(buf,ext);
if(!mesh.positions.length||mesh.positions.length>90_000_000||mesh.positions.some(v=>!Number.isFinite(v)))throw new Error('Invalid or excessive geometry');
const analysis=analyze(mesh),ix=weld(mesh),dec=decimate(ix,1_500_000),light=decimate(ix,60_000);
const positions=new Float32Array(light.indices.length*3);for(let i=0;i<light.indices.length;i++)positions.set(light.vertices.subarray(light.indices[i]*3,light.indices[i]*3+3),i*3);
await fs.writeFile(path.join(out,'preview.mfm'),toPreviewBin(dec,{origTriangles:ix.indices.length/3,decimated:dec!==ix}));
await fs.writeFile(path.join(out,'thumb.webp'),await renderThumbnail({positions},{format:'webp'}));const turn=await renderTurntable({positions});if(turn)await fs.writeFile(path.join(out,'turn.webp'),turn);
let extra:any={};if(ext==='3mf'){extra.ams=parseAms(buf);extra.sliced=parse3mfSliceMeta(buf);extra.hasSlicedData=extra.sliced?hasSlicedData(extra.sliced):false;const files=unzipSync(buf,{filter:f=>/plate_1\.gcode$/i.test(f.name)&&f.originalSize<=256*1024*1024});const gcode=Object.values(files)[0];if(gcode)await fs.writeFile(path.join(out,'gcode.mfg'),gcodePreviewToBin(buildGcodePreview(new TextDecoder().decode(gcode))));}
await fs.writeFile(path.join(out,'result.json'),JSON.stringify({extra,analysis,decimated:dec!==ix,render:{version:2,triangles:light.indices.length/3,simplified:light!==ix,frames:12,width:240,height:180,format:'webp',turnBytes:turn?.length||0}}));

}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
