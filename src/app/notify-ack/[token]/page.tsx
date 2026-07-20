"use client";
import { useEffect, useState, use } from "react";

// 教練「確認收到」公開頁：點選訊息內專屬連結後確認已詳閱
type AckInfo = { name: string; templateLabel: string; sentAt: string; ackAt: string | null };

// DB 存 UTC（datetime('now')）→ 顯示台北時間
function taipeiTime(utc: string) {
  const d = new Date(`${utc.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return utc;
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", dateStyle: "medium", timeStyle: "short" }).format(d);
}

export default function NotifyAckPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [info, setInfo] = useState<AckInfo | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "confirming" | "done" | "invalid">("loading");

  useEffect(() => {
    fetch(`/api/notify-ack/${encodeURIComponent(token)}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: AckInfo) => { setInfo(data); setState(data.ackAt ? "done" : "ready"); })
      .catch(() => setState("invalid"));
  }, [token]);

  const confirm = async () => {
    setState("confirming");
    try {
      const res = await fetch(`/api/notify-ack/${encodeURIComponent(token)}`, { method: "POST" });
      if (!res.ok) throw new Error();
      setInfo(await res.json());
      setState("done");
    } catch {
      setState("ready");
      alert("確認失敗，請稍後再試");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border shadow-sm p-8 w-full max-w-md text-center">
        <p className="text-sm text-slate-400 mb-1">WaysLeader AI</p>
        {state === "loading" && <p className="text-slate-500 py-8">載入中…</p>}
        {state === "invalid" && (
          <>
            <div className="text-4xl mb-3">⚠️</div>
            <h1 className="text-lg font-bold text-slate-800 mb-2">連結無效或已失效</h1>
            <p className="text-sm text-slate-500">請確認是否點選了完整的連結，或聯繫行政人員。</p>
          </>
        )}
        {info && state !== "invalid" && state !== "loading" && (
          <>
            <h1 className="text-lg font-bold text-slate-800 mb-1">{info.templateLabel}</h1>
            <p className="text-sm text-slate-500 mb-6">{info.name} 教練您好</p>
            {state === "done" ? (
              <>
                <div className="text-5xl mb-3">✅</div>
                <p className="font-semibold text-green-700 mb-1">已確認收到</p>
                {info.ackAt && <p className="text-xs text-slate-400">確認時間：{taipeiTime(info.ackAt)}</p>}
                <p className="text-sm text-slate-500 mt-4">感謝您的配合，本頁可直接關閉。</p>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-600 mb-6">請確認您已收到並詳閱 LINE 訊息中的完整內容。</p>
                <button onClick={confirm} disabled={state === "confirming"}
                  className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50">
                  {state === "confirming" ? "確認中…" : "我已收到並詳閱"}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
