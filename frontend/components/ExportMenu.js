"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import Icon from "./Icon";

/** Secondary file actions stay together, while each action keeps its existing behavior. */
export default function ExportMenu({ children, label = "Eksport", disabled = false }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => {
      if (event.key === "Escape") { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    root.current?.addEventListener("keydown", escape);
    const node = root.current;
    return () => { document.removeEventListener("pointerdown", outside); node?.removeEventListener("keydown", escape); };
  }, [open]);
  return (
    <div ref={root} className="action-menu no-print" onBlur={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button ref={trigger} type="button" className="btn action-menu-trigger" disabled={disabled} aria-expanded={open} aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); requestAnimationFrame(() => root.current?.querySelector(".action-menu-panel button:not(:disabled)")?.focus()); } }}>
        <Icon name="download" /> {t(label)} <Icon name="chevR" size={14} />
      </button>
      <div id={panelId} className="action-menu-panel" role="group" aria-label={t(label)} hidden={!open}
        onClick={(event) => { const button = event.target.closest("button"); if (button && !button.disabled) { setOpen(false); trigger.current?.focus(); } }}>
        {children}
      </div>
    </div>
  );
}
