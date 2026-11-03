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
const schema=`personnel_ui_${crypto.randomBytes(8).toString('hex')}`;
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
    const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-11-03T12:00:00+05:00'));page.on('pageerror',e=>{errors.push(e.message);console.log('BROWSER ERROR',e.message);});page.on('dialog',d=>d.accept());
    await page.goto('http://127.0.0.1:3100');
    try{await page.locator('.hr-module').getByRole('tab',{name:'Xodimlar',exact:true}).waitFor();}
    catch(e){await page.screenshot({path:path.join(artifacts,'debug.png'),fullPage:true});console.log('UI DEBUG',await page.locator('body').innerText(),JSON.stringify(errors));throw e;}
    return {context,page};
  }
  const {context,page}=await contextFor('admin');
  const dialog=page.getByRole('dialog');
  const fill=async(values)=>{for(const [name,value] of Object.entries(values))await dialog.getByLabel(name,{exact:true}).fill(String(value));};
  const save=async()=>{await dialog.getByRole('button',{name:'Saqlash',exact:true}).click();await dialog.waitFor({state:'hidden'});};
  await page.getByRole('button',{name:'Yangi xodim',exact:true}).click();
  await fill({'Tabel raqami':'002','F.I.Sh.':'Yangi Sinov Xodimi','Lavozim':'Operator','Sex / bo‘lim':'Sinov sexi','Telefon':'+998901234567','Ikkinchi telefon':'+998911234567','Tug‘ilgan sana':'1990-03-02','Pasport / ID raqami':'AA1234567','JShShIR':'12345678901234','Doimiy manzil':'Sinov ko‘chasi, 15-uy','Ishga kirish sanasi':'2026-11-01','Berilgan sana':'2020-01-02','Kim tomonidan berilgan':'Sinov IIB','Ma’lumoti':'Oliy','Mutaxassisligi':'Muhandis'});await save();
  await page.locator('.hr-personnel').waitFor();assert.equal(await page.locator('.personnel-avatar').count(),1);
  const e=await one("SELECT * FROM hr_employees WHERE factory_id=$1 AND code='002'",[f.id]);
  assert.equal(e.profile.passport,'AA1234567');assert.equal(e.profile.phone2,'+998911234567');assert.equal((await one('SELECT count(*) n FROM hr_employment_docs WHERE employee_id=$1',[e.id])).n,2);
  await page.screenshot({path:path.join(artifacts,'13-employee-profile.png'),fullPage:true});
  await page.getByRole('tab',{name:'Shartnoma va buyruqlar',exact:true}).click();
  await page.getByRole('button',{name:'Korxona rekvizitlari',exact:true}).click();
  await fill({'Korxona nomi':'Sinov zavodi MChJ','Korxona qisqa nomi':'SZ','Direktor F.I.Sh.':'Sinov Rahbarov','Kadrlar bo‘yicha mas’ul':'Sinov Kadrov','Shahar / tuman':'Toshkent','Korxona manzili':'Sinov ko‘chasi, 15-uy','Korxona telefoni':'+998711234567','STIR':'123456789','Bank rekvizitlari':'Sinov banki, h/r 20208000000000000001'});await save();
  const contract=()=>page.locator('.personnel-documents article').filter({has:page.getByRole('heading',{name:'Mehnat shartnomasi',exact:true})});
  const hire=()=>page.locator('.personnel-documents article').filter({has:page.getByRole('heading',{name:'Ishga qabul qilish to‘g‘risida',exact:true})});
  await contract().getByRole('button',{name:'Tahrirlash',exact:true}).click();
  await fill({'Hujjat raqami':'S-002','Hujjat sanasi':'2026-11-01','Ish joyi':'Sinov zavodi','Ish rejimi':'Dushanba–juma, 09:00–18:00, tushlik 13:00–14:00','Lavozim maoshi':'3500000','Mehnat vazifalari':'Ishlab chiqarish uskunasini boshqarish'});await save();
  async function pdf(card,name){console.log('PDF',name);const [download]=await Promise.all([page.waitForEvent('download'),card.getByRole('button',{name:'PDF',exact:true}).click()]);await download.saveAs(path.join(root,'tmp/pdfs/'+name));}
  try{await pdf(contract(),'hr-contract.pdf');}catch(err){console.log('PDF DEBUG',await page.locator('.hr-personnel').innerText(),errors);throw err;}
  async function confirm(card){await card.getByRole('button',{name:'Imzolanganini tasdiqlash',exact:true}).click();await dialog.getByLabel('Qog‘ozdagi hujjat tomonlar tomonidan imzolanganmi?',{exact:true}).selectOption('yes');await dialog.getByLabel('Huquqiy asos va barcha rekvizitlar tekshirildimi?',{exact:true}).selectOption('yes');await dialog.getByRole('button',{name:'Tasdiqlash',exact:true}).click();await dialog.waitFor({state:'hidden'});}
  await confirm(contract());await hire().getByRole('button',{name:'Tahrirlash',exact:true}).click();await fill({'Hujjat raqami':'B-002','Hujjat sanasi':'2026-11-01'});await save();await pdf(hire(),'hr-hire.pdf');await confirm(hire());
  await page.getByRole('button',{name:'Lavozimini o‘zgartirish',exact:true}).click();
  await fill({'Hujjat raqami':'B-003','Hujjat sanasi':'2026-11-02','Amal qilish sanasi':'2026-11-02','Yangi lavozim':'Bosh operator','Yangi bo‘lim':'Ishlab chiqarish','Qo‘shimcha kelishuv raqami':'Q-002','Qo‘shimcha kelishuv sanasi':'2026-11-02','Xodimning yozma roziligi / asos':'02.11.2026 dagi yozma rozilik','Yangi lavozim maoshi':'4500000'});await save();
  const addendum=()=>page.locator('.personnel-documents article').filter({has:page.getByRole('heading',{name:'Mehnat shartnomasiga qo‘shimcha kelishuv',exact:true})});
  const transfer=()=>page.locator('.personnel-documents article').filter({has:page.getByRole('heading',{name:'Boshqa lavozimga o‘tkazish to‘g‘risida',exact:true})});
  await pdf(addendum(),'hr-addendum.pdf');await confirm(addendum());await pdf(transfer(),'hr-transfer.pdf');await confirm(transfer());assert.equal((await one('SELECT position FROM hr_employees WHERE id=$1',[e.id])).position,'Bosh operator');
  await page.getByRole('button',{name:'Ishdan bo‘shatish',exact:true}).click();await fill({'Hujjat raqami':'B-004','Bekor qilish sababi':'Taraflarning o‘zaro kelishuvi','Ariza / kelishuv / tasdiqlovchi hujjat':'03.11.2026 dagi yozma kelishuv'});await dialog.getByLabel('Bekor qilish asosi',{exact:true}).selectOption('mutual');await save();
  const termination=()=>page.locator('.personnel-documents article').filter({has:page.getByRole('heading',{name:'Mehnat shartnomasini bekor qilish to‘g‘risida',exact:true})});
  await pdf(termination(),'hr-termination.pdf');await confirm(termination());assert.equal((await one('SELECT end_date FROM hr_employees WHERE id=$1',[e.id])).endDate,'2026-11-03');await page.getByText('Ishdan chiqqan',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Ishdan bo‘shatish',exact:true}).count(),0);
  await page.screenshot({path:path.join(artifacts,'14-employment-documents.png'),fullPage:true});
  await page.getByRole('tab',{name:'Shaxsiy delo',exact:true}).click();const passport=page.locator('.personnel-grid article').filter({has:page.getByRole('heading',{name:'Pasport nusxasi',exact:true})});
  await passport.locator('input[type=file]').setInputFiles({name:'Sinov.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n% sinov nusxasi')});await passport.getByRole('button',{name:'Sinov.pdf',exact:true}).waitFor();
  await passport.getByRole('button',{name:'Holatni belgilash',exact:true}).click();await dialog.getByLabel('Holat',{exact:true}).selectOption('received');await save();assert.equal((await one('SELECT profile FROM hr_employees WHERE id=$1',[e.id])).profile.dossier.passport.status,'received');
  await page.screenshot({path:path.join(artifacts,'15-personal-dossier.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.getByRole('tab',{name:'Ma’lumotlar',exact:true}).click();await page.screenshot({path:path.join(artifacts,'16-profile-mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.setViewportSize({width:320,height:780});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await context.close();assert.deepEqual(errors,[]);console.log('PASS personnel browser: complete employee creation, compact navigation, employer settings, contract and four PDF orders, signed workflow, promotion, termination, dossier upload/status, desktop/mobile and no browser errors');
} finally {
  if(browser)await browser.close();if(web){web.kill();await new Promise(resolve=>{if(web.exitCode!==null)return resolve();web.once('exit',resolve);setTimeout(resolve,3000);});}
  if(server)await new Promise(resolve=>server.close(resolve));await getPool().end();
  await management.query(`DROP SCHEMA ${schema} CASCADE`);await management.end();
}
