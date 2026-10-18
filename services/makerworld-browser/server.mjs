import http from 'node:http';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {spawn} from 'node:child_process';
import {timingSafeEqual} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const key=process.env.BROWSER_SERVICE_KEY;
if(!key||key.length<32)throw Error('Missing browser service key');
const sessions=new Map(),ttl=20*60_000,maxBytes=500*1024*1024;
let startQueue=Promise.resolve();
const xvfb=spawn('Xvfb',[':99','-screen','0','1280x900x24','-nolisten','tcp'],{stdio:'ignore'});
class CDP {
  constructor(ws){this.ws=ws;this.next=0;this.pending=new Map();this.listeners=[];
    ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=this.pending.get(m.id);if(p){clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(Error('Browser command failed')):p.resolve(m.result);}}else for(const fn of this.listeners)fn(m);});
    ws.addEventListener('close',()=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Browser closed'));}this.pending.clear();});
  }
  static async open(url){const ws=new WebSocket(url);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});return new CDP(ws);}
  send(method,params={}){return new Promise((resolve,reject)=>{const id=++this.next;const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Browser timeout'));},15000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}));});}
  close(){this.ws.close();}
}
function safeFilename(name){return String(name).split(/[\\/]/).at(-1).replace(/[\x00-\x1f]/g,'').slice(0,240);}
async function destroy(id){const s=sessions.get(id);if(!s)return;sessions.delete(id);s.closed=true;s.page?.close();s.browser?.close();try{if(s.process?.pid)process.kill(-s.process.pid,'SIGKILL');}catch{}await fs.rm(s.dir,{recursive:true,force:true,maxRetries:3}).catch(()=>{});}
async function attachPage(s,target){
  if(s.pageTarget===target.id)return;s.page?.close();s.page=await CDP.open(target.webSocketDebuggerUrl);s.pageTarget=target.id;
  const cdp=s.page;await cdp.send('Network.enable');await cdp.send('Page.enable');
  const responses=new Set();
  cdp.listeners.push(m=>{
    if(m.method==='Page.loadEventFired'){s.clicked=false;s.autoAttempts=0;s.lastAttempt=Date.now();}
    if(m.method==='Network.responseReceived'){
      const r=m.params.response;
      // Only the selected profile's official response can trigger a download.
      try{const u=new URL(r.url);if(['makerworld.com','api.bambulab.com'].includes(u.hostname)&&u.pathname.endsWith(`/instance/${s.profile}/f3mf`)&&u.searchParams.get('type')==='download'&&r.status===200)responses.add(m.params.requestId);}catch{}
    }
    if(m.method==='Network.loadingFinished'&&responses.delete(m.params.requestId))void(async()=>{
      try{const body=await cdp.send('Network.getResponseBody',{requestId:m.params.requestId});if(body.body.length>65536)return;const j=JSON.parse(body.base64Encoded?Buffer.from(body.body,'base64').toString():body.body);const result=j.data||j;await followDownload(s,result.url);}catch{}
    })();
  });
}
async function followDownload(s,raw){
  if(s.startedDownload||!raw)return;
  const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password)return;
  s.startedDownload=true;s.downloadStartedAt=Date.now();s.phase='downloading';
  // Chrome itself downloads on the server, preserving its network and cookies.
  await s.page.send('Page.navigate',{url:url.toString()}).catch(()=>{s.startedDownload=false;});
}
async function attempt(s){
  if(s.startedDownload||s.closed||s.attempting)return;s.attempting=true;
  try{
    const history=await s.page.send('Page.getNavigationHistory'),url=history.entries[history.currentIndex]?.url||'';
    if(!url.startsWith('https://makerworld.com/'))return;
    // Keep the human's challenge stable: do not request another captcha while its UI is open.
    const challenge=await s.page.send('Runtime.evaluate',{expression:`[...document.querySelectorAll('[class*="geetest"], [id*="geetest"], iframe[src*="geelabapi"], iframe[src*="challenges.cloudflare"]')].some(e=>{const r=e.getBoundingClientRect();return r.width>20&&r.height>20;})`,returnByValue:true});
    if(challenge.result?.value){s.phase='verification';return;}
    // Normal site UI triggers its own official CAPTCHA widget. No challenge answer is automated.
    // Once the human completes it, Network.responseReceived handles the provider's response.
    const result=await s.page.send('Runtime.evaluate',{expression:`(async()=>{const token=document.cookie.split('; ').find(c=>c.startsWith('token='))?.slice(6);const r=await fetch(${JSON.stringify(`/api/v1/design-service/instance/${s.profile}/f3mf`)}+'?'+new URLSearchParams({type:'download',fileType:'',devModelName:${JSON.stringify(s.device)}}),{headers:token?{Authorization:'Bearer '+decodeURIComponent(token)}:{}});const j=await r.json().catch(()=>null);return {status:r.status,url:r.ok?(j?.url||j?.data?.url):null};})()`,awaitPromise:true,returnByValue:true});
    const value=result.result?.value;
    if(value?.url){await followDownload(s,value.url);return;}
    s.phase='verification';
    if(!s.clicked){
      const clicked=await s.page.send('Runtime.evaluate',{expression:`(async()=>{const find=()=>[...document.querySelectorAll('button,a,div,[role="menuitem"]')].find(e=>e.getClientRects().length&&/^(download 3mf|descargar 3mf)$/i.test(e.textContent.trim()));let b=find();if(!b){const primary=[...document.querySelectorAll('.primaryButton')].find(e=>e.getClientRects().length&&/bambu studio/i.test(e.textContent));primary?.parentElement.querySelector('.icon-box')?.click();await new Promise(r=>setTimeout(r,300));b=find();}if(b){b.click();return true;}return false;})()`,awaitPromise:true,returnByValue:true});
      s.clicked=!!clicked.result?.value;
    }
  }catch{s.phase='verification';}finally{s.attempting=false;}
}
async function create(id,p){
  if(sessions.has(id))return sessions.get(id);
  if(sessions.size>=2)throw Error('Hay dos sesiones activas. Cierra una o espera a que expire.');
  const url=new URL(p.url);
  if(url.origin!=='https://makerworld.com'||!/^\/models\/\d+$/.test(url.pathname)||!/^\d+$/.test(p.profile)||!/^[-\w]{1,64}$/.test(p.device))throw Error('Modelo inválido');
  const dir=await fs.mkdtemp('/tmp/mf-browser-'),port=9222+[...sessions.values()].filter(s=>s.port===9222).length;
  const s={id,dir,port,profile:p.profile,device:p.device,expires:Date.now()+ttl,phase:'starting',downloads:new Map(),closed:false};sessions.set(id,s);
  try{
    await fs.mkdir(`${dir}/downloads`);
    s.process=spawn('chromium',[`--user-data-dir=${dir}/profile`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1','--no-sandbox','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-quic','--force-webrtc-ip-handling-policy=disable_non_proxied_udp','--proxy-server=http://browser-proxy:3128','--proxy-bypass-list=<-loopback>','--window-size=1280,900','about:blank'],{stdio:'ignore',detached:true,env:{PATH:process.env.PATH,HOME:dir,DISPLAY:':99',LANG:'en_US.UTF-8'}});
    let version;
    for(let i=0;i<60;i++){try{version=await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json());break;}catch{await delay(200);}}
    if(!version)throw Error('No se pudo abrir el navegador');
    s.browser=await CDP.open(version.webSocketDebuggerUrl);
    await s.browser.send('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:`${dir}/downloads`,eventsEnabled:true});
    s.browser.listeners.push(m=>{
      if(m.method==='Browser.downloadWillBegin'){
        const p=m.params;if(!s.startedDownload||!/\.3mf$/i.test(p.suggestedFilename)||s.downloads.size){void s.browser.send('Browser.cancelDownload',{guid:p.guid}).catch(()=>{});return;}
        s.downloads.set(p.guid,{id:p.guid,filename:safeFilename(p.suggestedFilename),size:0,state:'inProgress'});s.phase='downloading';
      }
      if(m.method==='Browser.downloadProgress'){
        const p=m.params,d=s.downloads.get(p.guid);if(!d)return;d.size=p.receivedBytes;d.state=p.state;
        if(p.receivedBytes>maxBytes||p.totalBytes>maxBytes){void s.browser.send('Browser.cancelDownload',{guid:p.guid}).catch(()=>{});s.error='El archivo supera 500 MiB';}
        if(p.state==='completed'){s.phase='downloaded';s.file=d;}
        if(p.state==='canceled'){s.phase='verification';s.error||='La descarga se interrumpió. Vuelve a intentarlo.';s.downloads.delete(p.guid);s.startedDownload=false;}
      }
    });
    const targets=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());await attachPage(s,targets.find(t=>t.type==='page'));
    if(typeof p.token==='string'&&p.token.length<=16000)await s.page.send('Network.setCookie',{name:'token',value:p.token,domain:'.makerworld.com',path:'/',secure:true,httpOnly:false,sameSite:'Lax'});
    p.token=undefined;
    await s.page.send('Page.navigate',{url:url.toString()});s.phase='verification';return s;
  }catch(e){await destroy(id);throw e;}
}
function view(s){return {phase:s.phase,expiresAt:new Date(s.expires).toISOString(),file:s.file?{filename:s.file.filename,size:s.file.size}:null,error:s.error||null};}
async function readJson(req){let n=0,chunks=[];for await(const c of req){n+=c.length;if(n>32768)throw Error('Solicitud demasiado grande');chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const supplied=Buffer.from(req.headers.authorization||''),expected=Buffer.from(`Bearer ${key}`);
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){res.writeHead(401);res.end();return;}
  try{
    const [,id,action='']=new URL(req.url,'http://service').pathname.split('/');
    if(!/^[0-9a-f-]{36}$/.test(id))throw Error('Sesión inválida');
    let s=sessions.get(id);
    if(req.method==='DELETE'){await destroy(id);res.end('{}');return;}
    if(req.method==='POST'&&action==='start'){const body=await readJson(req);const task=startQueue.then(()=>create(id,body));startQueue=task.catch(()=>{});s=await task;}
    if(!s||s.expires<Date.now()){await destroy(id);res.writeHead(410);res.end(JSON.stringify({error:'La sesión caducó. Abre el navegador de nuevo.'}));return;}
    if(req.method==='GET'&&action==='frame'){
      const targets=await fetch(`http://127.0.0.1:${s.port}/json/list`).then(r=>r.json());
      const page=targets.find(t=>t.type==='page'&&/^https:\/\//.test(t.url));if(page)await attachPage(s,page);
      const shot=await s.page.send('Page.captureScreenshot',{format:'jpeg',quality:65});res.setHeader('Content-Type','image/jpeg');res.end(Buffer.from(shot.data,'base64'));return;
    }
    if(req.method==='GET'&&action==='file'){
      if(!s.file)throw Error('El archivo aún no está descargado');
      const file=`${s.dir}/downloads/${s.file.id}`,stat=await fs.stat(file);if(stat.size>maxBytes)throw Error('Archivo demasiado grande');
      res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Length',stat.size);createReadStream(file).on('error',()=>res.destroy()).pipe(res);return;
    }
    if(req.method==='POST'&&action==='input'){
      const p=await readJson(req);
      if(p.type==='pointer'){
        if(!['mousePressed','mouseReleased','mouseMoved','mouseWheel'].includes(p.event)||!Number.isFinite(p.x)||!Number.isFinite(p.y))throw Error('Entrada inválida');
        await s.page.send('Input.dispatchMouseEvent',{type:p.event,x:Math.max(0,Math.min(1280,p.x)),y:Math.max(0,Math.min(900,p.y)),button:p.event==='mouseWheel'?'none':'left',buttons:p.buttons===1?1:0,...(p.event==='mouseWheel'?{deltaX:0,deltaY:Math.max(-800,Math.min(800,p.deltaY||0))}:{clickCount:1})});
      }else if(p.type==='text'){
        if(typeof p.text!=='string'||p.text.length>1024)throw Error('Entrada inválida');await s.page.send('Input.insertText',{text:p.text});
      }else if(p.type==='key'){
        if(!['Enter','Tab','Backspace','Delete','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(p.key))throw Error('Tecla inválida');
        const keyCode={Enter:13,Tab:9,Backspace:8,Delete:46,Escape:27,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Home:36,End:35}[p.key];
        await s.page.send('Input.dispatchKeyEvent',{type:'keyDown',key:p.key,windowsVirtualKeyCode:keyCode,modifiers:p.shift?8:0});await s.page.send('Input.dispatchKeyEvent',{type:'keyUp',key:p.key,windowsVirtualKeyCode:keyCode});
      }else throw Error('Entrada inválida');
      // After human interaction, give the official page time to finish its challenge.
      // Limit automatic retries, even while the user types or drags a challenge.
      if(Date.now()-(s.lastHumanRetry||0)>15000){s.lastHumanRetry=Date.now();s.autoAttempts=Math.min(s.autoAttempts||0,2);}
    }
    if(req.method==='POST'&&action==='retry'){s.clicked=false;s.error=null;await attempt(s);}
    if(req.method==='GET'&&action==='status'){
      const history=await s.page.send('Page.getNavigationHistory');
      // Display origin only: query strings can contain authentication challenges.
      try{s.origin=new URL(history.entries[history.currentIndex]?.url).origin;}catch{s.origin='';}
    }
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...view(s),origin:s.origin||'https://makerworld.com'}));
  }catch(e){if(!res.headersSent){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message?.startsWith('Browser')?'El navegador no respondió. Vuelve a abrirlo.':e.message}));}else res.destroy();}
});
setInterval(()=>{for(const [id,s]of sessions){if(s.expires<Date.now())void destroy(id);else if(!s.startedDownload&&(s.autoAttempts||0)<3&&Date.now()-(s.lastAttempt||0)>30000){s.lastAttempt=Date.now();s.autoAttempts=(s.autoAttempts||0)+1;void attempt(s);}}},5000).unref();
server.listen(3002,'0.0.0.0');
async function stop(){server.close();await Promise.all([...sessions.keys()].map(destroy));xvfb.kill();process.exit(0);}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
