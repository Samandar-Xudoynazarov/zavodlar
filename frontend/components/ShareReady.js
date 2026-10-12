"use client";
import { useEffect, useRef, useState } from "react";
import { tr } from "@/lib/i18n";
import { saveBlob, shareNow } from "@/lib/share";
import Icon from "./Icon";

/**
 * «Fayl tayyor» oynasi — iPhone'da fayl tayyorlanguncha tugma bosish ruxsati tugab qolsa (lib/share.js).
 * Shu oynadagi tugma bosilganda ulashish oynasi (Telegram, pochta, «Fayllarga saqlash») darhol ochiladi.
 */
export default function ShareReady() {
  const [item, setItem] = useState(null); // { file, blob, resolve }
  const ref = useRef(null);
  useEffect(() => {
    const on = (e) => setItem(e.detail);
    window.addEventListener("pto:share-ready", on);
    return () => window.removeEventListener("pto:share-ready", on);
  }, []);
  useEffect(() => {
    const d = ref.current;
    if (item && d && !d.open) d.showModal();
  }, [item]);
  const done = (r) => {
    item?.resolve(r);
    setItem(null);
    ref.current?.close();
  };
  if (!item) return <dialog ref={ref} className="share-ready" />;
  return (
    <dialog ref={ref} className="share-ready" onCancel={() => done("cancelled")}>
      <h2>{tr("Fayl tayyor")}</h2>
      <p className="muted" style={{ wordBreak: "break-all" }}>{item.file.name}</p>
      <div className="dlg-actions" style={{ flexWrap: "wrap" }}>
        <button type="button" className="btn" onClick={() => done("cancelled")}>
          {tr("Yopish")}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            saveBlob(item.blob, item.file.name);
            done("downloaded");
          }}
        >
          <Icon name="download" /> {tr("Yuklab olish")}
        </button>
        <button type="button" className="btn primary" onClick={async () => done(await shareNow(item.file))}>
          <Icon name="share" /> {tr("Ulashish (Telegram)")}
        </button>
      </div>
    </dialog>
  );
}
