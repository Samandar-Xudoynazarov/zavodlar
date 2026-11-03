// Layout follows the supplied one-page order and four-page employment contract.
// No scanned employee details, signatures or seals are copied into the template.
const val=(s)=>s===0?'0':String(s||'________________');
const dt=s=>s?s.split('-').reverse().join('.'):'__.__.____';
const para=(text,options={})=>({text,alignment:'justify',margin:[0,0,0,9],...options});
const line=()=>({canvas:[{type:'line',x1:0,y1:0,x2:495,y2:0,lineWidth:.7}],margin:[0,12,0,18]});
export const DOC_TITLES={contract:'Mehnat shartnomasi',hire:'Ishga qabul qilish to‘g‘risida',addendum:'Mehnat shartnomasiga qo‘shimcha kelishuv',transfer:'Boshqa lavozimga o‘tkazish to‘g‘risida',termination:'Mehnat shartnomasini bekor qilish to‘g‘risida'};
function base(doc,content){return {pageSize:'A4',pageMargins:[55,42,45,42],defaultStyle:{font:'Times',fontSize:12,lineHeight:1.15},info:{title:DOC_TITLES[doc.kind],author:doc.payload.employer.company||''},content};}
function signature(name,label='Imzo'){return {text:`${label}: __________________   ${name?val(name):''}`,margin:[0,20,0,0]};}
function bodyOrder(doc,cyr){
 const {employee:e,employer:em,terms:t}=doc.payload,C=s=>cyr(s),name=C(e.name),job=C(t.position||e.position),company=C(em.company),effective=dt(doc.effectiveDate);
 const head={columns:[{width:'*',text:[{text:`«${val(em.company)}»\n`,bold:true},'MAS’ULIYATI CHEKLANGAN JAMIYATI\n',`${val(em.address)}\nTel. ${val(em.phone)}`],fontSize:10,alignment:'center'},
 {width:70,text:C(em.shortName||'МЧЖ'),bold:true,fontSize:16,color:'#43205d',alignment:'center',margin:[0,20,0,0]},
 {width:'*',text:[{text:`«${company}»\n`,bold:true},'МАСЪУЛИЯТИ ЧЕКЛАНГАН ЖАМИЯТ\n',`${C(val(em.address))}\nТел. ${val(em.phone)}`],fontSize:10,alignment:'center'}],columnGap:10};
 let text=[],basis='';
 if(doc.kind==='hire'){
  text=[`«${company}» корхонасига ${effective} санадан ${job} вазифасига ${name} ишга қабул қилинсин.`,
  `Иш бошлаш вақти ${effective} санадан ҳисоблансин. Иш ҳақи имзоланган меҳнат шартномаси ва штат жадвалига мувофиқ ҳисоблансин.`];
  basis=`${dt(t.sourceContractDate||t.contractDate||doc.payload.contractDate)} санасидаги ${val(t.sourceContractNumber||t.contractNumber||doc.payload.contractNumber)}-сон меҳнат шартномаси ва Ўзбекистон Республикаси Меҳнат кодексининг 127-моддаси.`;
 }else if(doc.kind==='transfer'){
  text=[`${name} ${effective} санадан ${C(e.position)} вазифасидан ${job} вазифасига, ${C(val(t.department))} бўлимига доимий ўтказилсин.`,
  t.salary>0?`Иш ҳақи ${Number(t.salary).toLocaleString('ru-RU')} сўм ва келишилган қўшимча тўловлар миқдорида белгилансин.`:'Иш ҳақи меҳнат шартномасига қўшимча келишувга мувофиқ ҳисоблансин.'];
  basis=`${dt(t.agreementDate)} санасидаги ${val(t.agreementNumber)}-сон қўшимча келишув; ${C(val(t.evidence))}; Ўзбекистон Республикаси Меҳнат кодексининг 138, 140 ва 149-моддалари.`;
 }else{
  const legal={mutual:'157-моддаси (тарафларнинг келишуви)',employee:'160-моддаси (ходимнинг ташаббуси)',expiry:'158-моддаси (шартнома муддатининг тугаши)'}[t.terminationBasis]||C(val(t.legalClause));
  text=[`${name} билан тузилган ${dt(t.sourceContractDate)} санасидаги ${val(t.sourceContractNumber)}-сон меҳнат шартномаси ${effective} санадан ${C(val(t.reason))} сабабли, Ўзбекистон Республикаси Меҳнат кодексининг ${legal} асосида бекор қилинсин.`,
  `${effective} санаси ходимнинг охирги иш куни деб ҳисоблансин. Бухгалтерия ходим билан якуний ҳисоб-китобни амалга оширсин.`,
  'Ходимга буйруқнинг кўчирма нусхаси ва меҳнат фаолиятига доир ҳужжатлар қонунчиликда белгиланган тартибда берилсин.'];
  basis=`${C(val(t.evidence))}; Ўзбекистон Республикаси Меҳнат кодексининг ${legal}, 170, 171 ва 172-моддалари.`;
 }
 const content=[head,line(),{text:'Б У Й Р У Қ',alignment:'center',bold:true,fontSize:16,margin:[0,0,0,28]},
 {columns:[{text:`№ ${val(doc.number)}`,bold:true},{text:dt(doc.date),alignment:'right',bold:true}],margin:[0,0,0,18]},
 para(`«${C(DOC_TITLES[doc.kind])}»`,{bold:true}),...text.map(s=>para(s)),
 para('Ходимлар билан ишлаш бўйича масъул мазкур буйруқ билан тегишли ходимларни таништирсин.'),
 para(`Асос: ${basis}`,{bold:true,italics:true,margin:[0,8,0,22]}),
 {columns:[{text:'Директор',bold:true},{text:`________________  ${C(val(em.director))}`,bold:true,alignment:'right'}],margin:[0,16,0,20]},
 para(`Кадрлар бўйича масъул: ______________  ${C(val(em.hrName))}`,{fontSize:11}),
 para('Буйруқ билан танишдим ва бир нусхасини олдим:',{bold:true}),signature(name,'Ходим имзоси')];
 if(doc.status==='draft')content.push({text:'ҚОРАЛАМА — ИМЗОЛАШ УЧУН ТЕКШИРИЛАДИ',fontSize:8,color:'#666666',margin:[0,22,0,0]});
 return base(doc,content);
}
function contract(doc){
 const {employee:e,employer:em,terms:t}=doc.payload;
 const title={text:`${val(doc.number)}-son mehnat shartnomasi`,bold:true,fontSize:15,alignment:'center',margin:[0,12,0,22]};
 const meta={columns:[{text:val(em.city),bold:true},{text:dt(doc.date),bold:true,alignment:'right'}],margin:[0,0,0,22]};
 const content=[title,meta,
 para(`1. ${val(em.company)} nomidan ${val(em.directorTitle||'direktor')} ${val(em.director)}, keyingi o‘rinlarda «Ish beruvchi», va fuqaro ${val(e.name)}, keyingi o‘rinlarda «Xodim», mazkur shartnomani quyidagilar haqida tuzdilar.`),
 para(`2. Xodim ${val(e.name)} ${val(t.department)} tarkibiy bo‘linmasiga ${val(t.position)} vazifasiga ishga qabul qilinadi. Ish joyi: ${val(t.workplace)}.`),
 para(`3. Shartnoma ${t.employmentType==='part'?'o‘rindoshlik asosidagi ish':'asosiy ish'} hisoblanadi.`),
 para(`4. Shartnoma muddati: ${t.termType==='fixed'?`${dt(t.endDate)} sanasigacha. Muddatli shartnoma tuzish asosi: ${val(t.termBasis)}`:'nomuayyan muddatga'}.`),
 para(`5. Ish boshlanish sanasi: ${dt(t.startDate)}.${t.termType==='fixed'?` Ishning tugash sanasi: ${dt(t.endDate)}.`:''}`),
 para(`6. Dastlabki sinov sharti: ${val(t.trial||'Sinovsiz')}. Sinov belgilanishi qonunchilikdagi cheklovlarga muvofiq tekshiriladi.`),
 para('7. Xodimning majburiyatlari:',{bold:true}),
 para('a) mehnat to‘g‘risidagi qonunchilikka, mehnat haqidagi boshqa normativ-huquqiy hujjatlarga va ushbu shartnoma shartlariga rioya etish;'),
 para(`b) zimmasiga yuklangan mehnat vazifalarini vijdonan bajarish. Mehnat vazifasi: ${val(t.jobDuties||t.position)}.`),signature(e.name),
 {text:'',pageBreak:'before'},
 para('v) ichki mehnat tartibi qoidalariga va mehnat intizomiga rioya etish;'),
 para('g) belgilangan mehnat normalarini bajarish;'),
 para('d) mehnatni muhofaza qilish, texnologiya intizomi, mehnat xavfsizligi va ishlab chiqarish sanitariyasi talablariga rioya etish;'),
 para('e) ish beruvchining va uchinchi shaxslarning ish beruvchi tasarrufida turgan mol-mulkiga ehtiyotkorona munosabatda bo‘lish;'),
 para('j) ish beruvchiga yetkazilgan moddiy zararning o‘rnini qonunchilikda belgilangan tartib va doirada qoplash;'),
 para('z) insonlarning hayoti va sog‘lig‘iga yoki mol-mulkning saqlanishiga tahdid soladigan vaziyat yuzaga kelganligi to‘g‘risida ish beruvchiga yoxud bevosita rahbarga darhol xabar qilish;'),
 para('i) boshqa xodimlarning o‘z mehnat majburiyatlarini bajarishiga to‘sqinlik qiladigan harakatlarni sodir etmaslik;'),
 para('k) qonunchilikda va ushbu shartnomada nazarda tutilgan boshqa majburiyatlarni bajarish.'),
 para('8. Ish beruvchining majburiyatlari:',{bold:true}),
 para('a) mehnat to‘g‘risidagi qonunchilikka, mehnat haqidagi boshqa normativ-huquqiy hujjatlarga va ushbu shartnoma shartlariga rioya etish;'),
 para('b) xodimni shartnomada shartlashilgan ish bilan ta’minlash;'),
 para('v) ishga qabul qilishda, mehnat jarayonida va shartnomani bekor qilishda kamsitishga yo‘l qo‘ymaslik;'),
 para('g) majburiy mehnat va bolalar mehnatining og‘ir shakllariga yo‘l qo‘ymaslik;'),
 para('d) xavfsiz va mehnatni muhofaza qilish talablariga mos ish sharoitlarini ta’minlash;'),signature(e.name),
 {text:'',pageBreak:'before'},
 para('e) xodimni o‘z vazifalarini bajarish uchun zarur asbob-uskunalar, texnik hujjatlar va boshqa vositalar bilan ta’minlash;'),
 para('j) xodimga berilishi lozim bo‘lgan ish haqini qonunchilik, jamoa shartnomasi va mehnat shartnomasiga muvofiq belgilangan muddatlarda to‘liq to‘lash;'),
 para('z) qonunchilikka muvofiq jamoa muzokaralarini olib borish va boshqa mehnat majburiyatlarini bajarish;'),
 para(`9. Ish kuni rejimi: ${val(t.workSchedule)}.`),
 para(`10. Xodim uchun ${val(t.daysWeek)} kunlik ish haftasi belgilanadi. Haftalik ish vaqti ${val(t.hoursWeek)} soat.`),
 para('11. Mehnatga haq to‘lash:',{bold:true}),
 para(`a) Xodimning lavozim maoshi: ${Number(t.salary||0).toLocaleString('ru-RU')} so‘m. To‘liq oy uchun koeffitsiyent haqi: ${Number(t.coefficient||0).toLocaleString('ru-RU')} so‘m.`),
 para(`b) Qo‘shimcha haq, ustama, kompensatsiya va rag‘batlantiruvchi to‘lovlar: ${val(t.extras||'Amaldagi qonunchilik va korxona ichki hujjatlariga muvofiq')}.`),
 para(`12. Xodimga ${val(t.leaveDays)} kalendar kun asosiy yillik mehnat ta’tili va ${val(t.extraLeave)} kalendar kun qo‘shimcha ta’til belgilanadi. Ta’til shartlari qonunchilik va xodimning tegishli toifasiga muvofiq qo‘llanadi.`),signature(e.name),
 {text:'',pageBreak:'before'},
 para('13. Mehnat shartnomasining mehnat sharoitlari, unga haq to‘lash xususiyatlari, ijtimoiy himoya, imtiyozlar, kafolatlar va boshqa shartlariga doir masalalar taraflar uchun qonunchilikda belgilangan tartibda amal qiladi.'),
 para('14. Mehnat shartnomasi bir xil yuridik kuchga ega bo‘lgan kamida ikki nusxada yozma shaklda tuziladi va har ikki taraf tomonidan imzolanadi. Bir nusxasi xodimga beriladi, ikkinchisi ish beruvchida saqlanadi.'),
 {text:'Mehnat shartnomasining rekvizitlari',bold:true,alignment:'center',margin:[0,24,0,25]},
 {columns:[{width:'*',stack:[{text:'Xodim',bold:true,alignment:'center'},para(val(e.name),{margin:[0,18,0,10]}),para(`Pasport / ID: ${val(e.profile?.passport)}`),para(`Berilgan: ${dt(e.profile?.passportIssued)}, ${val(e.profile?.passportIssuer)}`),para(`Manzil: ${val(e.profile?.address)}`),para(`JShShIR: ${val(e.profile?.pinfl)}`),para(`Telefon: ${val(e.phone)}`),signature('', 'Sana va imzo')]},
 {width:'*',stack:[{text:'Ish beruvchi',bold:true,alignment:'center'},para(val(em.director),{margin:[0,18,0,10]}),para(val(em.company)),para(val(em.address)),para(`Telefon: ${val(em.phone)}`),para(`STIR: ${val(em.tin)}`),para(val(em.bankDetails)),signature('', 'Sana, imzo va muhr')]}],columnGap:22},
 ...(doc.status==='draft'?[{text:'QORALAMA — imzolashdan oldin shartlar va rekvizitlar tekshiriladi',fontSize:8,color:'#666666',margin:[0,24,0,0]}]:[])];
 return base(doc,content);
}
function addendum(doc){
 const {employee:e,employer:em,terms:t}=doc.payload;
 return base(doc,[{text:'MEHNAT SHARTNOMASIGA QO‘SHIMCHA KELISHUV',alignment:'center',fontSize:15,bold:true,margin:[0,15,0,20]},
 {columns:[{text:`№ ${val(doc.number)}`},{text:dt(doc.date),alignment:'right'}],margin:[0,0,0,20]},
 para(`${val(em.company)} nomidan ${val(em.director)} va ${val(e.name)} ${dt(t.sourceContractDate)} sanasidagi ${val(t.sourceContractNumber)}-son mehnat shartnomasiga quyidagi o‘zgartirishlarni kiritish haqida kelishdilar:`),
 para(`1. Xodim ${dt(doc.effectiveDate)} sanadan ${val(t.position)} lavozimiga, ${val(t.department)} bo‘linmasiga o‘tkaziladi.`),
 para(t.salary>0?`2. Lavozim maoshi ${Number(t.salary).toLocaleString('ru-RU')} so‘m, koeffitsiyent haqi ${Number(t.coefficient||0).toLocaleString('ru-RU')} so‘m etib belgilanadi.`:'2. Mehnatga haq to‘lash shartlari amaldagi mehnat shartnomasiga muvofiq saqlanadi.'),
 para(`3. Xodimning yozma roziligi va asos: ${val(t.evidence)}.`),
 para('4. Mehnat shartnomasining qolgan shartlari o‘z kuchida qoladi. Kelishuv ikki nusxada tuziladi va taraflar tomonidan imzolanadi.'),
 para('Asos: O‘zbekiston Respublikasi Mehnat kodeksining 138, 140 va 149-moddalari.'),signature(em.director,'Ish beruvchi'),signature(e.name,'Xodim'),
 ...(doc.status==='draft'?[{text:'QORALAMA',margin:[0,25,0,0],color:'#666666',fontSize:9}]:[])]);
}
export function personnelDefinition(doc,{cyr=s=>s}={}){
 if(doc.kind==='contract')return contract(doc);
 if(doc.kind==='addendum')return addendum(doc);
 return bodyOrder(doc,cyr);
}
