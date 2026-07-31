"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

type DocRow = {
  docType: "bankbook" | "mandate";
  label: string;
  reviewStatus: string;
  fileName: string;
  uploadedAt: string;
  notes: string;
};

type Context = {
  teacherName: string;
  documents: DocRow[];
  mandateTemplateUrl: string;
  bankbookHint: string;
  resume?: { status: string; collectUrl: string };
};

const STATUS_STYLE: Record<string, string> = {
  未上傳: "bg-slate-100 text-slate-500",
  待審核: "bg-amber-100 text-amber-700",
  行政已確認: "bg-blue-100 text-blue-700",
  已完成: "bg-green-100 text-green-700",
  需補件: "bg-red-100 text-red-700",
};

const DOC_TIP: Record<string, string> = {
  bankbook: "請拍攝存摺封面（有戶名、銀行代號、帳號那一頁），確認四個角都有拍到、文字清楚。",
  mandate: "請下載委任書範本，填好並簽名後拍照或掃描上傳。",
};

function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function TeacherDocumentUploadPage() {
  const params = useParams<{ token: string }>();
  const token = encodeURIComponent(params.token);
  const [context, setContext] = useState<Context | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    const res = await fetch(`/api/teacher-documents/public/${token}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "連結已失效");
    return data as Context;
  }, [token]);

  useEffect(() => {
    load()
      .then(setContext)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [load]);

  async function upload(docType: string, file: File) {
    if (busy) return;
    setBusy(docType);
    setError("");
    setMessage("");
    try {
      const fd = new FormData();
      fd.append("docType", docType);
      fd.append("file", file);
      const res = await fetch(`/api/teacher-documents/public/${token}`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "上傳失敗");
      setContext(await load());
      setMessage("已收到檔案，行政確認後會再通知您。");
    } catch (err) {
      setError((err as Error).message || "上傳失敗");
    } finally {
      setBusy("");
      // 讓同一個檔案重新選也能觸發 onChange
      const el = inputs.current[docType];
      if (el) el.value = "";
    }
  }

  if (loading) return <main className="mx-auto max-w-md px-5 py-16 text-center text-slate-500">載入中...</main>;
  if (!context) return <main className="mx-auto max-w-md px-5 py-16 text-center text-red-600">{error || "連結已失效，請聯繫行政重新產生"}</main>;

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 text-slate-800">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-blue-700">WaysLeader AI 薪資文件</div>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{context.teacherName} 老師</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">檔案只有公司會計可檢視，不會出現在公開頁面。</p>
      </section>

      {error && <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>}
      {message && <div className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</div>}

      {context.resume?.collectUrl && (
        <section className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">新進老師簡歷</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">照片、學歷、教學經歷與專長可在同一處補齊。</p>
            </div>
            <a href={context.resume.collectUrl} className="shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-blue-700">
              填寫簡歷資料
            </a>
          </div>
        </section>
      )}

      {context.documents.map((doc) => {
        const uploading = busy === doc.docType;
        const hint = doc.docType === "bankbook" && context.bankbookHint ? context.bankbookHint : DOC_TIP[doc.docType];
        return (
          <section key={doc.docType} className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900">{doc.label}</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[doc.reviewStatus] ?? STATUS_STYLE.未上傳}`}>
                {doc.reviewStatus}
              </span>
            </div>

            <p className="mt-2 text-sm leading-6 text-slate-500">{hint}</p>

            {doc.docType === "mandate" && context.mandateTemplateUrl && (
              <a
                href={context.mandateTemplateUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700"
              >
                下載委任書範本
              </a>
            )}

            {doc.reviewStatus === "需補件" && doc.notes && (
              <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">需補件原因：{doc.notes}</div>
            )}

            {doc.fileName && (
              <div className="mt-3 text-xs text-slate-400">
                已上傳：{doc.fileName}
                {doc.uploadedAt ? `（${formatDate(doc.uploadedAt)}）` : ""}
              </div>
            )}

            <input
              ref={(el) => {
                inputs.current[doc.docType] = el;
              }}
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              disabled={!!busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(doc.docType, file);
              }}
              className="mt-4 block w-full text-sm text-slate-500 file:mr-3 file:rounded-xl file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white disabled:opacity-60"
            />
            <div className="mt-2 text-xs text-slate-400">
              {uploading ? "上傳中..." : "可上傳 JPG／PNG／PDF，檔案小於 10MB。重新上傳會覆蓋上一份並重新審核。"}
            </div>
          </section>
        );
      })}

      <p className="mt-6 text-center text-xs text-slate-400">此連結有效期限 30 天，逾期請聯繫行政重新產生。</p>
    </main>
  );
}
