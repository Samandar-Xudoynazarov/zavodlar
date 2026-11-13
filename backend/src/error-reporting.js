import crypto from 'node:crypto';import {q} from './db.js';
export async function recordIncident(err,req,{databaseUnavailable=false}={}){
 const id=crypto.randomUUID(),code=/^[A-Z0-9_]{1,40}$/.test(String(err?.code||''))?String(err.code):'UNEXPECTED';
 const frames=String(err?.stack||'').split('\n').slice(1,9).filter(line=>/^\s*at /.test(line)).join('\n').slice(0,3000);
 const method=String(req.method||'').slice(0,10),route=String(req.route?.path||'middleware').slice(0,200);
 console.error(JSON.stringify({errorId:id,code,method,route,frames}));
 if(!databaseUnavailable){try{await q('INSERT INTO error_incidents(id,factory_id,method,route,code,frames) VALUES($1,$2,$3,$4,$5,$6)',[id,req.factoryId||null,method,route,code,frames]);await q("DELETE FROM error_incidents WHERE created_at<now()-interval '30 days'");}catch{console.error('error-incident persistence unavailable: '+id);}}
 return id;
}
