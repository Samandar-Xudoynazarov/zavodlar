import { one } from './db.js';
export async function ensureDepartment(c,factoryId,name){
 if(!name)return '';
 await c.query('INSERT INTO hr_departments(factory_id,name) VALUES($1,$2) ON CONFLICT DO NOTHING',[factoryId,name]);
 return (await one('SELECT name FROM hr_departments WHERE factory_id=$1 AND lower(btrim(name))=lower(btrim($2))',[factoryId,name],c)).name;
}
// Xodimlar ro'yxati Tabel raqami bo'yicha: 1, 2, 10 (raqamli qism son sifatida), keyin F.I.Sh.
export const EMPLOYEE_ORDER="(substring(btrim(code) from '^[0-9]+'))::numeric NULLS LAST,btrim(code),name,id";
