import { one } from './db.js';
import { ValidationError } from './valid.js';
export function cleanLogo(value){
 if(!value)return '';
 if(typeof value!=='string'||value.length>700000)throw new ValidationError('Logo PNG yoki JPEG, 500 KB gacha bo‘lsin');
 const m=value.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/);
 if(!m)throw new ValidationError('Faqat PNG va JPEG logo qabul qilinadi');
 const b=Buffer.from(m[2],'base64');if(b.length>512000||b.toString('base64')!==m[2])throw new ValidationError('Logo hajmi yoki formati noto‘g‘ri');
 if(m[1]==='png'){
  if(b.length<24||!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new ValidationError('PNG fayl noto‘g‘ri');
  if(!b.readUInt32BE(16)||!b.readUInt32BE(20)||b.readUInt32BE(16)>2000||b.readUInt32BE(20)>2000)throw new ValidationError('Logo o‘lchami 2000×2000 gacha bo‘lsin');
 }else{
  if(!(b[0]===255&&b[1]===216&&b[2]===255))throw new ValidationError('JPEG fayl noto‘g‘ri');
  let found=false;
  for(let i=2;i+8<b.length;){if(b[i]!==255)break;const marker=b[i+1];if(marker===218||marker===217)break;const length=b.readUInt16BE(i+2);if(length<2||i+2+length>b.length)break;
   if([192,193,194].includes(marker)){const h=b.readUInt16BE(i+5),w=b.readUInt16BE(i+7);if(!h||!w||h>2000||w>2000)throw new ValidationError('Logo o‘lchami 2000×2000 gacha bo‘lsin');found=true;break;}i+=2+length;
  }if(!found)throw new ValidationError('JPEG rasm o‘lchami aniqlanmadi');
 }
 return value;
}
export async function factoryProfile(factoryId,c){
 const row=await one('SELECT f.name,s.company,s.document_profile,s.document_version FROM factories f LEFT JOIN settings s ON s.factory_id=f.id WHERE f.id=$1',[factoryId],c);
 const p=row?.documentProfile||{};return {factoryId,version:row?.documentVersion||1,...p,company:p.company||row?.company||row?.name||'',logo:p.logo||''};
}
export async function employerWithIdentity(factoryId,profile={},c){
 const p=await factoryProfile(factoryId,c),s=await one('SELECT document_profile FROM settings WHERE factory_id=$1',[factoryId],c);
 if(!s?.documentProfile?.company)return {...profile,company:profile.company||p.company,logo:p.logo};
 return {...profile,...Object.fromEntries(Object.entries(p).filter(([k])=>!['factoryId','version'].includes(k)))};
}
