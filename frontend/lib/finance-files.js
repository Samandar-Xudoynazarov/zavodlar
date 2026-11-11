import { api } from './api';
export const fileBase64=file=>new Promise((resolve,reject)=>{if(!file||!file.size||file.size>8388608){reject(new Error('PDF faylni tanlang (8 MB gacha)'));return;}const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Faylni o‘qib bo‘lmadi'));reader.readAsDataURL(file);});
export async function openPdf(path,name='Hujjat.pdf',download=false) {
 const win=download?null:window.open('about:blank','_blank');if(win)win.opener=null;
 try {const response=await api(path,{raw:true});const url=URL.createObjectURL(await response.blob());
 if(win)win.location.replace(url);else{const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();}
 setTimeout(()=>URL.revokeObjectURL(url),300000);
 }catch(e){win?.close();throw e;}
}
