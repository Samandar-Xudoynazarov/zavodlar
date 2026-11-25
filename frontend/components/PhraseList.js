"use client";
// Izoh maydonlari uchun tayyor iboralar ro'yxati (<input list="phrase-list">).
// Iboralar Lug'at sahifasida kiritiladi va tanlangan tilda taklif qilinadi.
import { glossaryItems, glossText, useI18n } from "@/lib/i18n";

export default function PhraseList() {
  const { lang } = useI18n(); // til yoki lug'at o'zgarsa qayta chiziladi
  const phrases = glossaryItems().filter((e) => e.kind === "phrase");
  return (
    <datalist id="phrase-list">
      {phrases.map((e) => (
        <option key={e.id} value={glossText(lang, e)} />
      ))}
    </datalist>
  );
}
