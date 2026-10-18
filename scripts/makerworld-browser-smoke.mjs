/** Isolated deployment: real metadata/challenge UI. Never solves a CAPTCHA or logs secrets. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const baseURL='http://127.0.0.1:3011';
assert.equal((await(await fetch(`${baseURL}/api/library/health`)).json()).environment,'library-test');
const password=(await fs.readFile('data/library-test-access.txt','utf8')).match(/^Password: (.+)$/m)?.[1];assert(password);
const browser=await chromium.launch({executablePath:'/home/kali/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({baseURL,locale:'es-CL',viewport:{width:1360,height:1100}});
 await page.goto('/login');await page.locator('input[name=email]').fill('biblioteca-test@minifactory.local');await page.locator('input[name=password]').fill(password);await page.locator('form button').first().click();await page.waitForURL(u=>!u.pathname.includes('/login'));
 const dialog=page.getByTestId('url-import-dialog');
 if(process.argv[2]){assert.match(process.argv[2],/^[0-9a-f-]{36}$/);await page.goto(`/archivos?browserImport=${process.argv[2]}`);}
 else{
   await page.goto('/archivos');await page.getByRole('button',{name:'Importar por URL',exact:true}).click();
   await dialog.getByLabel('URL',{exact:true}).fill('https://makerworld.com/es/models/3319718-gnome-mushroom-cozy-autumn-decoration');await dialog.getByRole('button',{name:'Buscar modelo',exact:true}).click();
   await dialog.getByRole('heading',{name:'Gnome Mushroom – Cozy Autumn Decoration',exact:true}).waitFor({timeout:60000});
   await dialog.getByRole('button',{name:'Continuar',exact:true}).click();
 }
 await page.getByTestId('makerworld-browser').waitFor({timeout:60000});
 let operation;
 page.on('request',r=>{const match=r.url().match(/\/api\/library\/browser\/([0-9a-f-]+)\?action=start/);if(match)operation=match[1];});
 page.on('response',async r=>{if(r.url().includes('/api/library/browser/')&&r.url().includes('action=start'))console.log(JSON.stringify({startStatus:r.status(),state:await r.json()}));});
 await dialog.getByRole('button',{name:'Resolver en el navegador',exact:true}).click();
 await Promise.race([dialog.getByRole('application',{name:/Navegador remoto/}).waitFor({timeout:60000}),dialog.getByRole('heading',{name:'Modelo añadido a tu biblioteca',exact:true}).waitFor({timeout:60000})]);
 await fs.mkdir('data/library-test-evidence',{recursive:true});
 await page.screenshot({path:'data/library-test-evidence/makerworld-remote-desktop.png'});
 assert(operation);
 const response=await page.request.get(`/api/library/browser/${operation}?action=status`);assert.equal(response.status(),200);
 const status=await response.json();assert(['verification','downloading','downloaded','saving','done'].includes(status.phase));
 const foreign=await page.request.post(`/api/library/browser/${operation}?action=input`,{headers:{Origin:'http://evil.local'},data:{type:'key',key:'Enter'}});assert.equal(foreign.status(),403);
 await page.setViewportSize({width:390,height:844});assert(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 await page.screenshot({path:'data/library-test-evidence/makerworld-remote-mobile.png'});
 await fs.writeFile('/tmp/mf-remote-operation.json',JSON.stringify({operation,status:status.phase}));
 console.log(JSON.stringify({ok:true,model:'Gnome Mushroom',operation,remoteBrowser:status.phase,originalDownloaded:status.phase==='done',humanVerificationPending:status.phase==='verification'}));
}finally{await browser.close();}
