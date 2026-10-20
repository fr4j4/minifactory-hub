/** The provider metadata names the selected 3MF. Chromium may suggest simply "download". */
export function modelFilename(name,profile){
  const clean=String(name||'').split(/[\\/]/).at(-1).replace(/[\x00-\x1f]/g,'').trim();
  return /\.3mf$/i.test(clean)?`${clean.slice(0,-4).slice(0,230)}.3mf`:`makerworld-${profile}.3mf`;
}
export function failDownload(s,message){
  s.phase='download_error';s.error=message;s.startedDownload=false;s.downloads.clear();
}
export function beginDownload(s,p,now=Date.now()){
  if(!s.startedDownload||!s.downloadUrls?.has(p.url)||s.downloads.size)return false;
  s.downloads.set(p.guid,{id:p.guid,filename:modelFilename(s.downloadFilename||p.suggestedFilename,s.profile),size:0,total:0,updatedAt:now,state:'inProgress'});
  s.phase='downloading';s.error=null;return true;
}
export function progressDownload(s,p,maxBytes,now=Date.now()){
  const d=s.downloads.get(p.guid);if(!d)return;
  if(p.receivedBytes>d.size)d.updatedAt=now;
  d.size=p.receivedBytes;d.total=p.totalBytes;d.state=p.state;
  if(p.receivedBytes>maxBytes||p.totalBytes>maxBytes){failDownload(s,'El archivo supera 500 MiB');return 'cancel';}
  if(p.state==='completed'){s.phase='downloaded';s.file=d;return 'completed';}
  if(p.state==='canceled')failDownload(s,'La descarga se interrumpió. Vuelve a intentarlo.');
}
export function stalledDownload(s,now=Date.now()){
  if(s.phase==='requesting_download'&&now-s.downloadStartedAt>20000)return 'Chromium no inició la transferencia. Puedes reintentar la descarga.';
  const d=[...s.downloads.values()].find(d=>d.state==='inProgress');
  if(d&&now-d.updatedAt>90000)return 'La descarga no recibió datos durante 90 segundos. Puedes reintentar.';
}
export function downloadProgress(s){const d=s.file||[...s.downloads.values()][0];return d?{receivedBytes:d.size,totalBytes:d.total||null}:null;}
