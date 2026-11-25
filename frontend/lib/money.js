"use client";
import { useContext } from "react";
import { UserContext } from "./role";

// Kuzatuvchi va kurator (4 zavodni nazorat qiluvchi) pulni ko'rmaydi — server ham narxlarni yubormaydi.
export const NO_MONEY_ROLES = ["kuzatuvchi", "kurator"];
export const isNoMoney = (user) => NO_MONEY_ROLES.includes(user?.role);
export function useNoMoney() {
  return isNoMoney(useContext(UserContext));
}
/** Excel eksportidan pul ustunlarini olib tashlaydi */
export const stripMoneySheets = (spec) =>
  spec && { ...spec, sheets: (spec.sheets || []).map((sh) => ({ ...sh, columns: (sh.columns || []).filter((c) => c.type !== "money"), rows: sh.rows })) };
