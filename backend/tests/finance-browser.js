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
const artifacts=path.join(root,'design-review/finance');fs.mkdirSync(artifacts,{recursive:true});
try {
 await migrate();const f=await one("INSERT INTO factories(code,name) VALUES('fin-demo','Energoqurilishmahsulot') RETURNING *");
 const hash=await hashPassword('Demo123!');const admin=await one("INSERT INTO users(username,name,role,factory_id,password_hash) VALUES('fin-admin','Buxgalter','admin',$1,$2) RETURNING *",[f.id,hash]);
 const p=await one("INSERT INTO products(factory_id,code,name) VALUES($1,'Ф5-4','Temirbeton fundament') RETURNING *",[f.id]);
 const order=await one("INSERT INTO orders(factory_id,no,customer,contract_no,date,items) VALUES($1,1,'UzKEK','EKM-3','2026-11-01',$2) RETURNING *",[f.id,JSON.stringify([{productId:p.id,qty:64,price:7250000,shippedBefore:0}])]);
 const employees=[];const attendance={};
 for(let i=0;i<12;i++){const e=await one('INSERT INTO hr_employees(factory_id,code,name,position,department,hire_date) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[f.id,String(i+1).padStart(3,'0'),['Akmal Karimov','Aziza Rasulova','Bekzod Ismoilov','Dilshod Ergashev','Feruza Sodiqova','Javohir Aliyev','Madina Rahimova','Nodir Rustamov','Otabek Saidov','Ravshan Olimov','Sardor Tursunov','Zafar Qodirov'][i],i%2?'Operator':'Armaturachi',i%2?'Beton sexi':'Armatura sexi','2026-10-01']);employees.push(e);
 await q('INSERT INTO hr_rates(factory_id,employee_id,effective_date,salary,coefficient,created_by) VALUES($1,$2,$3,$4,$5,$6)',[f.id,e.id,'2026-10-01',4000000+i*150000,247500,{name:'Sinov'}]);attendance[e.id]=Object.fromEntries(Array.from({length:20},(_,j)=>[j+1,{status:'work',hours:8,shift:'day'}]));}
 await q('INSERT INTO hr_months(factory_id,month,norm_hours,attendance) VALUES($1,$2,$3,$4)',[f.id,'2026-11',168,JSON.stringify(attendance)]);
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const backend='http://127.0.0.1:'+server.address().port;
 web=spawn(process.execPath,[path.join(root,'frontend/node_modules/next/dist/bin/next'),'start','-p','3102','-H','127.0.0.1'],{cwd:path.join(root,'frontend'),windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';web.stdout.on('data',b=>output+=b);web.stderr.on('data',b=>output+=b);
 for(let i=0;i<60;i++){if(web.exitCode!==null)throw new Error(output);try{if((await fetch('http://127.0.0.1:3102')).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));if(i===59)throw new Error(output);}
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const errors=[];const context=await browser.newContext({viewport:{width:1600,height:1000},acceptDownloads:true});
 await context.addInitScript(({token})=>{if(!localStorage.getItem('pto.token'))localStorage.setItem('pto.token',token);localStorage.setItem('pto.lang','uz');if(!localStorage.getItem('pto.tab'))localStorage.setItem('pto.tab',JSON.stringify('finance-payroll'));},{token:issueToken(admin)});
 await context.route('**/api/**',async route=>{const u=new URL(route.request().url());try{const response=await route.fetch({url:backend+u.pathname+u.search});await route.fulfill({response});}catch(e){errors.push(e.message);await route.abort();}});
 const page=await context.newPage();page.setDefaultTimeout(15000);await page.clock.setFixedTime(new Date('2026-11-11T12:00:00+05:00'));page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:3102');await page.locator('.finance-payroll tbody tr').first().waitFor();assert.equal(await page.locator('.finance-payroll tbody tr').count(),12);
 await page.screenshot({path:path.join(artifacts,'payroll-desktop.png'),fullPage:true});
 await page.getByLabel('Batafsil hisob-kitob',{exact:true}).check();assert.equal(await page.locator('.finance-payroll thead th').count(),16);await page.getByLabel('Batafsil hisob-kitob',{exact:true}).uncheck();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(artifacts,'payroll-mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));await page.setViewportSize({width:1600,height:1000});
 await page.locator('.finance-payroll tbody tr').first().getByRole('button',{name:'To‘lov',exact:true}).click();const form=page.locator('dialog[open]');await form.getByLabel('Summa',{exact:true}).fill('1000000');await form.getByRole('button',{name:'Saqlash',exact:true}).click();await form.waitFor({state:'hidden'});await page.locator('.finance-payroll tbody tr').first().waitFor();
 const ms=await one('SELECT * FROM hr_payments WHERE factory_id=$1',[f.id]);assert.equal(ms.amount,1000000);
 await page.locator('#nav-tab-finance-orders').click();await page.getByRole('heading',{name:'Shartnomadan to‘lovgacha'}).waitFor();await page.getByRole('button',{name:'+ To‘lov qabul qilish'}).click();await page.locator('dialog[open]').getByLabel('Kelib tushgan summa').fill('25000000');await page.locator('dialog[open]').getByRole('button',{name:'Saqlash',exact:true}).click();await page.locator('dialog[open]').waitFor({state:'hidden'});await page.getByRole('heading',{name:'Shartnomadan to‘lovgacha'}).waitFor();
 // Create a persisted dispatch via the actual day/PDF workflow.
 await page.locator('.nav-group').count().catch(()=>0);
 await page.evaluate(()=>{localStorage.setItem('pto.tab',JSON.stringify('day'));});await page.reload();await page.getByRole('button',{name:'Накладная (PDF)',exact:false}).first().waitFor();
 await page.getByRole('button',{name:'Накладная (PDF)',exact:false}).first().click();await page.locator('dialog[open]').waitFor();
 const nk=page.locator('dialog[open]');await nk.locator('#nk-num').fill('101');await nk.locator('#nk-contract').fill('EKM-3');await nk.locator('#nk-contract').dispatchEvent('change');
 await nk.locator('#nk-recv').fill('Uzun podstansiya');await nk.locator('#nk-car').fill('75 A 123 AA');await nk.getByLabel('Наименование',{exact:true}).first().fill('Ф5-4');await nk.getByLabel('Кол-во',{exact:true}).first().fill('51');await nk.locator('#nk-drv').click();
 const generatedDownload=page.waitForEvent('download');await nk.getByRole('button',{name:'PDF yuklab olish',exact:true}).click();await generatedDownload;await nk.waitFor({state:'hidden',timeout:30000});
 const archive=await one('SELECT * FROM dispatch_documents WHERE factory_id=$1',[f.id]);assert.ok(archive);assert.equal(archive.number,'101');assert.ok(archive.sizeBytes>1000);assert.equal((await one('SELECT shipments FROM days WHERE factory_id=$1',[f.id])).shipments[0].dispatchId,archive.id);
 const pdf=archive.contentBase64;
 await page.evaluate(()=>localStorage.setItem('pto.tab',JSON.stringify('finance-orders')));await page.reload();await page.getByRole('button',{name:'+ Faktura PDF'}).waitFor();await page.getByRole('button',{name:'+ Faktura PDF'}).click();const inv=page.locator('dialog[open]');await inv.getByLabel('Faktura raqami',{exact:true}).fill('F-101');await inv.locator('input[type=file]').setInputFiles({name:'Faktura_101.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdf,'base64')});await inv.getByLabel('Ф5-4 faktura soni',{exact:true}).fill('20');await inv.getByRole('button',{name:'Faktura va PDFni saqlash',exact:true}).click();await inv.waitFor({state:'hidden'});await page.getByText('№ F-101',{exact:true}).waitFor();
 assert.equal((await one('SELECT amount FROM finance_invoices WHERE factory_id=$1',[f.id])).amount,145000000);
 await page.getByRole('button',{name:'Tayyor sonini kiritish',exact:true}).click();await page.locator('dialog[open] input[type=number]').fill('64');await page.locator('dialog[open]').getByRole('button',{name:'Saqlash',exact:true}).click();await page.locator('dialog[open]').waitFor({state:'hidden'});await page.getByRole('heading',{name:'Fakturalar va PDF hujjatlar'}).waitFor();
 await page.screenshot({path:path.join(artifacts,'orders-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'Ф5-4 ↗',exact:true}).click();await page.locator('dialog[open]').getByText('75 A 123 AA',{exact:true}).waitFor();await page.screenshot({path:path.join(artifacts,'shipment-history.png'),fullPage:true});const popup=page.waitForEvent('popup');await page.locator('dialog[open]').getByRole('button',{name:'№ 101 · PDF ↗',exact:true}).click();const pdfPage=await popup;await pdfPage.waitForURL('blob:**');await pdfPage.close();await page.keyboard.press('Escape');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Yuklash',exact:true}).click();const file=await download;assert.equal(file.suggestedFilename(),'Faktura_101.pdf');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(artifacts,'orders-mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 await page.setViewportSize({width:1600,height:1000});await page.evaluate(()=>localStorage.setItem('pto.tab',JSON.stringify('ord')));await page.reload();await page.locator('.ord-chip').first().click();await page.locator('dialog[open]').getByText('75 A 123 AA',{exact:true}).waitFor();assert.equal(await page.locator('dialog[open]').getByRole('button',{name:'№ 101 · PDF ↗',exact:true}).count(),1);await page.keyboard.press('Escape');
 const limited=await one('INSERT INTO users(username,role,factory_id,password_hash) VALUES($1,$2,$3,$4) RETURNING *',['limited-pto','pto',f.id,hash]);
 await page.evaluate(token=>{localStorage.setItem('pto.token',token);localStorage.setItem('pto.tab',JSON.stringify('finance-orders'));},issueToken(limited));await page.reload();await page.getByText('ПТО muhandisi',{exact:true}).waitFor();assert.equal(await page.locator('#nav-group-finance').count(),0);assert.equal(await page.getByRole('heading',{name:'Shartnomadan to‘lovgacha'}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS browser: all employees, salary payment, customer receipt, invoice upload and download, progress, shipment modal/PDF, desktop and mobile');
 await context.close();
} catch(e) {if(browser){const pg=browser.contexts()[0]?.pages()[0];if(pg){await pg.screenshot({path:path.join(artifacts,'failure.png'),fullPage:true}).catch(()=>{});console.log('UI FAILURE',await pg.locator('body').innerText().catch(()=>''));}}throw e;} finally {if(browser)await browser.close();if(web)web.kill();if(server)await new Promise(r=>server.close(r));await getPool().end();await management.query('DROP SCHEMA '+schema+' CASCADE');await management.end();}
