"use client";
import { show } from "@/lib/i18n";
import { matches } from "@/lib/script";
import { tr } from "@/lib/i18n";
import { useState } from "react";
import { useUser } from "@/lib/role";
import { api } from "@/lib/api";
import { concreteVolume, fmtN, lidLinks } from "@/lib/calc";
import DeleteButton from "./DeleteButton";
import "./product-cards.css";

export default function CatalogTab({ data, notify, reload, onEdit }) {
  const { canEdit } = useUser();
  const { products, mats } = data;
  const [group, setGroup] = useState("all");
  const [q, setQ] = useState("");
  const groups = [...new Set(products.map((p) => p.group).filter(Boolean))];
  const lids = lidLinks(products);

  const list = products.filter(
    (p) => (group === "all" || p.group === group) && matches(`${p.code} ${p.name}`, q)
  );

  async function del(id) {
    try {
      await api(`/products/${id}`, { method: "DELETE" });
      await reload();
      notify("O'chirildi");
    } catch (e) {
      notify(e.message);
    }
  }

  return (
    <section className="sheet">
      <div className="bar">
        <div className="l">
          <h2>{tr("Mahsulotlar katalogi")}</h2>
          <input id="cat-q" type="search" placeholder={tr("Qidirish")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tr("Qidirish")} />
        </div>
        <div className="r">
          {canEdit && (
            <button className="btn primary" onClick={() => onEdit(null)}>{tr("+ Mahsulot qo'shish")}</button>
          )}
        </div>
      </div>
      <div className="chips">
        {[["all", "Hammasi"], ...groups.map((g) => [g, g])].map(([k, l]) => (
          <button key={k} className="chip" aria-pressed={group === k} onClick={() => setGroup(k)}>
            {k === "all" ? tr(l) : l} · {k === "all" ? products.length : products.filter((p) => p.group === k).length}
          </button>
        ))}
      </div>
      <ul className="pgrid">
        {list.map((p) => {
          const v = concreteVolume(p, mats);
          const grade = p.norms.map((l) => mats.get(l.materialId)).find((m) => m?.group === "beton");
          const metal = p.norms.reduce((s, l) => {
            const m = mats.get(l.materialId);
            return s + (m?.group === "metall" && m.unit === "кг" ? +l.norm || 0 : 0);
          }, 0);
          return (
            <li key={p.id} className="pcard">
              <div className="pcard-head">
                <div className="pcard-title">
                  <span className="code">{p.code}</span>
                  {p.name && <span className="name">{show(p.name)}</span>}
                </div>
                {p.group && <span className="hint">{p.group}</span>}
              </div>
              {p.costPending && <span className="pcard-note">{tr("PTO hisobini kutmoqda")}</span>}
              {p.notes?.length ? <span className="pcard-note">{p.notes[0]}</span> : null}
              <dl className="pcard-stats">
                <div>
                  <dt>{tr("Beton")}</dt>
                  <dd>{grade?.name.replace("Бетон ", "") || "—"}</dd>
                </div>
                <div>
                  <dt>{tr("Beton, m³")}</dt>
                  <dd>{v ? fmtN(v, 3) : "—"}</dd>
                </div>
                <div>
                  <dt>{tr("Metall, kg")}</dt>
                  <dd>{metal ? fmtN(metal, 1) : "—"}</dd>
                </div>
                <div>
                  <dt>{tr("Og'irligi, t")}</dt>
                  <dd>{v ? fmtN(v * 2.5 + metal / 1000, 2) : "—"}</dd>
                </div>
                <div>
                  <dt>{tr("Quvvat, dona/kun")}</dt>
                  <dd>
                    {lids.has(p.id) ? (
                      <>
                        {tr("{n} / quyish", { n: lids.get(p.id).batch })}
                        <span className="sub">{tr("{h} qolibida", { h: lids.get(p.id).hostCode })}</span>
                      </>
                    ) : p.forms > 0 ? (
                      fmtN(p.forms / (p.cycleDays || 1), 2)
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>
              {canEdit && (
                <div className="pcard-acts">
                  <button className="btn sm" onClick={() => onEdit(p)}>{tr(p.costPending ? "Kalkulyatsiya kiritish" : "Tahrirlash")}</button>
                  <DeleteButton onConfirm={() => del(p.id)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!list.length && <div className="empty">{tr("Hech narsa topilmadi")}</div>}
      <p className="hint">{tr("Og'irlik taxminan: beton hajmi × 2,5 t/m³ + metall.")}</p>
    </section>
  );
}
