// Read-only extracts. These do not change employee or approval state.
const value=v=>String(v||'________________');
const date=v=>v?String(v).slice(0,10).split('-').reverse().join('.'):'__.__.____';
export function centerDefinition({kind,employee:e,employer:em={},record:r,files=[],dossier={},today}){
 const ended=e.endDate&&e.endDate<=today;
 const p=text=>({text,margin:[0,0,0,10],alignment:'justify'});
 const title={certificate:'ISH JOYIDAN MA’LUMOTNOMA',dossier:'SHAXSIY DELO RO‘YXATI',leave:'TA’TIL KARTOCHKASI',shift:'SMENA REJASI',order:'BUYRUQ REYESTRIDAN KO‘CHIRMA',document:'HUJJAT MUDDATI KARTOCHKASI',equipment:'HIMOYA VOSITALARI KARTOCHKASI'}[kind]||'KADRLAR MA’LUMOTI';
 const content=[{text:value(em.company),fontSize:16,bold:true,alignment:'center',margin:[0,0,0,8]},p(`${value(em.address)} · Tel. ${value(em.phone)}`),{text:title,fontSize:15,bold:true,alignment:'center',margin:[0,15,0,20]},p(`Sana: ${date(today)}     № __________________`),p(`Xodim: ${value(e.name)} · Tabel raqami: ${value(e.code)}`)];
 if(kind==='certificate')content.push(p(`${value(e.name)} ${value(em.company)} korxonasida ${date(e.hireDate)} sanadan ${ended?date(e.endDate)+' sanagacha':'hozirga qadar'} ${value(e.department)} bo‘limida ${value(e.position)} lavozimida ${ended?'ishlagan':'ishlaydi'}.`),p('Ma’lumotnoma so‘ralgan joyga taqdim etish uchun berildi.'));
 else if(kind==='dossier'){
  const labels={passport:'Pasport nusxasi',residence:'Turar joy ma’lumotnomasi',criminal:'Sudlanmaganlik ma’lumotnomasi',narcology:'Narkologiya ma’lumotnomasi',psych:'Psixonevrologiya ma’lumotnomasi',medical086:'086-shakl tibbiy ma’lumotnoma',photo:'3×4 rasm - 2 dona',diploma:'Diplom nusxasi',experience:'Ish tajribasi',military:'Harbiy hisob hujjati',pinfl:'JShShIR hujjati',signed:'Imzolangan shartnoma va buyruqlar'};
  content.push({table:{headerRows:1,widths:[20,'*',95,45],body:[[{text:'№',bold:true},{text:'Hujjat',bold:true},{text:'Holat',bold:true},{text:'Fayl',bold:true}],...Object.entries(labels).map(([slot,label],i)=>[i+1,label,({received:'Olindi',not_applicable:'Tatbiq etilmaydi',pending:'Kutilmoqda'}[dossier[slot]?.status]||'Kutilmoqda'),files.filter(f=>f.slot===slot).length])]},margin:[0,12,0,20]});
 }else if(r){
  content.push(p(`Yozuv: ${value(r.title)}`),p(`Davr: ${date(r.startDate)} - ${date(r.endDate)}`),p(`Holat: ${({draft:'Qoralama',approved:'Tasdiqlangan',cancelled:'Bekor qilingan',completed:'Yakunlangan'}[r.status]||r.status)}`));
  const d=r.detail||{};
  if(kind==='leave')content.push(p(`Ta’til turi: ${d.leaveType==='annual'?'Yillik ta’til':'Ish haqi saqlanmaydigan ta’til'}`));
  if(kind==='shift')content.push(p(`Smena: ${d.shift==='night'?'Tungi':'Kunduzgi'}; kunlik soat: ${value(d.hours)}; hafta kunlari: ${(d.workDays||[]).map(x=>['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba'][x]).join(', ')}`));
  if(d.number)content.push(p(`Reyestr raqami: ${d.number}`));if(d.quantity)content.push(p(`Miqdor: ${d.quantity}`));if(d.note)content.push(p(`Izoh: ${d.note}`));
 }
 content.push({text:`Mas’ul: __________________   ${value(em.hrName)}`,margin:[0,25,0,15]},{text:`Rahbar: __________________   ${value(em.director)}`,margin:[0,10,0,20]},{text:kind==='certificate'?'QORALAMA - rekvizitlar tekshirilib, vakolatli shaxs tomonidan imzolanadi.':'Dasturdagi ma’lumotlardan ko‘chirma. Ushbu fayl imzolangan buyruq yoki mehnat shartnomasining o‘rnini bosmaydi.',fontSize:9,color:'#67748a'});
 return {pageSize:'A4',pageMargins:[48,42,48,42],defaultStyle:{font:'Times',fontSize:11,lineHeight:1.2},info:{title,author:em.company||''},content};
}
