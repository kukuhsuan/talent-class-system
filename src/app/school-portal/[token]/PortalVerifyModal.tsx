"use client";

import { useState } from "react";

/**
 * 園所身分驗證碼 Modal。
 *
 * 原本只放在 AfterSchoolPortal.tsx（安親班版）裡，幼兒園版沒有；
 * 但後端已改成「有啟用驗證碼的園所讀取也要驗證」，幼兒園版沒有這個 Modal
 * 就只會顯示一片錯誤訊息、園所永遠進不去，所以抽出來兩邊共用。
 */
export default function PortalVerifyModal({
  token,
  onClose,
  onVerified,
}: {
  token: string;
  onClose: () => void;
  onVerified: () => void;
}) {
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!/^\d{6}$/.test(code)) { setError("請輸入 6 位數驗證碼"); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/school-portal/${encodeURIComponent(token)}/verify`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, remember }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "驗證失敗，請稍後再試");
      onVerified();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal>
      <div className="w-full max-w-sm rounded-[16px] bg-white p-5 shadow-xl">
        <h3 className="text-[17px] font-bold text-[#1F2937]">園所身分驗證</h3>
        <p className="mt-2 text-sm leading-6 text-[#64748B]">為確認是園所人員操作，請輸入 6 位數園所驗證碼。驗證成功後，這台裝置 30 天內不需再次輸入。</p>
        <input
          inputMode="numeric" pattern="\d*" maxLength={6} value={code} autoFocus
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="6 位數驗證碼"
          className="mt-4 w-full rounded-[10px] border border-[#E2E8F0] px-4 py-3 text-center text-xl tracking-[0.4em] text-[#1F2937] outline-none focus:border-[#315E9F]"
        />
        <label className="mt-3 flex items-center gap-2 text-sm text-[#1F2937]">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4" />
          記住這台裝置 30 天
        </label>
        {error && <p className="mt-2 text-sm text-[#C24141]">{error}</p>}
        <button disabled={busy || code.length !== 6} onClick={submit} className="mt-4 w-full rounded-[10px] bg-[#1F3A6D] py-3 text-sm font-bold text-white disabled:opacity-40">
          {busy ? "驗證中…" : "確認並繼續"}
        </button>
        <button onClick={onClose} className="mt-2 w-full rounded-[10px] py-2.5 text-sm text-[#64748B]">取消</button>
        <p className="mt-3 text-center text-xs text-[#64748B]">忘記驗證碼？請聯繫運動班長客服重新取得。</p>
      </div>
    </div>
  );
}
