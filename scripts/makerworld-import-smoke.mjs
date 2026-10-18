/** Test deployment only; real public metadata, no account credentials or model download. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const baseURL='http://127.0.0.1:3011';
const health=await fetch(`${baseURL}/api/library/health`).then(r=>r.json());
assert.equal(health.environment,'library-test');
const access=await fs.readFile('data/library-test-access.txt','utf8');
const password=access.match(/^Password: (.+)$/m)?.[1];
assert(password);
const root=path.join(os.homedir(),'.cache/ms-playwright');
const installed=(await fs.readdir(root)).filter(n=>n.startsWith('chromium_headless_shell-')).sort().at(-1);
const browser=await chromium.launch({executablePath:path.join(root,installed,'chrome-headless-shell-linux64/chrome-headless-shell'),headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({baseURL,locale:'es-CL',viewport:{width:1280,height:1000}});
 await page.goto('/login');await page.locator('input[name=email]').fill('biblioteca-test@minifactory.local');await page.locator('input[name=password]').fill(password);await page.locator('form button').first().click();await page.waitForURL(u=>!u.pathname.includes('/login'));
 await page.goto('/archivos');await page.getByRole('button',{name:'Importar por URL',exact:true}).click();
 const dialog=page.getByTestId('url-import-dialog');await dialog.getByLabel('URL',{exact:true}).fill('https://makerworld.com/es/models/3317662-pumpkin-patch-pal?from=recommend#profileId-3766961');
 await dialog.getByRole('button',{name:'Buscar modelo',exact:true}).click();
 await dialog.getByRole('heading',{name:'Pumpkin Patch Pal',exact:true}).waitFor({timeout:60000});
 assert.match(await dialog.innerText(),/Zesty 3D by Art/);assert.match(await dialog.innerText(),/Standard Digital File License/);assert.match(await dialog.innerText(),/15\.61 MiB/);
 assert.equal(await dialog.getByLabel('Perfil de impresión').inputValue(),'3766961');
 assert.match(await dialog.getByRole('link',{name:'Ver en el sitio original'}).getAttribute('href'),/#profileId-3766961$/);
 await fs.mkdir('data/library-test-evidence',{recursive:true});
 await page.getByRole('dialog').evaluate(el=>{el.scrollTop=0;});
 await page.screenshot({path:'data/library-test-evidence/makerworld-dialog.png',animations:'disabled'});
 await page.setViewportSize({width:390,height:844});
 assert(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 await page.screenshot({path:'data/library-test-evidence/makerworld-mobile.png',animations:'disabled'});
 await page.setViewportSize({width:1280,height:1000});
 if(await dialog.getByText('Cuenta MakerWorld verificada',{exact:true}).count()){
   await dialog.getByRole('button',{name:'Continuar',exact:true}).click();
   await Promise.race([dialog.getByRole('heading',{name:'Todo listo para importar',exact:true}).waitFor({timeout:60000}),dialog.getByRole('alert').waitFor({timeout:60000}),dialog.getByTestId('makerworld-browser').waitFor({timeout:60000})]);
   if(await dialog.getByTestId('makerworld-browser').isVisible()){
     assert(await dialog.getByRole('button',{name:'Resolver en el navegador',exact:true}).isVisible());
     await page.screenshot({path:'data/library-test-evidence/makerworld-provider-challenge.png',animations:'disabled'});
     console.log(JSON.stringify({ok:true,authentication:'existing session validated against Bambu',download:'human verification required; original binary not imported',recovery:'server browser and automatic ingestion available'}));
   }else if(await dialog.getByRole('alert').isVisible()){
     const message=await dialog.getByRole('alert').innerText();
     if(!/verificar esta red|verificación en su web/.test(message))throw new Error(message);
     await dialog.getByRole('button',{name:'Revisar acceso',exact:true}).click();
     await dialog.getByTestId('bambu-account-form').waitFor();
     assert(await dialog.getByLabel('Respuesta o enlace de descarga').isVisible());
     await page.screenshot({path:'data/library-test-evidence/makerworld-provider-challenge.png',animations:'disabled'});
     console.log(JSON.stringify({ok:true,authentication:'existing session validated against Bambu',download:'blocked by real provider browser challenge; no binary imported',recovery:'shared account modal and manual download alternative visible'}));
   }else{
     await page.screenshot({path:'data/library-test-evidence/makerworld-authorized-download.png',animations:'disabled'});
     console.log(JSON.stringify({ok:true,authentication:'existing session validated against Bambu',download:'real signed download resolved; no duplicate binary imported',model:'Pumpkin Patch Pal',instanceId:'3766961'}));
   }
 }else{
 await dialog.getByRole('button',{name:'Conectar y continuar',exact:true}).click();
 await dialog.getByLabel('Correo de tu cuenta Bambu').fill('ui-test@example.invalid');
 await dialog.getByLabel('Contraseña',{exact:true}).fill('not-a-real-password');
 // Simulate an action/network failure without sending any credentials to Bambu.
 let intercepted=0;
 const failLogin=async route=>{if(route.request().method()==='POST'&&route.request().headers()['next-action']&&route.request().postData()?.includes('not-a-real-password')){intercepted++;await new Promise(resolve=>setTimeout(resolve,1200));await route.fulfill({status:503,contentType:'text/plain',body:'Simulated unavailable server'});}else await route.continue();};
 await page.route('**/archivos',failLogin);
 await dialog.getByRole('button',{name:'Asociar cuenta',exact:true}).click();
 await dialog.getByRole('button',{name:'Conectando con Bambu…',exact:true}).waitFor();
 const alert=dialog.getByRole('alert');await alert.waitFor();
 assert.match(await alert.innerText(),/No se pudo contactar/);
 assert.equal(intercepted,1);assert.equal(await dialog.getByLabel('Contraseña',{exact:true}).inputValue(),'');
 const bounds=await alert.boundingBox();assert(bounds&&bounds.y>=0&&bounds.y+bounds.height<=1000);
 assert(await alert.evaluate(el=>document.activeElement===el));
 assert(await dialog.getByRole('button',{name:'Asociar cuenta',exact:true}).isEnabled());
 await page.screenshot({path:'data/library-test-evidence/makerworld-login-error.png',animations:'disabled'});
 await page.unroute('**/archivos',failLogin);
 await dialog.getByText('Importar solo este archivo desde el navegador',{exact:true}).click();
 assert.match(await dialog.getByRole('link',{name:'Abrir descarga en MakerWorld'}).getAttribute('href'),/instance\/3766961\/f3mf/);
 await dialog.getByLabel('Respuesta o enlace de descarga').fill('{"url":');
 await dialog.getByRole('button',{name:'Revisar descarga'}).click();
 await dialog.getByRole('alert').filter({hasText:'JSON de descarga inválido'}).waitFor({timeout:60000});
 await dialog.getByRole('button',{name:'Sesión del navegador',exact:true}).click();
 assert.equal(await dialog.getByLabel('Token de sesión',{exact:true}).getAttribute('type'),'password');
 console.log(JSON.stringify({ok:true,environment:'library-test',model:'Pumpkin Patch Pal',instanceId:'3766961',sizeMiB:15.61,checks:['public metadata','desktop/mobile review','visible login pending','visible login failure and focus','retry enabled','browser alternative','invalid JSON'],authentication:'failure simulated; no real Bambu credentials sent',download:'no binary imported',screenshots:'data/library-test-evidence/makerworld-*.png'}));
 }
}catch(error){for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:'data/library-test-evidence/makerworld-smoke-failure.png',animations:'disabled'}).catch(()=>{});throw error;}finally{await browser.close();}
