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
const runtime=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const require=createRequire(import.meta.url);
const {chromium}=require(runtime);
const ExcelJS=require(path.join(root,'frontend/node_modules/exceljs'));
const source=process.env.DATABASE_URL||process.env.POSTGRES_URL;
const schema=`hr_ui_${crypto.randomBytes(8).toString('hex')}`;
const management=new pg.Pool({connectionString:source});
await management.query(`CREATE SCHEMA ${schema}`);
const url=new URL(source);url.searchParams.set('options',`-c search_path=${schema},public`);
process.env.DATABASE_URL=url.toString();process.env.AUTH_SECRET=crypto.randomBytes(32).toString('hex');process.env.CORS_ORIGIN='*';
const {one,q,migrate,getPool}=await import('../src/db.js');
const {issueToken,hashPassword}=await import('../src/auth.js');
const {default:app}=await import('../src/app.js');let server,web,browser;
const artifacts=path.join(root,'design-review/hr');fs.mkdirSync(artifacts,{recursive:true});
try {
  await migrate();const f=await one("INSERT INTO factories(code,name) VALUES('hr-demo','Sinov zavodi') RETURNING *");
  const hash=await hashPassword('Demo123!'),users={};
  for(const role of ['admin','kadrlar','usta','buxgalter'])users[role]=await one('INSERT INTO users(username,name,role,factory_id,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING *',['demo_'+role,'Sinov '+role,role,f.id,hash]);
  const employee=await one("INSERT INTO hr_employees(factory_id,code,name,position,department,hire_date) VALUES($1,'001','Sinov Xodimov','Operator','Ishlab chiqarish','2026-10-01') RETURNING *",[f.id]);
  await q('INSERT INTO hr_rates(factory_id,employee_id,effective_date,salary,coefficient,created_by) VALUES($1,$2,$3,$4,$5,$6)',[f.id,employee.id,'2026-10-01',3360000,247500,{name:'Sinov'}]);
  await q('INSERT INTO hr_months(factory_id,month,norm_hours,attendance) VALUES($1,$2,$3,$4)',[f.id,'2026-10',168,JSON.stringify({[employee.id]:{1:{status:'work',hours:8,shift:'day'}}})]);
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const backend=`http://127.0.0.1:${server.address().port}`;
  web=spawn(process.execPath,[path.join(root,'frontend/node_modules/next/dist/bin/next'),'start','-p','3100','-H','127.0.0.1'],{cwd:path.join(root,'frontend'),windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';web.stdout.on('data',b=>output+=b);web.stderr.on('data',b=>output+=b);
  for(let i=0;i<90;i++){
    if(web.exitCode!==null)throw new Error(output);
    try{if((await fetch('http://127.0.0.1:3100')).ok)break;}catch{}
    await new Promise(r=>setTimeout(r,1000));if(i===89)throw new Error(output);
  }
  browser=await chromium.launch({channel:'chrome',headless:true});
  const errors=[];
  async function contextFor(role,viewport={width:1440,height:1000}) {
    const context=await browser.newContext({viewport,acceptDownloads:true});
    await context.addInitScript(({token})=>{localStorage.setItem('pto.token',token);localStorage.setItem('pto.lang','uz');localStorage.setItem('pto.tab',JSON.stringify('hr'));}, {token:issueToken(users[role])});
    await context.route('**/api/**',async route=>{
      const request=route.request(),u=new URL(request.url());
      try{const response=await route.fetch({url:backend+u.pathname+u.search});await route.fulfill({response});}catch(e){errors.push(e.message);await route.abort();}
    });
    const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-10-30T12:00:00+05:00'));page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto('http://127.0.0.1:3100');
    try{await page.locator('.hr-module').getByRole('tab',{name:'Xodimlar',exact:true}).waitFor();}
    catch(e){await page.screenshot({path:path.join(artifacts,'debug.png'),fullPage:true});console.log('UI DEBUG',await page.locator('body').innerText(),JSON.stringify(errors));throw e;}
    return {context,page};
  }
  const {context,page}=await contextFor('admin');
  await page.getByRole('button',{name:'Maosh tarixi',exact:true}).click();
  await page.getByRole('button',{name:'Maosh belgilash',exact:true}).waitFor();
  await page.getByRole('button',{name:'Tahrirlash',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Lavozim maoshi',{exact:true}).fill('3480000');
  await page.getByRole('dialog').getByRole('button',{name:'Saqlash',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal((await one('SELECT salary FROM hr_rates WHERE employee_id=$1',[employee.id])).salary,3480000);
  await page.locator('.hr-module').getByRole('tab',{name:'Tabel',exact:true}).click();
  await page.getByRole('button',{name:'Bugun',exact:true}).click();
  assert.equal(await page.getByLabel('Sana',{exact:true}).inputValue(),'30');
  await page.getByLabel('Sana',{exact:true}).selectOption('1');
  const [tabelDownload]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Oylik tabel · Excel',exact:true}).click()]);
  const tabelFile=path.join(root,'tmp/pdfs/hr-monthly-tabel.xlsx');await tabelDownload.saveAs(tabelFile);
  const tabelBook=new ExcelJS.Workbook();await tabelBook.xlsx.readFile(tabelFile);
  const tabelSheet=tabelBook.worksheets[0];assert.equal(tabelBook.worksheets.length,1);
  assert.equal(tabelSheet.pageSetup.orientation,'landscape');assert.equal(tabelSheet.pageSetup.paperSize,9);
  assert.equal(tabelSheet.pageSetup.fitToWidth,1);assert.equal(tabelSheet.pageSetup.fitToHeight,0);
  assert.equal(tabelSheet.getCell('E6').value,'I');assert.equal(tabelSheet.getCell('E7').value,8);
  assert.equal(tabelSheet.getCell('AI4').value,31);
  await page.locator('.hr-daily input').first().fill('7');
  await page.getByRole('button',{name:'Tabelni saqlash',exact:true}).click();
  await page.getByRole('button',{name:'Tabelni saqlash',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.hr-daily input')?.value==='7'&&document.querySelector('.hr-module')?.getAttribute('aria-busy')==='false');
  assert.equal((await one('SELECT attendance FROM hr_months WHERE factory_id=$1',[f.id])).attendance[employee.id]['1'].hours,7);
  await page.screenshot({path:path.join(artifacts,'09-daily-list.png'),fullPage:true});
  await page.getByRole('button',{name:'Oylik kalendar',exact:true}).click();
  await page.locator('.hr-toolbar select').last().selectOption(employee.id);
  await page.getByRole('spinbutton',{name:'1 · Ish soati',exact:true}).fill('6');
  await page.getByRole('button',{name:'Tabelni saqlash',exact:true}).click();
  await page.getByRole('button',{name:'Saqlangan',exact:true}).waitFor();
  const saved=await one('SELECT attendance FROM hr_months WHERE factory_id=$1',[f.id]);assert.equal(saved.attendance[employee.id]['1'].hours,6);
  await page.screenshot({path:path.join(artifacts,'01-tabel-desktop.png'),fullPage:true});
  await page.getByLabel('Qo‘shimcha bo‘lim',{exact:true}).selectOption('payroll');
  await page.getByRole('button',{name:'Qo‘shimchalar',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Qo‘shimcha haq',{exact:true}).fill('100000');
  await page.getByRole('dialog').getByRole('button',{name:'Saqlash',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByLabel('Qo‘shimcha bo‘lim',{exact:true}).selectOption('payments');
  await page.getByRole('button',{name:'To‘lov yozish',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Summa',{exact:true}).fill('10000');
  await page.getByRole('dialog').getByRole('button',{name:'Saqlash',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal((await one('SELECT count(*) AS n FROM hr_payments WHERE factory_id=$1',[f.id])).n,1);
  await page.getByLabel('Qo‘shimcha bo‘lim',{exact:true}).selectOption('payroll');
  await page.screenshot({path:path.join(artifacts,'02-payroll-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'RU',exact:true}).click();
  assert.equal(await page.locator('.hr-extra select option:checked').innerText(),'Расчёт зарплаты');
  await page.screenshot({path:path.join(artifacts,'03-payroll-ru.png'),fullPage:true});
  await page.getByRole('button',{name:'ЎЗ',exact:true}).click();
  assert.equal(await page.locator('.hr-extra select option:checked').innerText(),'Ойлик ҳисоблаш');
  await page.screenshot({path:path.join(artifacts,'04-payroll-kr.png'),fullPage:true});
  await page.getByRole('button',{name:'UZ',exact:true}).click();
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Excel',exact:true}).click()]);
  const file=path.join(root,'tmp/pdfs/hr-browser-export.xlsx');await download.saveAs(file);
  const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(file);assert.equal(wb.worksheets.length,2);assert.ok(wb.worksheets[0].rowCount>4);
  await page.getByRole('button',{name:'Oylikni tasdiqlash',exact:true}).click();
  await page.getByRole('button',{name:'Oyni yopish',exact:true}).waitFor();
  await page.getByRole('button',{name:'Oyni yopish',exact:true}).click();
  await page.getByText('Yopilgan',{exact:true}).first().waitFor();
  assert.equal((await one('SELECT status FROM hr_months WHERE factory_id=$1',[f.id])).status,'closed');
  await page.getByRole('button',{name:'Hisob varaqasi',exact:true}).first().click();
  await page.locator('.hr-payslip').waitFor();await page.screenshot({path:path.join(artifacts,'05-payslip.png'),fullPage:true});
  const printed=await page.pdf({format:'A4',printBackground:true});assert.ok(printed.length>2000);
  await page.locator('.hr-module').getByRole('tab',{name:'Xodimlar',exact:true}).click();
  await page.getByRole('button',{name:'Yangi xodim',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Tabel raqami',{exact:true}).fill('002');
  await page.getByRole('dialog').getByLabel('F.I.Sh.',{exact:true}).fill('Yangi Sinov Xodimi');
  await page.getByRole('dialog').getByLabel('Ishga kirish sanasi',{exact:true}).fill('2026-11-01');
  await page.getByRole('dialog').getByRole('button',{name:'Saqlash',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal((await one('SELECT count(*) AS n FROM hr_employees WHERE factory_id=$1',[f.id])).n,2);
  await page.locator('.personnel-title').getByRole('heading',{name:'Yangi Sinov Xodimi',exact:true}).waitFor();
  await context.close();
  for(const role of ['kadrlar','usta','buxgalter']) {
    const mobile=await contextFor(role,{width:390,height:844});
    assert.equal(await mobile.page.locator('.hr-extra option[value=payroll]').count(),role==='buxgalter'?1:0);
    assert.equal(await mobile.page.locator('.hr-extra option[value=payments]').count(),role==='buxgalter'?1:0);
    await mobile.page.locator('.hr-module').getByRole('tab',{name:'Tabel',exact:true}).click();
    await mobile.page.getByRole('button',{name:'Oylik kalendar',exact:true}).click();
    await mobile.page.locator('.hr-toolbar select').last().selectOption(employee.id);
    await mobile.page.screenshot({path:path.join(artifacts,`06-mobile-${role}.png`),fullPage:false});
    const overflow=await mobile.page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);assert.equal(overflow,false,role+' mobile overflow');
    await mobile.page.setViewportSize({width:320,height:780});
    assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,role+' 320px overflow');
    if(role==='buxgalter'){
      await mobile.page.getByLabel('Qo‘shimcha bo‘lim',{exact:true}).selectOption('payroll');
      await mobile.page.screenshot({path:path.join(artifacts,'07-payroll-mobile.png'),fullPage:false});
      await mobile.page.locator('.hr-pay-table').screenshot({path:path.join(artifacts,'08-payroll-mobile-card.png')});
      if(await mobile.page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)){
        await mobile.page.screenshot({path:path.join(artifacts,'debug-mobile-payroll.png'),fullPage:false});
        console.log('OVERFLOW',await mobile.page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+1&&getComputedStyle(e).position!=='fixed';}).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right,text:e.innerText?.slice(0,65)}))));
      }
      assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'payroll 320px overflow');
    }
    await mobile.context.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS browser: salary history, attendance save, extras, payment, UZ/KR/RU, Excel, approval/closing, payslip, mobile roles and no page errors');
} finally {
  if(browser)await browser.close();if(web){web.kill();await new Promise(resolve=>{if(web.exitCode!==null)return resolve();web.once('exit',resolve);setTimeout(resolve,3000);});}
  if(server)await new Promise(resolve=>server.close(resolve));await getPool().end();
  await management.query(`DROP SCHEMA ${schema} CASCADE`);await management.end();
}
