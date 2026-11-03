import { toCyr } from './i18n';
import { deliverPdf } from './plan-pdf';
import { personnelDefinition } from './hr-document-definitions';
let engine;
async function pdfEngine(){
 engine ||= (async()=>{
  const m=await import('pdfmake/build/pdfmake'),fonts=await import('pdfmake/build/vfs_fonts'),pdf=m.default||m;
  const vfs=fonts.default?.pdfMake?.vfs||fonts.default||fonts.pdfMake?.vfs||fonts;
  const extra={};
  await Promise.all(['regular','bold','italic','bolditalic'].map(async style=>{
   const response=await fetch(`/fonts/hr/${style}.ttf`);if(!response.ok)throw new Error('Hujjat shriftini yuklab bo‘lmadi');
   const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));extra[`hr-${style}.ttf`]=btoa(binary);
  }));
  pdf.vfs={...vfs,...pdf.vfs,...extra};pdf.addVirtualFileSystem?.(pdf.vfs);pdf.fonts={Roboto:{normal:'Roboto-Regular.ttf',bold:'Roboto-Medium.ttf',italics:'Roboto-Italic.ttf',bolditalics:'Roboto-MediumItalic.ttf'},...pdf.fonts,Times:{normal:'hr-regular.ttf',bold:'hr-bold.ttf',italics:'hr-italic.ttf',bolditalics:'hr-bolditalic.ttf'}};return pdf;
 })().catch(e=>{engine=null;throw e;});return engine;
}
export async function downloadPersonnelPdf(document){
 const pdf=await pdfEngine();const definition=personnelDefinition(document,{cyr:toCyr});
 const blob=await new Promise((resolve,reject)=>{try{pdf.createPdf(definition,undefined,pdf.fonts,pdf.vfs).getBlob(resolve);}catch(e){reject(e);}});
 const number=String(document.number||'qoralama').replace(/[^\p{L}\p{N}_-]/gu,'_');return deliverPdf(blob,`${document.kind}_${number}.pdf`);
}
