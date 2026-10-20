/** UI regression only: browser API states are simulated, no provider download is claimed. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const baseURL='http://127.0.0.1:3011',id=process.argv[2];
assert.match(id||'',/^[a-f0-9-]{36}$/);
assert.equal((await fetch(`${baseURL}/api/library/health`).then(r=>r.json())).environment,'library-test');
const password=(await fs.readFile('data/library-test-access.txt','utf8')).match(/^Password: (.+)$/m)?.[1];
const browser=await chromium.launch({executablePath:'/home/kali/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
try{
  const page=await browser.newPage({baseURL,locale:'es-CL'});
  await page.goto('/login');await page.locator('input[name=email]').fill('biblioteca-test@minifactory.local');await page.locator('input[name=password]').fill(password);await page.locator('form button').first().click();await page.waitForURL(u=>!u.pathname.includes('/login'));
  let phase='requesting_download',retryCount=0,race=false;
  await page.route(`**/api/library/browser/${id}*`,async route=>{
    const action=new URL(route.request().url()).searchParams.get('action');
    if(action==='frame'){
      if(race){phase='done';await route.fulfill({status:400,json:{error:'La importación ya terminó'}});return;}
      await route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});return;
    }
    if(action==='retry'){retryCount++;phase='requesting_download';}
    await route.fulfill({json:{phase,modelId:id,progress:phase==='downloading'?{receivedBytes:1048576,totalBytes:2097152}:null,error:phase==='download_error'?'La descarga se interrumpió.':null}});
  });
  await page.goto(`/archivos?browserImport=${id}`);
  const ui=page.getByTestId('makerworld-browser');await ui.getByRole('button',{name:'Resolver en el navegador',exact:true}).click();
  await ui.getByText('MakerWorld autorizó el archivo. Iniciando la transferencia…',{exact:true}).waitFor();
  phase='downloading';await ui.getByText('1.00 MiB / 2.00 MiB',{exact:true}).waitFor();assert.equal(await ui.locator('progress').getAttribute('value'),'1048576');
  await page.setViewportSize({width:390,height:844});assert(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  phase='download_error';await ui.getByRole('alert').waitFor();await ui.getByRole('button',{name:'Reintentar descarga',exact:true}).filter({visible:true}).click();assert.equal(retryCount,1);
  await ui.getByText('MakerWorld autorizó el archivo. Iniciando la transferencia…',{exact:true}).waitFor();
  // Ingestion finishes between status and screenshot: recheck status instead of showing an error.
  race=true;await page.getByRole('heading',{name:'Modelo añadido a tu biblioteca',exact:true}).waitFor();
  console.log(JSON.stringify({ok:true,simulatedUI:true,progress:true,retry:true,mobile:true,completionRace:true}));
}finally{await browser.close();}
