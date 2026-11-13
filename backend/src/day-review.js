import {ConflictError} from './valid.js';
export function editableDay(day){if(day?.reviewStatus==='approved')throw new ConflictError('Hisobot tasdiqlangan. Tuzatish uchun sabab bilan qayta oching');if(day?.reviewStatus==='submitted')throw new ConflictError('Hisobot tekshirishga yuborilgan. Avval tuzatishga qaytaring');}
