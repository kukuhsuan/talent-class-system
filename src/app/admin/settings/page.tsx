"use client";
import { useCallback, useEffect, useState } from "react";

type Setting = { key: string; label: string; value: string; updatedBy: string; updatedAt: string };

// 每一項都寫清楚「填了會怎樣、不填會怎樣」。
// 這頁的三個值都會直接影響老師端畫面或原檔什麼時候被刪掉，不能只給一個空白框。
const HINTS: Record<string, { help: string; placeholder: string; type?: string }> = {
  "doc.template.mandate.url": {
    help: "老師端上傳頁的「下載委任書格式」按鈕會指向這個網址。必須是 https 開頭；留空則不顯示下載按鈕。",
    placeholder: "https://drive.google.com/...",
  },
  "doc.template.bankbook.hint": {
    help: "顯示在老師端存摺上傳欄位下方的提醒文字，例如要求拍到戶名與帳號、避免反光。",
    placeholder: "請拍攝存摺封面，需清楚看到銀行、分行、戶名與帳號",
  },
  "doc.retention.days": {
    help: "委任書：審核完成後保留原檔的天數，每日排程會刪除超過期限的檔案（審核結果與狀態保留）。留空或填錯會退回預設 90 天；填 0 表示不自動刪除。",
    placeholder: "90",
    type: "number",
  },
  "doc.retention.bankbook.days": {
    help: "存摺：從老師上傳當天起算的天數，到期一律刪除原檔，不論是否審核完成。到期前 7 天仍未審核的會先開系統警示提醒補審。留空或填錯會退回預設 30 天；填 0 表示不自動刪除。",
    placeholder: "30",
    type: "number",
  },
};

function formatDate(value: string) {
  return value ? new Date(value).toLocaleString("zh-TW", { hour12: false }) : "—";
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "設定載入失敗");
      const rows = (data.settings ?? []) as Setting[];
      setSettings(rows);
      setDraft(Object.fromEntries(rows.map((row) => [row.key, row.value])));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  const dirty = settings.some((row) => (draft[row.key] ?? "") !== row.value);

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "儲存失敗");
      const rows = (data.settings ?? []) as Setting[];
      setSettings(rows);
      setDraft(Object.fromEntries(rows.map((row) => [row.key, row.value])));
      setMessage(data.changedCount > 0 ? `已更新 ${data.changedCount} 項設定` : "沒有變更");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">系統設定</h1>
        <p className="text-sm text-slate-500">只有最高權限可修改，每次變更都會寫入操作歷程。</p>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {message && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

      <div className="space-y-4">
        {loading && <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">載入中…</div>}
        {!loading && settings.map((row) => {
          const hint = HINTS[row.key];
          const changed = (draft[row.key] ?? "") !== row.value;
          return (
            <div key={row.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <label className="block text-sm font-semibold text-slate-800" htmlFor={row.key}>{row.label}</label>
              {hint?.help && <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint.help}</p>}
              <input
                id={row.key}
                type={hint?.type ?? "text"}
                value={draft[row.key] ?? ""}
                placeholder={hint?.placeholder ?? ""}
                onChange={(e) => setDraft({ ...draft, [row.key]: e.target.value })}
                className={`mt-3 w-full rounded-lg border px-3 py-2 text-sm ${changed ? "border-amber-400 bg-amber-50" : "border-slate-200"}`}
              />
              <p className="mt-2 text-xs text-slate-400">
                {row.updatedBy ? `上次由 ${row.updatedBy} 於 ${formatDate(row.updatedAt)} 修改` : "尚未設定過"}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={() => { void save(); }}
          disabled={saving || !dirty}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving ? "儲存中…" : "儲存設定"}
        </button>
        {dirty && !saving && <span className="text-xs text-amber-600">有未儲存的變更</span>}
      </div>
    </div>
  );
}
