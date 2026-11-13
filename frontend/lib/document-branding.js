import {api} from './api';
export const loadBrand=()=>api('/factory-profile');
export function pdfBrand(def,p){
 if(!p?.company&&!p?.logo)return def;
 const margins=Array.isArray(def.pageMargins)?[...def.pageMargins]:[40,40,40,40];const extra=55;margins[1]+=extra;
 const original=def.header;
 return {...def,pageMargins:margins,info:{...def.info,author:p.company},header:(page,pages,size)=>({stack:[{columns:[...(p.logo?[{image:p.logo,fit:[75,38],width:85}]:[]),{text:p.company||'',fontSize:10,bold:true,margin:[0,6,0,0]}],margin:[margins[0],10,margins[2],0]},...(original?[typeof original==='function'?original(page,pages,size):original]:[])]})};
}
function logoFit(logo){
 try{const b=Uint8Array.from(atob(logo.split(',')[1]),c=>c.charCodeAt(0)),v=new DataView(b.buffer);let w,h;
 if(logo.startsWith('data:image/png')){w=v.getUint32(16);h=v.getUint32(20);}else for(let i=2;i+8<b.length;){const marker=b[i+1],n=v.getUint16(i+2);if([192,193,194].includes(marker)){h=v.getUint16(i+5);w=v.getUint16(i+7);break;}if(n<2)break;i+=n+2;}
 if(w&&h){const k=Math.min(85/w,42/h);return {width:w*k,height:h*k};}
 }catch{}return {width:42,height:42};
}
export function excelBrand(wb,p){
 if(!p)return;let image;
 if(p.logo)image=wb.addImage({base64:p.logo,extension:p.logo.startsWith('data:image/png')?'png':'jpeg'});
 for(const ws of wb.worksheets){ws.headerFooter={...ws.headerFooter,oddHeader:'&C'+String(p.company||'').replace(/&/g,'&&')};
  if(image!==undefined){ws.getRow(1).height=Math.max(ws.getRow(1).height||20,70);ws.getCell('A1').alignment={...ws.getCell('A1').alignment,vertical:'bottom'};ws.addImage(image,{tl:{col:0,row:0},ext:logoFit(p.logo),editAs:'oneCell'});}
 }
}
