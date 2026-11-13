import {loadBrand} from './document-branding';
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const p=s=>'<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">'+esc(s)+'</w:t></w:r></w:p>';
export async function brandDocx(zip){
 const b=await loadBrand();let xml=await zip.file('word/document.xml').async('string');
 const doc=new DOMParser().parseFromString(xml,'application/xml'),body=doc.getElementsByTagName('w:body')[0];
 if(!body)throw new Error('Word shabloni noto‘g‘ri');
 const children=[...body.children],cut=children.findIndex(n=>n.textContent.includes('{{KUN}}'));
 if(cut<0)throw new Error('Word shablonida sana belgisi topilmadi');
 for(const n of children.slice(0,cut))n.remove();
 // Replace the legacy factory name in the accounting title and approval line.
 for(const n of [...body.children])if(n.tagName==='w:p'&&/энерго|энергокурилиш/i.test(n.textContent)){
  const text=n.textContent.includes('директори')?b.company+' rahbari ______________ {{DIREKTOR}}':b.company+' — {{OY}} oyida ishlab chiqarilgan mahsulotlar ro‘yxati';
  const replacement=new DOMParser().parseFromString('<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:r><w:t>'+esc(text)+'</w:t></w:r></w:p>','application/xml').documentElement;n.replaceWith(doc.importNode(replacement,true));
 }
 xml=new XMLSerializer().serializeToString(doc);let head='';
 if(b.logo){const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Zavod logosi ochilmadi'));img.src=b.logo;});const scale=Math.min(120/img.width,60/img.height),cx=Math.round(img.width*scale*9525),cy=Math.round(img.height*scale*9525);const png=b.logo.startsWith('data:image/png'),ext=png?'png':'jpeg';zip.file('word/media/factory-logo.'+ext,b.logo.split(',')[1],{base64:true});
  const relPath='word/_rels/document.xml.rels';let rel=zip.file(relPath)?await zip.file(relPath).async('string'):'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  rel=rel.replace('</Relationships>','<Relationship Id="rIdFactoryLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/factory-logo.'+ext+'"/></Relationships>');zip.file(relPath,rel);
  let ct=await zip.file('[Content_Types].xml').async('string');if(!ct.includes('Extension="'+ext+'"'))ct=ct.replace('</Types>','<Default Extension="'+ext+'" ContentType="image/'+ext+'"/></Types>');zip.file('[Content_Types].xml',ct);
  head='<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><wp:extent cx="1143000" cy="571500"/><wp:docPr id="90001" name="Factory logo"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="90001" name="Factory logo"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdFactoryLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1143000" cy="571500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  head=head.replaceAll('cx="1143000"','cx="'+cx+'"').replaceAll('cy="571500"','cy="'+cy+'"');
 }
 head+=p(b.company)+p([b.address,b.phone].filter(Boolean).join(' · '))+p([b.tin?'STIR: '+b.tin:'',b.bankDetails].filter(Boolean).join(' · '));
 xml=xml.replace(/<w:body[^>]*>/,m=>m+head);zip.file('word/document.xml',xml);return b;
}
