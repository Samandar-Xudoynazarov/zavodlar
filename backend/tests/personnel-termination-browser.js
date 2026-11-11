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
const schema=`finance_ui_${crypto.randomBytes(8).toString('hex')}`;
const management=new pg.Pool({connectionString:source});
await management.query(`CREATE SCHEMA ${schema}`);
const url=new URL(source);url.searchParams.set('options',`-c search_path=${schema},public`);
process.env.DATABASE_URL=url.toString();process.env.AUTH_SECRET=crypto.randomBytes(32).toString('hex');process.env.CORS_ORIGIN='*';
const {one,q,migrate,getPool}=await import('../src/db.js');
const {issueToken,hashPassword}=await import('../src/auth.js');
const {default:app}=await import('../src/app.js');let server,web,browser;
const artifacts=path.join(root,'tmp/material-invoices/personnel-ui');fs.mkdirSync(artifacts,{recursive:true});
try {
 await migrate();const f=await one("INSERT INTO factories(code,name) VALUES('hr-roles','Kadrlar sinovi') RETURNING *"),hash=await hashPassword('Test123!'),users={};
 for(const role of ['rahbar','kadrlar'])users[role]=await one('INSERT INTO users(username,role,factory_id,password_hash) VALUES($1,$1,$2,$3) RETURNING *',[role,f.id,hash]);
 const e=await one("INSERT INTO hr_employees(factory_id,code,name,position,department,hire_date) VALUES($1,'001','Kadrlar Xodimov','Operator','Sex','2026-10-01') RETURNING *",[f.id]);
 await q('INSERT INTO hr_employers(factory_id,profile) VALUES($1,$2)',[f.id,{company:'Zavod',director:'Rahbar',address:'Uzun'}]);
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const backend='http://127.0.0.1:'+server.address().port;
 web=spawn(process.execPath,[path.join(root,'frontend/node_modules/next/dist/bin/next'),'start','-p','3105','-H','127.0.0.1'],{cwd:path.join(root,'frontend'),windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';web.stdout.on('data',b=>output+=b);web.stderr.on('data',b=>output+=b);
 for(let i=0;i<60;i++){if(web.exitCode!==null)throw new Error(output);try{if((await fetch('http://127.0.0.1:3105')).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const errors=[];
 async function open(role){const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});await context.addInitScript(({token})=>{localStorage.setItem('pto.token',token);localStorage.setItem('pto.lang','uz');localStorage.setItem('pto.tab',JSON.stringify('hr'));},{token:issueToken(users[role])});await context.route('**/api/**',async route=>{const u=new URL(route.request().url());const response=await route.fetch({url:backend+u.pathname+u.search});await route.fulfill({response});});const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto('http://127.0.0.1:3105');await page.getByRole('button',{name:'Ko‘rish',exact:true}).click();await page.locator('.hr-personnel').waitFor();return {context,page};}
 const boss=await open('rahbar');assert.equal(await boss.page.getByRole('button',{name:'Ishdan bo‘shatish',exact:true}).count(),0);
 const hr=await open('kadrlar'),page=hr.page;await page.getByRole('button',{name:'Ishdan bo‘shatish',exact:true}).click();const dlg=page.locator('dialog[open]');await dlg.getByLabel('Hujjat raqami',{exact:true}).fill('B-55');await dlg.getByLabel('Mehnat shartnomasi raqami',{exact:true}).fill('S-1');await dlg.getByLabel('Mehnat shartnomasi sanasi',{exact:true}).fill('2026-10-01');await dlg.getByLabel('Bekor qilish asosi',{exact:true}).selectOption('mutual');await dlg.getByLabel('Bekor qilish sababi',{exact:true}).fill('Kelishuv');await dlg.getByLabel('Ariza / kelishuv / tasdiqlovchi hujjat',{exact:true}).fill('Imzolangan kelishuv');
 assert.equal(await dlg.getByLabel('Imzolangan hujjat PDF nusxasi (3 MB gacha)',{exact:true}).getAttribute('required'),'');await dlg.getByRole('button',{name:'Saqlash',exact:true}).click();assert.equal((await one('SELECT count(*) AS n FROM hr_employment_docs')).n,0);
 const pdf=Buffer.from('%PDF-1.4\nSigned order\n%%EOF');await dlg.getByLabel('Imzolangan hujjat PDF nusxasi (3 MB gacha)',{exact:true}).setInputFiles({name:'Buyruq_B55.pdf',mimeType:'application/pdf',buffer:pdf});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(artifacts,'termination-mobile.png'),fullPage:true});assert.ok(await dlg.locator('input[type=file]').evaluate(el=>el.getBoundingClientRect().right<=el.closest('dialog').getBoundingClientRect().right));await page.setViewportSize({width:1440,height:1000});await dlg.getByRole('button',{name:'Saqlash',exact:true}).click();await dlg.waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Ishdan bo‘shatishni rasmiylashtirish',exact:true}).waitFor();const dlPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Imzolangan PDF',exact:true}).click();const dl=await dlPromise;assert.equal(dl.suggestedFilename(),'Buyruq_B55.pdf');assert.deepEqual(fs.readFileSync(await dl.path()),pdf);
 await boss.page.getByRole('tab',{name:'Shartnoma va buyruqlar',exact:true}).click();await boss.page.getByRole('button',{name:'Korxona rekvizitlari',exact:true}).first().waitFor();await boss.page.reload();await boss.page.getByRole('button',{name:'Ko‘rish',exact:true}).click();await boss.page.getByRole('tab',{name:'Shartnoma va buyruqlar',exact:true}).click();assert.equal(await boss.page.getByRole('button',{name:'Ishdan bo‘shatishni rasmiylashtirish',exact:true}).count(),0);
 await page.getByRole('button',{name:'Ishdan bo‘shatishni rasmiylashtirish',exact:true}).click();await dlg.getByLabel('Qog‘ozdagi hujjat tomonlar tomonidan imzolanganmi?',{exact:true}).selectOption('yes');await dlg.getByLabel('Huquqiy asos va barcha rekvizitlar tekshirildimi?',{exact:true}).selectOption('yes');await dlg.getByRole('button',{name:'Ishdan bo‘shatishni rasmiylashtirish',exact:true}).click();await dlg.waitFor({state:'hidden'});await page.getByText('Ishdan chiqqan',{exact:true}).waitFor();assert.equal((await one('SELECT end_date FROM hr_employees WHERE id=$1',[e.id])).endDate,new Date(Date.now()+5*3600000).toISOString().slice(0,10));assert.equal((await one('SELECT issued_by FROM hr_employment_docs')).issuedBy.id,users.kadrlar.id);assert.deepEqual(errors,[]);await page.screenshot({path:path.join(artifacts,'termination-complete.png'),fullPage:true});console.log('PASS browser: rahbar cannot dismiss; kadrlar uploads mandatory PDF, downloads exact original and completes dismissal');await hr.context.close();await boss.context.close();
} catch(e){if(browser){for(const [i,p] of browser.contexts().flatMap(c=>c.pages()).entries()){await p.screenshot({path:path.join(artifacts,'failure-'+i+'.png'),fullPage:true}).catch(()=>{});console.log(await p.locator('body').innerText());}}throw e;}finally{if(browser)await browser.close();if(web)web.kill();if(server)await new Promise(r=>server.close(r));await getPool().end();await management.query('DROP SCHEMA '+schema+' CASCADE');await management.end();}
