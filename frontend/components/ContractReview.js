"use client";
import { show } from "@/lib/i18n";
import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { fmtN } from "@/lib/calc";
import { fileBase64 } from "@/lib/finance-files";
import "./finance-workspace.css";

const blank = () => ({
  key: crypto.randomUUID(),
  name: "",
  qty: "",
  unit: "dona",
  price: "",
  total: "",
  factor: 1,
  page: 1,
});
const alphabet = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
const latin = "a b v g d e yo j z i y k l m n o p r s t u f x ts ch sh shch _ i _ e yu ya".split(" ");
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[а-яё]/g, (c) => latin[alphabet.indexOf(c)] || c)
    .replace(/[^a-z0-9]/g, "");
const companyKey = (s) => norm(s).replace(/masuliyaticheklanganjamiyat|mchj|ooo/g, "");
function identify(name, list) {
  const key = norm(name),
    short = key.replace(/^(fundament|rigel|plita|beton)/, "");
  const hits = list.filter((p) => [p.code, p.name].some((v) => v && [key, short].includes(norm(v))));
  return hits.length === 1 ? hits[0].id : "";
}
export default function ContractReview({
  data,
  initialKind = "sale",
  lockKind = false,
  supplier,
  onSaved,
  onClose,
}) {
  const dialog = useRef(null),
    seq = useRef(0),
    request = useRef(crypto.randomUUID());
  const [kind, setKind] = useState(initialKind),
    [source, setSource] = useState(null),
    [url, setUrl] = useState(""),
    [parsed, setParsed] = useState({}),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [party, setParty] = useState(supplier?.name || ""),
    [no, setNo] = useState(""),
    [date, setDate] = useState(""),
    [status, setStatus] = useState("yangi"),
    [original, setOriginal] = useState(""),
    [lines, setLines] = useState([]),
    [focus, setFocus] = useState(null);
  const products = data.products || [],
    materials = (data.materials || []).filter((m) => m.stock && !m.archived);
  useEffect(() => {
    dialog.current.showModal();
    return () => {
      seq.current++;
    };
  }, []);
  useEffect(() => {
    if (!source) return;
    const u = URL.createObjectURL(source.file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [source]);
  function edit(key, changes) {
    setLines((old) => old.map((l) => (l.key === key ? { ...l, ...changes } : l)));
  }
  function chooseKind(k, p = parsed) {
    setKind(k);
    setParty(supplier?.name || (k === "sale" ? p.buyer : p.seller) || "");
  }
  async function load(file) {
    const id = ++seq.current;
    setSource(null);
    setUrl("");
    setParsed({});
    setLines([]);
    setOriginal("");
    setNo("");
    setDate("");
    setFocus(null);
    setNotice("");
    setError("");
    setBusy("read");
    try {
      const contentBase64 = await fileBase64(file);
      if (id !== seq.current) return;
      setSource({ file, contentBase64 });
      let doc;
      try {
        doc = await api("/finance/contracts/preview", { method: "POST", body: { contentBase64 } });
      } catch (e) {
        doc = { items: [], warnings: [e.message + " · Maydonlarni PDFdan kiriting."] };
      }
      if (id !== seq.current) return;
      const factory = companyKey(data.settings?.documentProfile?.company || data.settings?.company),
        tin = data.settings?.documentProfile?.tin;
      const k = lockKind
        ? initialKind
        : supplier
          ? "purchase"
          : (tin && doc.buyerTin === tin) || (factory && companyKey(doc.buyer) === factory)
            ? "purchase"
            : (tin && doc.sellerTin === tin) || (factory && companyKey(doc.seller) === factory)
              ? "sale"
              : initialKind;
      setParsed(doc);
      chooseKind(k, doc);
      setNo(doc.number || "");
      setDate(doc.date || "");
      setOriginal(doc.originalTotal ?? "");
      const imported = doc.items.map((l) => ({
        ...blank(),
        ...l,
        productId: identify(l.name, products),
        materialId: identify(l.name, materials),
      }));
      setLines(imported.length ? imported : [blank()]);
      setNotice((doc.warnings || []).join(" · "));
    } catch (e) {
      if (id === seq.current) setError(e.message);
    } finally {
      if (id === seq.current) setBusy("");
    }
  }
  const accepted = lines.filter((l) => !l.removed),
    total = accepted.reduce((s, l) => s + Number(l.total || 0), 0);
  function changeMoney(l, k, value) {
    const row = { ...l, [k]: value };
    if (k !== "total")
      row.total =
        Math.round(
          Number(row.qty) *
            Number(row.price) *
            (row.qty && l.qty && l.price && l.total ? l.total / (l.qty * l.price) : 1) *
            100,
        ) / 100;
    edit(l.key, { [k]: value, total: row.total });
  }
  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy("save");
    try {
      const result = await api("/finance/contracts", {
        method: "POST",
        body: {
          kind,
          number: no,
          date,
          counterparty: party,
          status,
          supplierId: kind === "purchase" ? supplier?.id : null,
          requestId: request.current,
          items: accepted,
          originalTotal: original === "" ? lines.reduce((s, l) => s + Number(l.total || 0), 0) : Number(original),
          name: source.file.name,
          contentBase64: source.contentBase64,
        },
      });
      onSaved(result);
    } catch (e) {
      setError(e.message);
      setBusy("");
    }
  }
  return (
    <dialog
      ref={dialog}
      className="contract-review"
      onCancel={(e) => {
        e.preventDefault();
        if (busy !== "save") onClose();
      }}
      aria-label="Shartnomani tekshirish"
    >
      <form onSubmit={save}>
        <header className="finance-heading">
          <div>
            <small>Shartnoma PDF</small>
            <h2>Shartnomani tekshirish</h2>
          </div>
          <button type="button" className="btn" disabled={busy === "save"} onClick={onClose}>
            Yopish
          </button>
        </header>
        <label className="field">
          Asl shartnoma (PDF, 8 MB gacha)
          <input
            required
            type="file"
            accept=".pdf,application/pdf"
            disabled={!!busy}
            onChange={(e) => e.target.files[0] && load(e.target.files[0])}
          />
        </label>
        {busy === "read" && <p role="status">Shartnoma sahifalari o‘qilmoqda…</p>}
        {notice && (
          <p className="hint" role="status">
            {notice}
          </p>
        )}
        {source && busy !== "read" && (
          <div className="contract-columns">
            <aside>
              {focus?.region && parsed.previews?.[focus.page] ? (
                <>
                  <div className="contract-source">
                    <img src={parsed.previews[focus.page]} alt={"Shartnoma · " + focus.page + "-sahifa"} />
                    <span
                      style={{
                        left: focus.region.left * 100 + "%",
                        top: focus.region.top * 100 + "%",
                        width: focus.region.width * 100 + "%",
                        height: focus.region.height * 100 + "%",
                      }}
                    />
                  </div>
                  <button type="button" className="linkbtn" onClick={() => setFocus(null)}>
                    To‘liq PDFni ko‘rish
                  </button>
                </>
              ) : (
                url && (
                  <iframe
                    title="Shartnomaning asl PDF fayli"
                    src={
                      url +
                      "#page=" +
                      (focus?.page || 1) +
                      (focus?.name ? "&search=" + encodeURIComponent(focus.name) : "")
                    }
                  />
                )
              )}
            </aside>
            <fieldset disabled={!!busy}>
              <div className="form-grid">
                <label>
                  Shartnoma turi
                  <select
                    disabled={!!supplier || lockKind}
                    value={kind}
                    onChange={(e) => chooseKind(e.target.value)}
                  >
                    <option value="sale">Sotuv · zavod bajaruvchi</option>
                    <option value="purchase">Xarid · zavod buyurtmachi</option>
                  </select>
                </label>
                <label>
                  {kind === "sale" ? "Buyurtmachi" : "Ta’minotchi"}
                  <input required readOnly={!!supplier} value={party} onChange={(e) => setParty(e.target.value)} />
                </label>
                <label>
                  Shartnoma №<input required value={no} onChange={(e) => setNo(e.target.value)} />
                </label>
                <label>
                  Shartnoma sanasi
                  <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                {kind === "sale" && (
                  <label>
                    Holat
                    <select value={status} onChange={(e) => setStatus(e.target.value)}>
                      <option value="yangi">Yangi</option>
                      <option value="jarayonda">Jarayonda</option>
                      <option value="topshirildi">Yakunlangan</option>
                    </select>
                  </label>
                )}
                <label>
                  PDF bo‘yicha jami, so‘m
                  <input
                    type="number"
                    min=".01"
                    step=".01"
                    value={original}
                    placeholder="Qatorlar jami"
                    onChange={(e) => setOriginal(e.target.value)}
                  />
                </label>
              </div>
              <h3>Shartnoma mahsulotlari</h3>
              {lines.map((l, i) =>
                l.removed ? (
                  <div className="contract-removed" key={l.key}>
                    {show(l.name)} · Olib tashlandi{" "}
                    <button type="button" className="linkbtn" onClick={() => edit(l.key, { removed: false })}>
                      Qaytarish
                    </button>
                  </div>
                ) : (
                  <div className="contract-line" key={l.key} onFocus={() => setFocus(l)}>
                    <label>
                      PDFdagi nomi
                      {l.name && /[@®™]/.test(l.name) && (
                        <small className="contract-decision">Skan markasini asl nusxa bilan tekshiring</small>
                      )}
                      <input
                        required
                        value={l.name}
                        onChange={(e) =>
                          edit(l.key, {
                            name: e.target.value,
                            productId: identify(e.target.value, products),
                            materialId: identify(e.target.value, materials),
                            create: false,
                          })
                        }
                      />
                    </label>
                    <label>
                      Katalogdagi {kind === "sale" ? "mahsulot" : "material"}
                      <select
                        required={kind === "purchase" || !l.create}
                        value={(kind === "sale" ? l.productId : l.materialId) || ""}
                        onChange={(e) =>
                          edit(l.key, {
                            [kind === "sale" ? "productId" : "materialId"]: e.target.value,
                            create: false,
                          })
                        }
                      >
                        <option value="">{l.create ? "Yangi nom bilan saqlanadi" : "Tanlang"}</option>
                        {(kind === "sale" ? products : materials).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code && p.code + " · "}
                            {show(p.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {kind === "sale" && !l.productId && (
                      <div className="contract-decision">
                        {l.create ? "PTO hisobini kutmoqda" : "Mahsulot katalogda yo‘q. Qo‘shilsinmi?"}{" "}
                        <button
                          type="button"
                          className="btn sm"
                          aria-pressed={!!l.create}
                          onClick={() => edit(l.key, { create: true })}
                        >
                          Ha, qo‘shish
                        </button>{" "}
                        <button type="button" className="btn sm" onClick={() => edit(l.key, { removed: true })}>
                          Yo‘q, olib tashlash
                        </button>
                      </div>
                    )}
                    <div className="contract-numbers">
                      <label>
                        Miqdor
                        <input
                          type="number"
                          min={kind === "sale" ? 1 : 0.000001}
                          step={kind === "sale" ? 1 : "any"}
                          required
                          value={l.qty}
                          onChange={(e) => changeMoney(l, "qty", e.target.value)}
                        />
                      </label>
                      <label>
                        Birlik
                        <input required value={l.unit} onChange={(e) => edit(l.key, { unit: e.target.value })} />
                      </label>
                      <label>
                        Birlik narxi
                        <input
                          type="number"
                          min=".01"
                          step=".01"
                          required
                          value={l.price}
                          onChange={(e) => changeMoney(l, "price", e.target.value)}
                        />
                      </label>
                      <label>
                        Jami (QQS bilan)
                        <input
                          type="number"
                          min=".01"
                          step=".01"
                          required
                          value={l.total}
                          onChange={(e) => changeMoney(l, "total", e.target.value)}
                        />
                      </label>
                    </div>
                    {kind === "purchase" && (
                      <label>
                        Bir shartnoma birligidagi ombor miqdori (
                        {materials.find((m) => m.id === l.materialId)?.unit || "—"})
                        <input
                          required
                          type="number"
                          min=".000001"
                          step="any"
                          value={l.factor}
                          onChange={(e) => edit(l.key, { factor: e.target.value })}
                        />
                      </label>
                    )}
                    {(kind === "purchase" || l.productId) && (
                      <button type="button" className="linkbtn" onClick={() => edit(l.key, { removed: true })}>
                        {i + 1}-qatorni olib tashlash
                      </button>
                    )}
                  </div>
                ),
              )}
              <button type="button" className="btn" onClick={() => setLines((ls) => [...ls, blank()])}>
                + Qator
              </button>
            </fieldset>
          </div>
        )}
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        <footer className="finance-heading">
          <strong>Qabul qilingan jami · {fmtN(total, 2)} so‘m</strong>
          <button className="btn primary" disabled={!source || !!busy || !accepted.length}>
            {busy === "save" ? "Saqlanmoqda…" : "Saqlash"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
