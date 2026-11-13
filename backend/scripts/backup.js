import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {BACKUP_TABLES} from '../src/backup-tables.js';import {getPool,tx} from '../src/db.js';import {encryptBackup} from '../src/backup-crypto.js';
const dir=path.resolve(process.env.BACKUP_DIR||path.join(os.homedir(),'zavodlar-private-backups'));
if(/(?:^|[\\/])(public_html|public|www)(?:[\\/]|$)/i.test(dir))throw new Error('Zaxira papkasi web katalogidan tashqarida bo‘lsin');
const key=process.env.BACKUP_ENCRYPTION_KEY;
// Validate configuration before creating files or connecting to the database.
encryptBackup({},key);
const keep=Number(process.env.BACKUP_KEEP||7);if(!Number.isInteger(keep)||keep<1||keep>60)throw new Error('BACKUP_KEEP 1–60 bo‘lsin');
const upload=process.env.BACKUP_UPLOAD_URL;if(upload){let u;try{u=new URL(upload);}catch{throw new Error('Zaxira yuklash manzili noto‘g‘ri');}if(u.protocol!=='https:'||u.username||u.password)throw new Error('Zaxira yuklash manzili HTTPS bo‘lsin');}
try{const result=await tx(async c=>{
 await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
 const lock=await c.query('SELECT pg_try_advisory_xact_lock(482713) AS locked');if(!lock.rows[0].locked)throw new Error('Boshqa zaxira jarayoni ishlayapti');
 const data={};for(const table of BACKUP_TABLES)data[table]=(await c.query('SELECT * FROM '+table)).rows;
 const now=new Date(),stamp=now.toISOString().replace(/[:.]/g,'-'),name='zavodlar-'+stamp+'.json.gz.enc';
 const envelope={app:'zavodlar',format:2,db:'postgres',createdAt:now.toISOString(),createdBy:'automatic-backup',counts:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])),data};
 const body=encryptBackup(envelope,key);await fs.mkdir(dir,{recursive:true,mode:0o700});await fs.writeFile(path.join(dir,name),body,{flag:'wx',mode:0o600});
 let uploaded=false;if(upload){const response=await fetch(upload,{method:'PUT',headers:{'Content-Type':'application/octet-stream','X-Backup-Name':name,...(process.env.BACKUP_UPLOAD_TOKEN?{Authorization:'Bearer '+process.env.BACKUP_UPLOAD_TOKEN}:{})},body,signal:AbortSignal.timeout(60000),redirect:'error'});if(!response.ok)throw new Error('Tashqi zaxira serveri yuklashni qabul qilmadi');uploaded=true;}
 // Retention is limited to files produced by this program, after a successful backup/upload.
 const files=(await fs.readdir(dir)).filter(n=>/^zavodlar-[0-9TZ.-]+[.]json[.]gz[.]enc$/.test(n)).sort().reverse();for(const n of files.slice(keep))await fs.unlink(path.join(dir,n));
 const status={createdAt:now.toISOString(),uploaded,bytes:body.length,retained:Math.min(files.length,keep)};await fs.writeFile(path.join(dir,'backup-status.json'),JSON.stringify(status),{mode:0o600});return status;
});console.log('Shifrlangan zaxira saqlandi: '+result.createdAt+'; tashqi nusxa: '+(result.uploaded?'ha':'sozlanmagan'));
}catch(e){console.error('Zaxira olinmadi: '+(e.code||e.message));process.exitCode=1;}finally{await getPool().end();}
