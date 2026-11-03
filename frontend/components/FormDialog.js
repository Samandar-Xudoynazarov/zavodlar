"use client";
import { tr } from "@/lib/i18n";
import { Fragment, useEffect, useRef, useState } from "react";

/**
 * Umumiy forma oynasi.
 * fields: [{ name, label, type: text|number|date|select, options: [[value,label]], unit, req, wide, min, step, def }]
 */
export default function FormDialog({ form, onClose }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (form && d && !d.open) {
      setError("");
      d.showModal();
    }
    if (!form && d?.open) d.close();
  }, [form]);

  if (!form) return <dialog ref={ref} onClose={onClose} />;

  async function submit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const out = {};
    for (const f of form.fields) {
      const v = String(fd.get(f.name) ?? "").trim();
      out[f.name] = f.type === "number" ? (v === "" ? 0 : Number(v)) : v;
    }
    setBusy(true);
    setError("");
    try {
      await form.onSubmit(out);
      onClose();
    } catch (err) {
      setError(tr(err.message || "Saqlanmadi"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} onClose={onClose}>
      <form onSubmit={submit} key={form.key} className={form.fields.some(f=>f.section)?'form-sectioned':undefined}>
        <h2>{tr(form.title)}</h2>
        {form.description&&<p className="form-description">{tr(form.description)}</p>}
        <div className="form-grid">
          {form.fields.map((f,index) => {
            const id = `f-${f.name}`;
            const v = form.values?.[f.name] ?? f.def ?? "";
            return (
              <Fragment key={f.name}>{f.section&&f.section!==form.fields[index-1]?.section&&<h3 className="form-section-title">{tr(f.section)}</h3>}<div className="field" style={f.wide ? { gridColumn: "1/-1" } : undefined}>
                <label htmlFor={id}>
                  {tr(f.label)} {f.req&&<span aria-hidden="true" className="form-required">*</span>} {f.unit && <span className="u">({tr(f.unit)})</span>}
                </label>
                {f.type === "select" ? (
                  <select id={id} aria-label={tr(f.label)} name={f.name} defaultValue={String(v ?? "")} required={f.req}>
                    {f.options.map(([k, l]) => (
                      <option key={k} value={k}>
                        {f.raw ? l : tr(l)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    aria-label={tr(f.label)}
                    name={f.name}
                    type={f.type || "text"}
                    defaultValue={v}
                    required={f.req}
                    min={f.min}
                    step={f.step}
                  />
                )}
                {f.hint&&<small className="hint">{tr(f.hint)}</small>}
              </div></Fragment>
            );
          })}
        </div>
        {error && <p className="err">{error}</p>}
        <div className="dlg-actions">
          <button type="button" className="btn" onClick={onClose}>{tr("Bekor qilish")}</button>
          <button className="btn primary" disabled={busy}>
            {busy ? tr("Saqlanmoqda…") : tr(form.submitLabel || "Saqlash")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
