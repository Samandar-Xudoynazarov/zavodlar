// End-to-end verification in a temporary DB schema. All browser API requests
// are redirected to this local test server, never to the configured live API.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const runtime=path.join(process.env.USERPROFILE||'C:/Users/SAMANDAR','.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const require=createRequire(import.meta.url);
const {chromium}=require(runtime);
const ExcelJS=require(path.join(root,'frontend/node_modules/exceljs'));
const source=process.env.DATABASE_URL||process.env.POSTGRES_URL;
const schema=`import_ui_${crypto.randomBytes(8).toString('hex')}`;
const management=new pg.Pool({connectionString:source});
await management.query(`CREATE SCHEMA ${schema}`);
const url=new URL(source);url.searchParams.set('options',`-c search_path=${schema},public`);
process.env.DATABASE_URL=url.toString();process.env.AUTH_SECRET=crypto.randomBytes(32).toString('hex');process.env.CORS_ORIGIN='*';
const {one,q,migrate,getPool}=await import('../src/db.js');
const {issueToken,hashPassword}=await import('../src/auth.js');
const {default:app}=await import('../src/app.js');let server,web,browser;
const artifacts=path.join(root,'design-review/import');fs.mkdirSync(artifacts,{recursive:true});
try {
 await migrate();const a=await one("INSERT INTO factories(code,name,sort) VALUES('import-ui-a','A zavod',1) RETURNING *"),b=await one("INSERT INTO factories(code,name,sort) VALUES('import-ui-b','B zavod',2) RETURNING *");const hash=await hashPassword('UiDemo123!');const admin=await one("INSERT INTO users(username,name,role,password_hash) VALUES('head-admin','Bosh administrator','admin',$1) RETURNING *",[hash]);const local=await one("INSERT INTO users(username,name,role,factory_id,password_hash) VALUES('local-admin','Zavod administratori','admin',$1,$2) RETURNING *",[a.id,hash]);
 const fixture=JSON.parse(fs.readFileSync(path.join(root,'backend/pto-backup-2026-09-30-08-56.json'),'utf8'));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const backend='http://127.0.0.1:'+server.address().port;
 web=spawn(process.execPath,[path.join(root,'frontend/node_modules/next/dist/bin/next'),'start','-p','3103','-H','127.0.0.1'],{cwd:path.join(root,'frontend'),windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';web.stdout.on('data',d=>output+=d);web.stderr.on('data',d=>output+=d);for(let i=0;i<60;i++){if(web.exitCode!==null)throw new Error(output);try{if((await fetch('http://127.0.0.1:3103')).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));if(i===59)throw new Error(output);}
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});let closing=false;const errors=[];const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});await context.addInitScript(({token})=>{if(!localStorage.getItem('pto.token'))localStorage.setItem('pto.token',token);localStorage.setItem('pto.lang','uz');localStorage.setItem('pto.tab',JSON.stringify('admin'));},{token:issueToken(admin)});await context.route('**/api/**',async route=>{const u=new URL(route.request().url());try{const response=await route.fetch({url:backend+u.pathname+u.search});await route.fulfill({response});}catch(e){if(!closing)errors.push(e.message);await route.abort().catch(()=>{});}});
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:3103');await page.getByRole('button',{name:'JSON import',exact:true}).click();const dialog=page.locator('dialog[open]');await dialog.getByLabel('Maqsad zavod',{exact:true}).selectOption(b.id);await dialog.getByLabel('ПТО zaxira fayli',{exact:true}).setInputFiles({name:'pto-demo.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await dialog.getByRole('button',{name:'Faylni tekshirish',exact:true}).click();await dialog.locator('.import-target strong').getByText('B zavod',{exact:true}).waitFor();assert.equal((await one('SELECT count(*) AS n FROM products')).n,0);await page.screenshot({path:path.join(artifacts,'preview-desktop.png'),fullPage:true});await dialog.getByRole('button',{name:'Tanlangan zavodga yuklash',exact:true}).click();await dialog.getByRole('heading',{name:'Ma’lumotlar muvaffaqiyatli yuklandi',exact:true}).waitFor({timeout:30000});assert.equal((await one('SELECT count(*) AS n FROM products WHERE factory_id=$1',[b.id])).n,fixture.data.products.length);assert.equal((await one('SELECT count(*) AS n FROM products WHERE factory_id=$1',[a.id])).n,0);
 const downloadPromise=page.waitForEvent('download');await dialog.getByRole('button',{name:'Importdan oldingi zaxirani yuklash',exact:true}).click();const download=await downloadPromise;assert.ok(download.suggestedFilename().startsWith('before-import-'));await page.screenshot({path:path.join(artifacts,'success-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(artifacts,'success-mobile.png'),fullPage:true});assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await dialog.getByRole('button',{name:'Import oynasini yopish',exact:true}).click();
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(token=>localStorage.setItem('pto.token',token),issueToken(local));await page.reload();await page.getByText('Zavod administratori',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'JSON import',exact:true}).count(),0);assert.deepEqual(errors,[]);
 console.log('PASS browser: HQ-only button, explicit target factory, file preview, import, snapshot download and responsive dialog');closing=true;await context.close();
} catch(e){if(browser){const page=browser.contexts()[0]?.pages()[0];if(page){await page.screenshot({path:path.join(artifacts,'failure.png'),fullPage:true}).catch(()=>{});console.log('UI FAILURE',await page.locator('body').innerText().catch(()=>''));}}throw e;} finally {if(browser)await browser.close();if(web)web.kill();if(server)await new Promise(r=>server.close(r));await getPool().end();await management.query('DROP SCHEMA '+schema+' CASCADE');await management.end();}
