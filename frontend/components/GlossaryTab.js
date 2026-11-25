"use client";
// Lug'at: zavodda ishlatiladigan nomlar va tayyor iboralarning o'zbekcha va ruscha shakli.
// Bu yerdagi tarjimalar butun dasturda ko'rinadi: o'zbek tilida — o'zbekcha, rus tilida — ruscha.
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { loadGlossary } from "@/lib/glossary";
import { matches } from "@/lib/script";
import { searchKey, useT } from "@/lib/i18n";
import "./finance-extra.css";
import { Kpi, Tag, useLoad } from "./FinanceUi";

const KINDS = [["name", "Nom"], ["phrase", "Tayyor ibora"]];
const SOURCES = { product: "Mahsulot", material: "Material", supplier: "Ta’minotchi", customer: "Mijoz", department: "Bo‘lim" };
// rus harflari bor (o'zbek kirilliga xos ў қ ғ ҳ yo'q) — demak ruscha yozilgan
const isRu = (s) => /[а-яё]/i.test(s) && !/[ўқғҳ]/i.test(s);

export default function GlossaryTab({ notify, openForm }) {
  const tt = useT();
  const res = useLoad("/glossary");
  const d = res.data;
  const cand = useLoad(d?.canEdit ? "/glossary/candidates" : null, [d?.canEdit]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [showAll, setShowAll] = useState(false);

  const items = d?.items || [];
  const list = useMemo(() => items.filter((e) => (!kind || e.kind === kind) && matches([e.uz, e.ru], q)), [items, kind, q]);
  const missing = useMemo(() => {
    const known = new Set(items.flatMap((e) => [searchKey(e.uz), searchKey(e.ru)]));
    return (cand.data?.items || []).filter((c) => !known.has(searchKey(c.text)) && matches(c.text, q));
  }, [items, cand.data, q]);

  async function reload() {
    res.reload();
    cand.reload?.();
    try {
      await loadGlossary();
    } catch {}
  }

  function edit(e, preset) {
    const isNew = !e;
    openForm({
      title: isNew ? "Lug‘atga qo‘shish" : "Tarjimani tahrirlash",
      description: "Bir xil narsaning o‘zbekcha va ruscha yozilishi. Dasturda o‘zbek tili tanlansa — o‘zbekchasi, rus tili tanlansa — ruschasi ko‘rinadi.",
      values: e || preset,
      fields: [
        { name: "uz", label: "O‘zbekcha", req: true, wide: true, hint: "Lotin yoki kirillda yozish mumkin" },
        { name: "ru", label: "Ruscha", req: true, wide: true },
        { name: "kind", label: "Turi", type: "select", options: KINDS, def: "name", hint: "Tayyor ibora — izoh yozishda ro‘yxatdan tanlanadi" },
      ],
      submitLabel: "Saqlash",
      onSubmit: async (v) => {
        if (isNew) await api("/glossary", { method: "POST", body: v });
        else await api("/glossary/" + e.id, { method: "PUT", body: v });
        await reload();
        notify("Saqlandi");
      },
    });
  }
  async function remove(e) {
    if (!window.confirm(tt("«{n}» lug‘atdan o‘chirilsinmi?", { n: e.uz }))) return;
    try {
      await api("/glossary/" + e.id, { method: "DELETE" });
      await reload();
      notify("O‘chirildi");
    } catch (err) {
      notify(err.message);
    }
  }

  const names = items.filter((e) => e.kind === "name").length;
  const shownMissing = showAll ? missing : missing.slice(0, 50);
  return (
    <section className="sheet finance-module fl">
      <div className="fl-top">
        <div>
          <h2>{tt("Lug‘at · o‘zbekcha va ruscha")}</h2>
          <p>{tt("Mahsulot, material, mijoz nomlari va izohlar uchun tayyor iboralar. Bu yerdagi tarjima butun dasturda tanlangan tilda ko‘rinadi.")}</p>
        </div>
        <div className="fl-acts">{d?.canEdit && <button className="btn primary" onClick={() => edit(null)}>{tt("+ Qo‘shish")}</button>}</div>
      </div>
      {res.error && (
        <p className="err" role="alert">
          {res.error} <button className="btn sm" onClick={res.reload}>{tt("Qayta urinish")}</button>
        </p>
      )}
      {!d ? (
        !res.error && <p role="status">{tt("Yuklanmoqda…")}</p>
      ) : (
        <>
          <div className="fl-kpis">
            <Kpi label={tt("Nomlar")} value={names} />
            <Kpi label={tt("Tayyor iboralar")} value={items.length - names} />
            {d.canEdit && <Kpi label={tt("Tarjimasiz nomlar")} value={cand.data ? missing.length : "…"} tone={missing.length ? "sig" : "ok"} />}
          </div>
          <div className="fl-filters">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Qidirish…")} aria-label={tt("Qidirish")} />
            <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label={tt("Turi")}>
              <option value="">{tt("Hammasi")}</option>
              {KINDS.map(([k, l]) => (
                <option key={k} value={k}>{tt(l)}</option>
              ))}
            </select>
          </div>
          {!list.length ? (
            <p className="fl-note">{tt("Lug‘at hozircha bo‘sh.")}{d.canEdit ? " " + tt("Pastdagi «Tarjimasiz nomlar» ro‘yxatidan boshlang.") : ""}</p>
          ) : (
            <div className="tbl-wrap">
              <table className="finance-table">
                <thead>
                  <tr><th>{tt("O‘zbekcha")}</th><th>{tt("Ruscha")}</th><th>{tt("Turi")}</th><th /></tr>
                </thead>
                <tbody>
                  {list.map((e) => (
                    <tr key={e.id}>
                      <td>{e.uz}</td>
                      <td>{e.ru}</td>
                      <td><Tag tone={e.kind === "phrase" ? "acc" : "mut"}>{tt(e.kind === "phrase" ? "Tayyor ibora" : "Nom")}</Tag></td>
                      <td>{d.canEdit && <><button className="btn sm" onClick={() => edit(e)}>{tt("Tahrirlash")}</button> <button className="btn sm" onClick={() => remove(e)}>{tt("O‘chirish")}</button></>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {d.canEdit && (
            <>
              <h3>{tt("Tarjimasiz nomlar")}</h3>
              <p className="fl-note">{tt("Dasturga kiritilgan, lekin lug‘atda yo‘q nomlar. «Tarjima» tugmasini bosib, ikkinchi tildagi shaklini yozing.")}</p>
              {cand.error && <p className="err" role="alert">{cand.error}</p>}
              {!cand.data ? (
                !cand.error && <p role="status">{tt("Yuklanmoqda…")}</p>
              ) : !missing.length ? (
                <p className="fl-note">{tt("Hamma nomlarning tarjimasi bor.")}</p>
              ) : (
                <div className="tbl-wrap">
                  <table className="finance-table">
                    <thead>
                      <tr><th>{tt("Nom")}</th><th>{tt("Qayerdan")}</th><th /></tr>
                    </thead>
                    <tbody>
                      {shownMissing.map((c) => (
                        <tr key={c.text}>
                          <td>{c.text}</td>
                          <td><small className="muted">{tt(SOURCES[c.source] || c.source)}</small></td>
                          <td><button className="btn sm" onClick={() => edit(null, isRu(c.text) ? { ru: c.text, kind: "name" } : { uz: c.text, kind: "name" })}>{tt("Tarjima")}</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {missing.length > shownMissing.length && (
                    <button className="btn sm" onClick={() => setShowAll(true)}>{tt("Hammasini ko‘rsatish ({n})", { n: missing.length })}</button>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
