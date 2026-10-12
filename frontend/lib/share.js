/**
 * Faylni yuklab olish yoki ulashish (Telegram, pochta, «Fayllarga saqlash»…) — barcha Excel, PDF, Word uchun bitta joy.
 *
 * iPhone/iPad (Safari) ulashish oynasini faqat tugma bosilgan zahoti ochishga ruxsat beradi. Fayl tayyorlanishi
 * (PDF, Excel) bir-ikki soniya olsa, ruxsat tugaydi va ulashish ishlamay qoladi. Shunda «Fayl tayyor» oynasi
 * chiqadi (components/ShareReady.js) — undagi tugmani bosish yangi ruxsat beradi va ulashish oynasi ochiladi.
 * iPhone'da «Yuklab olish» ham ulashish oynasi orqali ishlaydi (u yerda «Fayllarga saqlash» bor) — oddiy
 * yuklab olish ilova (bosh ekrandan) rejimida ishonchsiz.
 */
export const isIOS = () =>
  typeof navigator !== "undefined" && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const canShareFile = (file) => {
  try {
    return Boolean(navigator.canShare?.({ files: [file] }));
  } catch {
    return false;
  }
};

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 4000);
}

/** «Fayl tayyor» oynasini ochadi; foydalanuvchi bosganda ulashadi. Natija: "shared" | "cancelled" | "downloaded" */
function askToShare(file, blob) {
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent("pto:share-ready", { detail: { file, blob, resolve } }));
  });
}

/**
 * share=true — ulashish oynasi (Telegram va h.k.); imkoni bo'lmasa yuklab olinadi.
 * Qaytaradi: "shared" | "cancelled" | "downloaded" | "downloaded-fallback"
 */
export async function deliverBlob(blob, filename, mime, { share = false } = {}) {
  const ios = isIOS();
  if (share || ios) {
    const file = new File([blob], filename, { type: mime });
    if (typeof navigator !== "undefined" && navigator.share && canShareFile(file)) {
      try {
        await navigator.share({ files: [file], title: filename });
        return "shared";
      } catch (e) {
        if (e?.name === "AbortError") return "cancelled";
        // NotAllowedError — tugma bosilganidan beri ko'p vaqt o'tdi: «Fayl tayyor» oynasi orqali qayta so'raymiz
        if (e?.name === "NotAllowedError" && typeof window !== "undefined") return askToShare(file, blob);
      }
    }
  }
  saveBlob(blob, filename);
  return share ? "downloaded-fallback" : "downloaded";
}

/** ShareReady oynasidagi tugma bosilganda (yangi ruxsat bilan) */
export async function shareNow(file) {
  try {
    await navigator.share({ files: [file], title: file.name });
    return "shared";
  } catch (e) {
    return e?.name === "AbortError" ? "cancelled" : "error";
  }
}
export { saveBlob };
