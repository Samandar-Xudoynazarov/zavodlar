const fs=require('node:fs/promises'),path=require('node:path'),JSZip=require('jszip');
(async()=>{const frontend=path.resolve(__dirname,'..'),build=path.join(frontend,'.next');await fs.access(path.join(build,'BUILD_ID'));
const root=await fs.realpath(frontend);
const zip=new JSZip();
// Next 16 (Turbopack) .next/node_modules ichida tashqi paketlarga symlink yaratadi.
// Zip symlinkni saqlay olmaydi, shuning uchun frontend papkasi ichidagi symlinklar haqiqiy fayllar bilan ko'chiriladi.
// Frontend papkasidan tashqariga olib boradigan symlink bo'lsa, xavfsizlik uchun to'xtaydi.
async function add(dir,prefix){for(const e of await fs.readdir(dir,{withFileTypes:true})){if(e.name==='cache'||(prefix==='.next'&&e.name==='dev'))continue;let source=path.join(dir,e.name);const name=prefix+'/'+e.name;let stat=e;
if(e.isSymbolicLink()){const real=await fs.realpath(source);if(real!==root&&!real.startsWith(root+path.sep))throw new Error('Build ichida frontend papkasidan tashqariga olib boruvchi symlink: '+name+' -> '+real);source=real;stat=await fs.stat(real);console.log('symlink nusxalandi: '+name);}
if(stat.isDirectory())await add(source,name);else if(stat.isFile())zip.file(name,await fs.readFile(source));}}
await add(build,'.next');const target=path.resolve(frontend,'../tmp/deploy-frontend');await fs.mkdir(target,{recursive:true});const output=path.join(target,'frontend-update.zip');const body=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}});await fs.writeFile(output,body);console.log('Tayyor: '+output+' ('+(body.length/1024/1024).toFixed(1)+' MB). node_modules, .env va build keshi kiritilmadi.');})().catch(e=>{console.error(e.message);process.exitCode=1;});
