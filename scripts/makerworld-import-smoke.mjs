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
 const page=await browser.newPage({baseURL,viewport:{width:1280,height:1000}});
 await page.goto('/login');await page.locator('input[name=email]').fill('biblioteca-test@minifactory.local');await page.locator('input[name=password]').fill(password);await page.locator('form button').first().click();await page.waitForURL(u=>!u.pathname.includes('/login'));
 await page.goto('/archivos');await page.getByRole('button',{name:'Importar por URL',exact:true}).click();
 const dialog=page.getByTestId('url-import-dialog');await dialog.getByLabel('URL',{exact:true}).fill('https://makerworld.com/es/models/3317662-pumpkin-patch-pal?from=recommend#profileId-3766961');
 await dialog.getByRole('button',{name:'Consultar',exact:true}).click();
 await dialog.getByRole('heading',{name:'Pumpkin Patch Pal',exact:true}).waitFor({timeout:60000});
 assert.match(await dialog.innerText(),/Zesty 3D by Art/);assert.match(await dialog.innerText(),/Standard Digital File License/);assert.match(await dialog.innerText(),/15\.61 MiB/);
 assert.equal(await dialog.getByLabel('Perfil de impresión').inputValue(),'3766961');
 assert.match(await dialog.getByRole('link',{name:'Ver origen y condiciones de uso'}).getAttribute('href'),/#profileId-3766961$/);
 // With no saved account, the resolver must explain why downloading requires login.
 await dialog.getByRole('button',{name:'Preparar descarga',exact:true}).click();
 await dialog.getByRole('alert').filter({hasText:'requiere iniciar sesión'}).waitFor({timeout:60000});
 await dialog.locator('summary').filter({hasText:'Conector MakerWorld'}).click();
 assert(await dialog.getByRole('button',{name:'Conectar cuenta',exact:true}).isVisible());
 await dialog.getByLabel('Método de acceso').selectOption('token');
 assert(await dialog.getByText('Token de acceso',{exact:true}).isVisible());
 await fs.mkdir('data/library-test-evidence',{recursive:true});
 await dialog.locator('summary').filter({hasText:'Conector MakerWorld'}).click();
 await page.getByRole('dialog').evaluate(el=>{el.scrollTop=0;});
 await page.screenshot({path:'data/library-test-evidence/makerworld-dialog.png',animations:'disabled'});
 console.log(JSON.stringify({ok:true,environment:'library-test',model:'Pumpkin Patch Pal',instanceId:'3766961',sizeMiB:15.61,download:'requires user login; no binary imported',screenshot:'data/library-test-evidence/makerworld-dialog.png'}));
}finally{await browser.close();}
