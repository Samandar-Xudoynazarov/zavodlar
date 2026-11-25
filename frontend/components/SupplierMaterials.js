"use client";
import { show } from "@/lib/i18n";
import { api } from "@/lib/api";
import { openPdf } from "@/lib/finance-files";
import { fmtN, fmtDate } from "@/lib/calc";
import { useState } from "react";

export default function SupplierMaterials({ account, materials, refresh, notify, openContract }) {
  const [invoiceKey, setInvoice] = useState(""),
    [moveId, setMove] = useState(""),
    [qty, setQty] = useState(""),
    [request, setRequest] = useState(() => crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { receipts, invoices, matches, contracts, advances } = account.materials;
  const byId = new Map(materials.map((m) => [m.id, m]));
  const ids = [...new Set([...receipts, ...invoices, ...advances].map((l) => l.materialId))];
  const invoice = invoices.find((l) => l.id + ":" + l.materialId === invoiceKey);
  const available = receipts.filter((l) => l.materialId === invoice?.materialId);
  const receipt = available.find((l) => l.id === moveId);
  const limit = Math.min(receipt?.remaining || 0, invoice?.remaining || 0);
  async function link(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/finance/supplier-settlements/" + account.supplier.id + "/material-matches", {
        method: "POST",
        body: {
          invoiceId: invoice.id,
          materialId: invoice.materialId,
          movementId: moveId,
          qty: +qty,
          requestId: request,
        },
      });
      setRequest(crypto.randomUUID());
      setInvoice("");
      setMove("");
      setQty("");
      refresh();
      notify("Faktura kirimga bog‘landi");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="supplier-materials">
      <header className="finance-heading">
        <h3>Material shartnomalari</h3>
        <button className="btn primary" onClick={openContract}>
          + Shartnoma qo‘shish
        </button>
      </header>
      {contracts.map((c) => (
        <details key={c.id}>
          <summary>
            № {c.number} · {fmtDate(c.date)} · {fmtN(c.originalTotal, 2)} so‘m
          </summary>
          {c.items.map((i) => (
            <p key={i.materialId}>
              {show(i.name)} · {fmtN(i.qty, 6)} {i.unit} × {fmtN(i.price, 2)} so‘m
            </p>
          ))}
          <button
            className="btn sm"
            onClick={() => openPdf("/finance/contracts/" + c.id + "/pdf", c.name).catch((e) => notify(e.message))}
          >
            PDF ochish
          </button>
        </details>
      ))}
      <h3>Materiallar bo‘yicha qoldiq</h3>
      <div className="tbl-wrap">
        <table className="finance-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Birlik</th>
              <th>Fakturasiz kirim</th>
              <th>Kirimga bog‘lanmagan faktura</th>
              <th>To‘langan avans miqdori</th>
            </tr>
          </thead>
          <tbody>
            {ids.map((id) => (
              <tr key={id}>
                <td>{show(byId.get(id)?.name)}</td>
                <td>{byId.get(id)?.unit}</td>
                {[receipts, invoices, advances].map((ls, i) => (
                  <td key={i} className="n">
                    {fmtN(
                      ls.filter((l) => l.materialId === id).reduce((n, l) => n + (l.remaining ?? l.qty), 0),
                      6,
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!ids.length && <p>Ochiq material qoldig‘i yo‘q.</p>}
      {invoices.length > 0 && receipts.length > 0 && (
        <form className="finance-toolbar" onSubmit={link}>
          <label>
            Faktura
            <select
              required
              value={invoiceKey}
              onChange={(e) => {
                setInvoice(e.target.value);
                setMove("");
                setQty("");
              }}
            >
              <option value="">Tanlang</option>
              {invoices.map((i) => (
                <option key={i.id + i.materialId} value={i.id + ":" + i.materialId}>
                  {i.date} · № {i.number} · {show(byId.get(i.materialId)?.name)} · {i.remaining}
                </option>
              ))}
            </select>
          </label>
          <label>
            Haqiqiy kirim
            <select
              required
              value={moveId}
              onChange={(e) => {
                setMove(e.target.value);
                setQty(
                  Math.min(invoice.remaining, available.find((r) => r.id === e.target.value)?.remaining || 0),
                );
              }}
            >
              <option value="">Tanlang</option>
              {available.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.date} · {m.docNumber} · {m.remaining}
                </option>
              ))}
            </select>
          </label>
          <label>
            Miqdor
            <input
              required
              type="number"
              min=".000001"
              step="any"
              max={limit}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </label>
          <button className="btn" disabled={busy || !receipt}>
            Kirimga bog‘lash
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="err">
          {error}
        </p>
      )}
      {matches.length > 0 && (
        <details>
          <summary>Kirimga bog‘langan fakturalar · {matches.length}</summary>
          {matches.map((m) => (
            <p key={m.id}>
              {fmtDate(m.receiptDate)} kirim ← № {m.number} ({fmtDate(m.invoiceDate)}) ·{" "}
              {show(byId.get(m.materialId)?.name)} · {m.qty} {byId.get(m.materialId)?.unit}
            </p>
          ))}
        </details>
      )}
    </div>
  );
}
