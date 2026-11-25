"use client";
// Zavodning o'z lug'atini serverdan olib, ekrandagi tarjimaga (show) ulaydi.
import { api } from "./api";
import { setGlossary } from "./i18n";

export async function loadGlossary() {
  const d = await api("/glossary");
  setGlossary(d?.items || []);
  return d;
}
