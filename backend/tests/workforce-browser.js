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
  await page.locator('.hr-module').getByRole('tab',{name:'Kadrlar nazorati',exact:true}).click();
  await page.locator('.hr-workforce h2').getByText('Kadrlar nazorati',{exact:true}).waitFor();
  await page.screenshot({path:path.join(artifacts,'10-manager-overview.png'),fullPage:true});
  await page.locator('.hr-workforce-links').getByRole('button',{name:'Ta’tillar',exact:true}).click();
  await page.getByRole('button',{name:'Limitni belgilash',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Yillik ta’til limiti (kalendar kun)',{exact:true}).fill('20');
  await page.getByRole('dialog').getByRole('button',{name:'Saqlash',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Yangi yozuv',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Xodim',{exact:true}).selectOption(employee.id);
  await page.getByRole('dialog').getByLabel('Nomi',{exact:true}).fill('Yillik ta’til sinovi');
  await page.getByRole('dialog').getByLabel('Boshlanish sanasi',{exact:true}).fill('2026-10-05');
  await page.getByRole('dialog').getByLabel('Tugash sanasi',{exact:true}).fill('2026-10-07');
  await page.getByRole('dialog').getByRole('button',{name:'Saqlash',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Tasdiqlash',exact:true}).click();
  await page.getByRole('button',{name:'Tabelga qo‘llash',exact:true}).waitFor();
  await page.getByRole('button',{name:'Tabelga qo‘llash',exact:true}).click();
  await page.getByText('Tabelga qo‘llangan',{exact:true}).waitFor();
  assert.equal((await one('SELECT attendance FROM hr_months WHERE factory_id=$1',[f.id])).attendance[employee.id]['5'].status,'leave');
  await page.screenshot({path:path.join(artifacts,'11-leave-balance.png'),fullPage:true});
  for(const title of ['Smena rejasi','Buyruqlar','Hujjat muddatlari','Himoya vositalari']){
    await page.getByLabel('Qo‘shimcha bo‘lim',{exact:true}).selectOption({label:title});
    await page.locator('.hr-workforce h2').getByText(title,{exact:true}).waitFor();
    await page.getByRole('button',{name:'Yangi yozuv',exact:true}).click();
    await page.getByRole('dialog').getByLabel('Xodim',{exact:true}).selectOption(employee.id);
    await page.getByRole('dialog').getByLabel('Nomi',{exact:true}).fill(title+' sinovi');
    await page.getByRole('dialog').getByRole('button',{name:'Saqlash',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.getByRole('button',{name:'Tasdiqlash',exact:true}).click();
    await page.locator('.hr-records-table .pill').getByText('Tasdiqlangan',{exact:true}).waitFor();
  }
  await page.getByRole('button',{name:'RU',exact:true}).click();
  await page.locator('.hr-workforce h2').getByText('Средства защиты',{exact:true}).waitFor();
  await page.getByRole('button',{name:'ЎЗ',exact:true}).click();
  await page.locator('.hr-workforce h2').getByText('Ҳимоя воситалари',{exact:true}).waitFor();
  await page.getByRole('button',{name:'UZ',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(artifacts,'12-manager-mobile.png'),fullPage:true});
  await page.setViewportSize({width:320,height:780});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log('PASS workforce browser: dashboard, allowance, leave approval and attendance, shifts/orders/documents/equipment forms, UZ/KR/RU and mobile');
} finally {
  if(browser)await browser.close();if(web){web.kill();await new Promise(resolve=>{if(web.exitCode!==null)return resolve();web.once('exit',resolve);setTimeout(resolve,3000);});}
  if(server)await new Promise(resolve=>server.close(resolve));await getPool().end();
  await management.query(`DROP SCHEMA ${schema} CASCADE`);await management.end();
}
