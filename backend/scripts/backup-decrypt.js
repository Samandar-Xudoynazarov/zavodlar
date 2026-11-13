import fs from 'node:fs/promises';import path from 'node:path';import {decryptBackup} from '../src/backup-crypto.js';
const [source,target]=process.argv.slice(2);if(!source||!target)throw new Error('Foydalanish: npm run backup:decrypt -- encrypted-file output.json');if(path.resolve(source)===path.resolve(target))throw new Error('Alohida chiqish fayli tanlang');
const data=decryptBackup(await fs.readFile(source),process.env.BACKUP_ENCRYPTION_KEY);await fs.writeFile(target,JSON.stringify(data),{flag:'wx',mode:0o600});console.log('Zaxira ochildi. Endi npm run restore orqali tekshiring.');
