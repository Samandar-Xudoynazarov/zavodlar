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
const artifacts=path.join(root,'tmp/material-invoices/ui');fs.mkdirSync(artifacts,{recursive:true});
try {
 await migrate();const f=await one("INSERT INTO factories(code,name) VALUES('material-ui','Material UI') RETURNING *");const hash=await hashPassword('Demo123!');const admin=await one("INSERT INTO users(username,name,role,factory_id,password_hash) VALUES('admin','Buxgalter','admin',$1,$2) RETURNING *",[f.id,hash]);
 const mat=await one("INSERT INTO materials(factory_id,name,unit,stock,price) VALUES($1,'Armatura A500 12 mm','kg',true,100) RETURNING *",[f.id]);
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const backend='http://127.0.0.1:'+server.address().port;
 web=spawn(process.execPath,[path.join(root,'frontend/node_modules/next/dist/bin/next'),'start','-p','3104','-H','127.0.0.1'],{cwd:path.join(root,'frontend'),windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';web.stdout.on('data',b=>output+=b);web.stderr.on('data',b=>output+=b);
 for(let i=0;i<60;i++){if(web.exitCode!==null)throw new Error(output);try{if((await fetch('http://127.0.0.1:3104')).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const errors=[];const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 await context.addInitScript(({token})=>{localStorage.setItem('pto.token',token);localStorage.setItem('pto.lang','uz');localStorage.setItem('pto.tab',JSON.stringify('finance-materials'));},{token:issueToken(admin)});
 await context.route('**/api/**',async route=>{const u=new URL(route.request().url());const response=await route.fetch({url:backend+u.pathname+u.search});await route.fulfill({response});});
 const page=await context.newPage();page.setDefaultTimeout(15000);await page.clock.setFixedTime(new Date('2026-11-11T12:00:00+05:00'));page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto('http://127.0.0.1:3104');
 await page.getByRole('heading',{name:'Material fakturalari',exact:true}).waitFor();await page.getByRole('button',{name:'+ Faktura kiritish',exact:true}).click();
 const dlg=page.locator('dialog[open]');await dlg.getByLabel('Faktura raqami',{exact:true}).fill('M-101');await dlg.getByLabel('Kontragent',{exact:true}).fill('Metall savdo');await dlg.getByLabel('Material 1',{exact:true}).selectOption(mat.id);await dlg.getByLabel('Miqdor 1',{exact:true}).fill('10.125');await dlg.getByLabel('QQS 1',{exact:true}).fill('12');await dlg.locator('input[type=file]').setInputFiles({name:'M-101.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nUI test\n%%EOF')});
 await page.screenshot({path:path.join(artifacts,'form-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(artifacts,'form-mobile.png'),fullPage:true});assert.ok(await dlg.evaluate(e=>e.getBoundingClientRect().width<=window.innerWidth));assert.ok(await dlg.evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.setViewportSize({width:1440,height:1000});
 await dlg.getByRole('button',{name:'Saqlash va omborga yozish',exact:true}).click();await dlg.waitFor({state:'hidden'});await page.getByText('M-101',{exact:true}).waitFor();const inv=await one('SELECT * FROM material_invoices');assert.equal(inv.amount,1134);assert.equal((await one('SELECT qty FROM movements')).qty,10.125);
 await page.getByRole('button',{name:'1 material · tafsilotlar',exact:true}).click();await page.getByRole('heading',{name:'Faktura №M-101 · Metall savdo'}).waitFor();
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Oylik Excel yuklash',exact:true}).click();const download=await downloadPromise;const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(await download.path());assert.equal(wb.worksheets.length,2);assert.equal(wb.worksheets[0].getCell('F5').value,10.125);assert.equal(wb.worksheets[0].getCell('K5').value,1134);assert.equal(wb.worksheets[0].getCell('K6').value.result,1134);
 const pdfPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Yuklash',exact:true}).click();assert.equal((await pdfPromise).suggestedFilename(),'M-101.pdf');
 await page.screenshot({path:path.join(artifacts,'journal-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(artifacts,'journal-mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Bekor qilish',exact:true}).click();await page.locator('dialog[open]').getByLabel('Sabab',{exact:true}).fill('Xato faktura');await page.locator('dialog[open]').getByRole('button',{name:'Saqlash',exact:true}).click();await page.locator('dialog[open]').waitFor({state:'hidden'});await page.getByText('Bekor qilingan: Xato faktura',{exact:true}).waitFor();assert.equal((await one('SELECT count(*) AS n FROM movements')).n,0);assert.deepEqual(errors,[]);console.log('PASS browser: invoice entry, stock, VAT, PDF download, Excel values and totals, void, desktop and mobile');await context.close();
} catch(e){if(browser){const p=browser.contexts()[0]?.pages()[0];if(p){await p.screenshot({path:path.join(artifacts,'failure.png'),fullPage:true}).catch(()=>{});console.log(await p.locator('body').innerText());}}throw e;}finally{if(browser)await browser.close();if(web)web.kill();if(server)await new Promise(r=>server.close(r));await getPool().end();await management.query('DROP SCHEMA '+schema+' CASCADE');await management.end();}
