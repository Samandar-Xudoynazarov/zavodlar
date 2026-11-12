import { one } from './db.js';
export async function ensureDepartment(c,factoryId,name){
 if(!name)return '';
 await c.query('INSERT INTO hr_departments(factory_id,name) VALUES($1,$2) ON CONFLICT DO NOTHING',[factoryId,name]);
 return (await one('SELECT name FROM hr_departments WHERE factory_id=$1 AND lower(btrim(name))=lower(btrim($2))',[factoryId,name],c)).name;
}
