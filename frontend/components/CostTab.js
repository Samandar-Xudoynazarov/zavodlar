"use client";
import { tr } from "@/lib/i18n";
import ExportButtons from "./ExportButtons";
import { fileDate } from "@/lib/xlsx-export";
import { useUser } from "@/lib/role";
import { useEffect, useMemo, useRef, useState } from "react";
import { ROW_TYPES, costCard, fmt, fmtDate, fmtN, lsGet, lsSet, schemeName, today } from "@/lib/calc";
import SchemesEditor from "./SchemesEditor";
import OfferDialog from "./OfferDialog";

const typeHint = (r, card) => {
  if (r.type === "m3") return `${fmt(r.value)} × ${fmtN(card.V, 3)} m³`;
  if (r.type === "kg") return `${fmt(r.value)} × ${fmtN(card.kg, 2)} kg`;
  if (r.type === "pctPrev" || r.type === "pctSS") return `${fmtN(r.value, 2)} %`;
  return "";
};

export function CostCard({ product, mats }) {
  const c = costCard(product, mats);
  return (
    <div className="tbl-wrap">
      <table className="card-tbl no-rt">
        <thead>
          <tr>
            <th>{tr("Nomi")}</th>
            <th className="hide-s">{tr("Birlik")}</th>
            <th className="n">{tr("Norma")}</th>
            <th className="n hide-s">{tr("Narx")}</th>
            <th className="n">{tr("Summa, so'm")}</th>
          </tr>
        </thead>
        <tbody>
          {c.items.map((it, i) => (
            <tr key={i}>
              <td>{it.m?.name || tr("— o'chirilgan —")}</td>
              <td className="hide-s">{it.m?.unit}</td>
              <td className="n">{fmtN(it.norm, 3)}</td>
              <td className="n hide-s">{fmt(it.price, it.price % 1 ? 1 : 0)}</td>
              <td className="n">{fmt(it.sum)}</td>
            </tr>
          ))}
          <tr className="sum">
            <td colSpan={4}>Итого СС. материалов</td>
            <td className="n">{fmt(c.materials)}</td>
          </tr>
          {c.prodRows.map((r, i) => (
            <tr key={`p${i}`}>
              <td>{r.name}</td>
              <td colSpan={3} className="muted">
                {typeHint(r, c)}
              </td>
              <td className="n">{fmt(r.amount)}</td>
            </tr>
          ))}
          <tr className="sum">
            <td colSpan={4}>Производственная СС.</td>
            <td className="n">{fmt(c.prodSS)}</td>
          </tr>
          {c.otherRows.map((r, i) => (
            <tr key={`o${i}`}>
              <td>{r.name}</td>
              <td colSpan={3} className="muted">
                {typeHint(r, c)}
              </td>
              <td className="n">{fmt(r.amount)}</td>
            </tr>
          ))}
          <tr className="sum">
            <td colSpan={4}>{tr("Другие затраты, jami")}</td>
            <td className="n">{fmt(c.other)}</td>
          </tr>
          <tr className="sum">
            <td colSpan={4}>{tr("Итого (tannarx)")}</td>
            <td className="n">{fmt(c.itogo)}</td>
          </tr>
          <tr>
            <td>Маржа</td>
            <td colSpan={3} className="muted">
              {fmtN(c.margin, 2)} %
            </td>
            <td className="n">{fmt(c.marginAmt)}</td>
          </tr>
          <tr className="sum">
            <td colSpan={4}>Цена без НДС</td>
            <td className="n">{fmt(c.noVat)}</td>
          </tr>
          <tr>
            <td>НДС</td>
            <td colSpan={3} className="muted">
              {fmtN(c.vat, 2)} %
            </td>
            <td className="n">{fmt(c.vatAmt)}</td>
          </tr>
          <tr className="total">
            <td colSpan={4}>Цена с НДС</td>
            <td className="n">{fmt(c.final)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function CostTab({ data, onEdit, notify, onSchemesSaved }) {
  const { canEdit } = useUser();
  const [schemesOpen, setSchemesOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const { products, mats } = data;
  const [sel, setSel] = useState(() => lsGet("pto.costSel", products[0]?.id));
  const [q, setQ] = useState("");
  // guruhlar — «Katalog»dagi kabi (mahsulotning «Guruh» maydoni bo'yicha)
  const [group, setGroupRaw] = useState(() => lsGet("pto.costGroup", "all"));
  const setGroup = (g) => {
    setGroupRaw(g);
    lsSet("pto.costGroup", g);
  };
  const groups = useMemo(() => [...new Set(products.map((p) => p.group).filter(Boolean))], [products]);
  const activeGroup = group === "all" || groups.includes(group) ? group : "all"; // guruh o'chirilgan bo'lsa — hammasi
  const rows = useMemo(
    () =>
      products.map((p) => {
        const c = costCard(p, mats);
        return { p, c, has: Boolean(p.calc?.items?.length) };
      }),
    [products, mats]
  );
  const shown = rows.filter(
    (r) => (activeGroup === "all" || r.p.group === activeGroup) && (!q || `${r.p.code} ${r.p.name} ${r.p.group}`.toLowerCase().includes(q.toLowerCase()))
  );
  // «Hammasi»da ro'yxat guruhlarga bo'lib ko'rsatiladi (guruhsizlar — oxirida)
  const sections = useMemo(() => {
    if (activeGroup !== "all") return [[activeGroup, shown]];
    const order = [...groups, ""];
    return order.map((g) => [g, shown.filter((r) => (r.p.group || "") === g)]).filter(([, l]) => l.length);
  }, [shown, groups, activeGroup]);
  const cur = rows.find((r) => r.p.id === sel) || rows[0];

  // tanlangan mahsulotlar (belgilash katakchalari): Excel va chop etish faqat shular uchun
  const [picked, setPicked] = useState(() => new Set());
  const togglePick = (id) =>
    setPicked((s0) => {
      const s1 = new Set(s0);
      if (s1.has(id)) s1.delete(id);
      else s1.add(id);
      return s1;
    });
  const allShownPicked = shown.length > 0 && shown.every((r) => picked.has(r.p.id));
  const toggleAllShown = () =>
    setPicked((s0) => {
      const s1 = new Set(s0);
      if (allShownPicked) shown.forEach((r) => s1.delete(r.p.id));
      else shown.forEach((r) => s1.add(r.p.id));
      return s1;
    });
  // tanlangan bo'lsa — faqat ular (ro'yxat tartibida), bo'lmasa — ro'yxatda ko'ringanlarning hammasi
  const target = picked.size ? rows.filter((r) => picked.has(r.p.id)) : sections.flatMap(([, l]) => l); // guruhlar tartibida
  // kartalar: tanlanganlar, bo'lmasa — ochiq turgan karta
  const cardTarget = picked.size ? target.filter((r) => r.has) : cur?.has ? [cur] : [];

  // chop etish: "list" — narxlar jadvali, "cards" — kalkulyatsiya kartalari
  const [printMode, setPrintMode] = useState(null);
  useEffect(() => {
    if (!printMode) return;
    const done = () => setPrintMode(null);
    window.addEventListener("afterprint", done);
    const t = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [printMode]);
  const [sheet, setSheet] = useState(false);
  const sheetRef = useRef(null);
  const choose = (id) => {
    setSel(id);
    lsSet("pto.costSel", id);
    // telefonda karta pastdan chiqadigan oynada ochiladi
    if (window.matchMedia("(max-width: 980px)").matches) setSheet(true);
  };
  useEffect(() => {
    const d = sheetRef.current;
    if (sheet && d && !d.open) d.showModal();
    if (!sheet && d?.open) d.close();
  }, [sheet]);
  const side = cur && (
          <div>
            <div className="bar">
              <div>
                <h3 style={{ margin: 0 }}>
                  {cur.p.name} {cur.p.code}
                </h3>
                <p className="hint">
                  {cur.p.group}
                  {schemeName(cur.p, data.schemes) ? ` · ${tr("andoza")}: ${schemeName(cur.p, data.schemes)}` : ` · ${tr("xarajatlar alohida")}`}
                </p>
              </div>
              {canEdit && (
                <button className="btn no-print" onClick={() => { setSheet(false); onEdit(cur.p); }}>{tr("Tahrirlash")}</button>
              )}
            </div>
            {!cur.has ? (
              <div className="empty tbl-wrap">{tr("Kalkulyatsiya kiritilmagan. «Tahrirlash» orqali materiallarni qo'shing.")}</div>
            ) : (
              <>
                <CostCard product={cur.p} mats={mats} />
                {cur.p.excelPrice ? (
                  <p className={`hint ${Math.abs(cur.c.final - cur.p.excelPrice) > 1 ? "warn-text" : ""}`} style={{ marginTop: 8 }}>{Math.abs(cur.c.final - cur.p.excelPrice) > 1
                    ? tr("Excel faylidagi narx: {p} so'm — farq {d} so'm", { p: fmt(cur.p.excelPrice), d: `${cur.c.final > cur.p.excelPrice ? "+" : ""}${fmt(cur.c.final - cur.p.excelPrice)}` })
                    : tr("Excel faylidagi narx: {p} so'm — mos.", { p: fmt(cur.p.excelPrice) })}
                  </p>
                ) : null}
                {cur.p.notes?.length ? <p className="hint">{cur.p.notes.join(". ")}</p> : null}
              </>
            )}
          </div>
  );

  return (
    <section className={`sheet${printMode ? ` cost-printing cost-print-${printMode}` : ""}`}>
      {printMode && (
        <div className="print-only cost-print">
          <div className="print-head">
            {data.settings?.company && <div className="strong">{data.settings.company}</div>}
            <div className="strong">{printMode === "list" ? tr("Mahsulotlar narxlari (kalkulyatsiya bo'yicha)") : tr("Kalkulyatsiya kartalari")}</div>
            <div className="hint">{fmtDate(today())}</div>
          </div>
          {printMode === "list" ? (
            <table>
              <thead>
                <tr>
                  <th>№</th>
                  <th>{tr("Marka")}</th>
                  <th>{tr("Nomi")}</th>
                  <th className="n">{tr("Beton, m³")}</th>
                  <th className="n">{tr("Tannarx")}</th>
                  <th className="n">{tr("Narx QQSsiz")}</th>
                  <th className="n">{tr("Narx QQS bilan")}</th>
                </tr>
              </thead>
              <tbody>
                {target.map(({ p, c, has }, i) => (
                  <tr key={p.id}>
                    <td>{i + 1}</td>
                    <td>{p.code}</td>
                    <td>{p.name}</td>
                    <td className="n">{has ? fmtN(c.V, 3) : ""}</td>
                    <td className="n">{has ? fmt(c.itogo) : "—"}</td>
                    <td className="n">{has ? fmt(c.noVat) : "—"}</td>
                    <td className="n strong">{has ? fmt(c.final) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            cardTarget.map(({ p }) => (
              <div key={p.id} className="print-card">
                <h3>
                  {p.name} {p.code}
                </h3>
                <p className="hint">
                  {p.group}
                  {schemeName(p, data.schemes) ? ` · ${tr("andoza")}: ${schemeName(p, data.schemes)}` : ""}
                </p>
                <CostCard product={p} mats={mats} />
              </div>
            ))
          )}
        </div>
      )}
      <SchemesEditor open={schemesOpen} onClose={() => setSchemesOpen(false)} data={data} notify={notify} onSaved={onSchemesSaved} />
      <OfferDialog open={offerOpen} onClose={() => setOfferOpen(false)} data={data} notify={notify} />
      <div className="bar">
        <div className="l">
          <h2>{tr("Kalkulyatsiya")}</h2>
          <input id="cost-q" type="search" placeholder={tr("Qidirish: Ф5, лоток…")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tr("Qidirish")} />
        </div>
        <div className="r">
          {canEdit && (
            <button className="btn" onClick={() => setSchemesOpen(true)}>
              {tr("Xarajat andozalari")}
            </button>
          )}
          <ExportButtons
            label={picked.size ? "Tanlanganlar narxi (Excel)" : "Narxlar ro'yxati (Excel)"}
            company={data.settings?.company}
            notify={notify}
            build={() => ({
              filename: `Narxlar_${fileDate()}.xlsx`,
              sheets: [
                {
                  name: tr("Narxlar ro'yxati"),
                  title: tr("Mahsulotlar narxlari (kalkulyatsiya bo'yicha)"),
                  subtitle: picked.size ? tr("{n} ta tanlangan mahsulot", { n: target.length }) : activeGroup !== "all" ? `${tr("Guruh")}: ${activeGroup}` : undefined,
                  columns: [
                    { header: tr("Marka"), key: "code", width: 18 },
                    { header: tr("Nomi"), key: "name", width: 30 },
                    { header: tr("Guruh"), key: "group", width: 18 },
                    { header: tr("Beton, m³"), key: "v", type: "num", width: 11 },
                    { header: tr("Materiallar"), key: "mat", type: "money", width: 15 },
                    { header: tr("Tannarx"), key: "ss", type: "money", width: 15 },
                    { header: tr("Narx QQSsiz"), key: "novat", type: "money", width: 15 },
                    { header: tr("Narx QQS bilan"), key: "final", type: "money", width: 16 },
                  ],
                  rows: target.map(({ p, c, has }) => ({
                    code: p.code, name: p.name, group: p.group,
                    v: has ? Math.round(c.V * 1000) / 1000 : null,
                    mat: has ? Math.round(c.materials) : null, ss: has ? Math.round(c.itogo) : null,
                    novat: has ? Math.round(c.noVat) : null, final: has ? Math.round(c.final) : null,
                    _cell: has ? { final: "bold" } : { name: "warn" },
                  })),
                  notes: [tr("Narx bo'sh bo'lsa — kalkulyatsiya kiritilmagan.")],
                },
              ],
            })}
          />
          <button className="btn primary" onClick={() => setOfferOpen(true)}>{tr("Tijorat taklifi (Word)")}</button>
          <ExportButtons
            label="Kartalar (Excel)"
            shareLabel="Kartalarni ulashish"
            company={data.settings?.company}
            notify={notify}
            disabled={!cardTarget.length}
            build={() => cardsExcel(cardTarget, mats, data.schemes)}
          />
          <button className="btn" onClick={() => setPrintMode("list")} disabled={!target.length}>
            {tr("Narxlarni chop etish")}
          </button>
          <button className="btn" onClick={() => setPrintMode("cards")} disabled={!cardTarget.length}>
            {tr("Kartalarni chop etish")}
          </button>
        </div>
      </div>
      {groups.length > 0 && (
        <div className="chips no-print">
          {[["all", tr("Hammasi")], ...groups.map((g) => [g, g])].map(([k, l]) => (
            <button key={k} type="button" className="chip" aria-pressed={activeGroup === k} onClick={() => setGroup(k)}>
              {l} · {k === "all" ? products.length : products.filter((p) => p.group === k).length}
            </button>
          ))}
        </div>
      )}
      <div className="bar pick-bar no-print">
        <span className="hint">
          {picked.size
            ? tr("{n} ta mahsulot tanlandi — Excel va chop etish faqat shular uchun", { n: picked.size })
            : tr("Katakchalar bilan mahsulotlarni belgilang — Excel va chop etish faqat tanlanganlar uchun bo'ladi. Belgilanmasa: narxlar — ro'yxatdagi hammasi, kartalar — ochiq karta.")}
        </span>
        {picked.size > 0 && (
          <button className="btn sm" onClick={() => setPicked(new Set())}>
            {tr("Tanlovni tozalash")}
          </button>
        )}
      </div>
      <div className="split">
        <div className="tbl-wrap list-pane no-print">
          <table>
            <thead>
              <tr>
                <th className="pick">
                  <input type="checkbox" checked={allShownPicked} onChange={toggleAllShown} aria-label={tr("Hammasini tanlash")} title={tr("Hammasini tanlash")} />
                </th>
                <th>{tr("Mahsulot")}</th>
                <th className="n">{tr("Beton, m³")}</th>
                <th className="n">{tr("Tannarx")}</th>
                <th className="n">{tr("Narx QQS bilan")}</th>
              </tr>
            </thead>
            {sections.map(([g, list]) => (
              <tbody key={g || "-"}>
                {activeGroup === "all" && sections.length > 1 && (
                  <tr className="grp-row">
                    <td colSpan={5}>
                      {g || tr("Guruhsiz")} <span className="muted">· {list.length}</span>
                    </td>
                  </tr>
                )}
                {list.map(({ p, c, has }) => (
                  <tr key={p.id} className={`clickable ${cur?.p.id === p.id ? "selected" : ""}`} onClick={() => choose(p.id)}>
                    <td className="pick" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={picked.has(p.id)} onChange={() => togglePick(p.id)} aria-label={tr("Tanlash: {c}", { c: p.code })} />
                    </td>
                    <td>
                      <span className="code">{p.code}</span>
                      <span className="sub">{p.name}</span>
                    </td>
                    <td className="n">{has ? fmtN(c.V, 3) : ""}</td>
                    <td className="n">{has ? fmt(c.itogo) : "—"}</td>
                    <td className="n strong">{has ? fmt(c.final) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
          {!shown.length && <div className="empty">{tr("Hech narsa topilmadi")}</div>}
        </div>
        {cur && <div className="cost-side">{side}</div>}
      </div>
      <dialog ref={sheetRef} className="bsheet cost-sheet" onClose={() => setSheet(false)}>
        {sheet && cur && (
          <div className="bsheet-body">
            <div className="bsheet-grip" aria-hidden="true" />
            <div className="bsheet-head">
              <span />
              <button type="button" className="icon-btn" onClick={() => setSheet(false)} aria-label={tr("Yopish")}>
                ✕
              </button>
            </div>
            {side}
          </div>
        )}
      </dialog>
      <p className="hint">{tr("Qator turlari:")} {ROW_TYPES.map(([, l]) => tr(l)).join(" · ")}.</p>
    </section>
  );
}

/* ---------- Excel: tanlangan mahsulotlarning kalkulyatsiya kartalari (har biri alohida varaqda) ---------- */
function cardsExcel(list, mats, schemes) {
  const r0 = (v) => Math.round(v || 0);
  const sheets = list.slice(0, 60).map(({ p }) => {
    const c = costCard(p, mats);
    const rows = [
      ...c.items.map((it) => ({ name: it.m?.name || tr("— o'chirilgan —"), unit: it.m?.unit || "", norm: Math.round(it.norm * 1000) / 1000, price: Math.round(it.price * 10) / 10, sum: r0(it.sum) })),
      { name: "Итого СС. материалов", sum: r0(c.materials), _style: "bold" },
      ...c.prodRows.map((r) => ({ name: r.name, unit: typeHint(r, c), sum: r0(r.amount) })),
      { name: "Производственная СС.", sum: r0(c.prodSS), _style: "bold" },
      ...c.otherRows.map((r) => ({ name: r.name, unit: typeHint(r, c), sum: r0(r.amount) })),
      { name: tr("Другие затраты, jami"), sum: r0(c.other), _style: "bold" },
      { name: tr("Итого (tannarx)"), sum: r0(c.itogo), _style: "bold" },
      { name: "Маржа", unit: `${fmtN(c.margin, 2)} %`, sum: r0(c.marginAmt) },
      { name: "Цена без НДС", sum: r0(c.noVat), _style: "bold" },
      { name: "НДС", unit: `${fmtN(c.vat, 2)} %`, sum: r0(c.vatAmt) },
      { name: "Цена с НДС", sum: r0(c.final), _style: "bold" },
    ];
    const sch = schemeName(p, schemes);
    return {
      name: p.code,
      title: `${p.name || ""} ${p.code}`.trim(),
      subtitle: [p.group, sch && `${tr("andoza")}: ${sch}`].filter(Boolean).join(" · "),
      columns: [
        { header: tr("Nomi"), key: "name", width: 34 },
        { header: tr("Birlik"), key: "unit", width: 20 },
        { header: tr("Norma"), key: "norm", type: "num", width: 11 },
        { header: tr("Narx"), key: "price", type: "num", width: 13 },
        { header: tr("Summa, so'm"), key: "sum", type: "money", width: 15 },
      ],
      rows,
      noTotal: true,
    };
  });
  return { filename: `Kalkulyatsiya_kartalari_${fileDate()}.xlsx`, sheets };
}
