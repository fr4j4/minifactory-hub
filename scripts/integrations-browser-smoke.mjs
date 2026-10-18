/** Isolated deployment only. Provider authentication responses are simulated, never send credentials. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const baseURL='http://127.0.0.1:3011';
assert.equal((await fetch(`${baseURL}/api/library/health`).then(r=>r.json())).environment,'library-test');
const password=(await fs.readFile('data/library-test-access.txt','utf8')).match(/^Password: (.+)$/m)?.[1];assert(password);
const root=path.join(os.homedir(),'.cache/ms-playwright');
const installed=(await fs.readdir(root)).filter(n=>n.startsWith('chromium_headless_shell-')).sort().at(-1);
const browser=await chromium.launch({executablePath:path.join(root,installed,'chrome-headless-shell-linux64/chrome-headless-shell'),headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({baseURL,viewport:{width:1280,height:1000}});
 await page.goto('/login');await page.locator('input[name=email]').fill('biblioteca-test@minifactory.local');await page.locator('input[name=password]').fill(password);await page.locator('form button').first().click();await page.waitForURL(u=>!u.pathname.includes('/login'));
 await page.goto('/configuracion?tab=integraciones');
 const panel=page.getByTestId('integrations-panel');await panel.waitFor();
 assert.match(await panel.innerText(),/MakerWorld/);assert.match(await panel.innerText(),/Bambu Lab/);
 await fs.mkdir('data/library-test-evidence',{recursive:true});
 await page.screenshot({path:'data/library-test-evidence/integrations.png',fullPage:true,animations:'disabled'});
 await panel.getByRole('button',{name:/^(Asociar cuenta|Gestionar cuenta)$/}).click();
 const form=page.getByTestId('bambu-account-form');await form.waitFor();
 let intercepted=0;
 await page.route('**/configuracion*',async route=>{
   const req=route.request(),body=req.postData()||'';
   if(req.method()!=='POST'||!req.headers()['next-action']||!body.includes('ui-test@example.invalid'))return route.continue();
   intercepted++;
   const result=body.includes('not-a-real-password')?{ok:true,data:{kind:'code'}}:body.includes('123456')?{ok:false,error:'El código no es válido o caducó.',code:'invalid_code'}:{ok:false,error:'Bambu exige verificar esta red en su navegador.',code:'browser_required',retryAfter:300};
   await route.fulfill({status:200,contentType:'text/x-component',body:'0:{"a":"$@1","f":"","b":"test"}\n1:'+JSON.stringify(result)+'\n'});
 });
 await form.getByLabel('Correo de tu cuenta Bambu').fill('ui-test@example.invalid');
 await form.getByLabel('Contraseña',{exact:true}).fill('not-a-real-password');
 await form.getByRole('button',{name:'Asociar cuenta',exact:true}).click();
 await form.getByLabel('Código de 6 dígitos').waitFor();assert.equal(intercepted,1);
 await form.getByLabel('Código de 6 dígitos').fill('123456');await form.getByRole('button',{name:'Asociar cuenta',exact:true}).click();
 await form.getByRole('alert').waitFor();assert.match(await form.getByRole('alert').innerText(),/código no es válido/);
 assert(await form.getByRole('alert').evaluate(el=>document.activeElement===el));
 await form.getByLabel('Código de 6 dígitos').fill('654321');await form.getByRole('button',{name:'Asociar cuenta',exact:true}).click();
 await form.getByRole('button',{name:'Asociar sesión del navegador',exact:true}).click();
 assert.equal(await form.getByLabel('Token de sesión').getAttribute('type'),'password');
 assert.match(await form.innerText(),/no transfiere la sesión automáticamente/);
 await page.setViewportSize({width:390,height:844});
 assert(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 await page.screenshot({path:'data/library-test-evidence/integrations-browser-session-mobile.png',animations:'disabled'});
 assert.equal(intercepted,3);
 console.log(JSON.stringify({ok:true,checks:['central integration settings','shared account modal','email verification','invalid code focused error','browser challenge recovery','masked token','mobile layout'],providerAuthentication:'simulated; no real credentials sent'}));
}finally{await browser.close();}
