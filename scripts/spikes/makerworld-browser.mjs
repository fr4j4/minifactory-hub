/** Test-only diagnostic. Session stays in process memory; no cookie dumps or authentication screenshots. */
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const code=`import {getDb,s} from './src/db';import {eq} from 'drizzle-orm';import {makerworldToken} from './src/lib/library/makerworld';(async()=>{if(process.env.MF_TEST_DEPLOYMENT!=='1')throw new Error('Test only');const [u]=await(await getDb()).select({id:s.users.id}).from(s.users).where(eq(s.users.email,'biblioteca-test@minifactory.local'));const token=await makerworldToken(u.id);if(!token)throw new Error('No session');process.stdout.write(token);process.exit(0)})()`;
let token=execFileSync('docker',['exec','minifactory-library-test-app-1','npx','tsx','-e',code],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const browser=await chromium.launch({executablePath:'/home/kali/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext();
 await context.addCookies([{name:'token',value:token,domain:'makerworld.com',path:'/',httpOnly:true,secure:true,sameSite:'Lax'}]);token='';
 const page=await context.newPage();
 const response=await page.goto('https://makerworld.com/es/models/3319718-gnome-mushroom-cozy-autumn-decoration',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForTimeout(5000);
 console.log(JSON.stringify({pageStatus:response?.status(),title:await page.title(),challenge:/just a moment/i.test(await page.title())}));
 if(/just a moment/i.test(await page.title())){console.log('Interactive browser verification required; stopping.');}
 else {
  const result=await page.evaluate(async()=>{const r=await fetch('/api/v1/design-service/instance/3769534/f3mf?type=download&fileType=&devModelName=O1C2');let j;try{j=await r.json()}catch{};return {status:r.status,downloadAvailable:!!j?.url,captcha:!!j?.captchaId,keys:j?Object.keys(j):[]};});
  console.log(JSON.stringify(result));
  const scripts=await page.locator('script[src]').evaluateAll(nodes=>nodes.map(n=>n.src));
  await fs.writeFile('/tmp/mf-makerworld-scripts.json',JSON.stringify(scripts));
 }
}finally{await browser.close();}
