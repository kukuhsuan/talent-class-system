"use client";

import { useCallback, useEffect, useState } from "react";

export type TeacherDocumentRow = {
  id: number;
  teacherId: number;
  docType: "bankbook" | "mandate";
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: string;
  reviewStatus: string;
  reviewedBy: string;
  reviewedAt: string;
  notes: string;
};

export const DOC_LABELS: Record<string, string> = { bankbook: "存摺封面", mandate: "委任書" };
const DOC_TYPES: Array<"bankbook" | "mandate"> = ["bankbook", "mandate"];

export const DOC_STATUS_STYLE: Record<string, string> = {
  未上傳: "bg-slate-100 text-slate-500",
  待審核: "bg-amber-100 text-amber-700",
  行政已確認: "bg-blue-100 text-blue-700",
  已完成: "bg-green-100 text-green-700",
  需補件: "bg-red-100 text-red-700",
};

// 只有這些角色看得到原檔，跟後端 SENSITIVE_FINANCE_ROLES 對齊
const FILE_VIEW_ROLES = new Set(["owner", "super_admin", "developer", "accountant"]);

function formatDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function TeacherDocumentPanel({
  teacherId,
  teacherName,
  role,
  onClose,
  onChanged,
}: {
  teacherId: number;
  teacherName: string;
  role: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<TeacherDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uploadUrl, setUploadUrl] = useState("");

  const canViewFile = FILE_VIEW_ROLES.has(role);

  const load = useCallback(async () => {
    const res = await fetch(`/api/teacher-documents?teacherId=${teacherId}`, { cache: "no-store" });
    const data = await res.json().catch(() => []);
    if (!res.ok) throw new Error((data as { error?: string })?.error || "文件狀態載入失敗");
    setRows(Array.isArray(data) ? data : []);
  }, [teacherId]);

  useEffect(() => {
    load()
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [load]);

  async function run(key: string, fn: () => Promise<string>) {
    if (busy) return;
    setBusy(key);
    setError("");
    setMessage("");
    try {
      const done = await fn();
      await load();
      onChanged?.();
      if (done) setMessage(done);
    } catch (err) {
      setError((err as Error).message || "操作失敗");
    } finally {
      setBusy("");
    }
  }

  function makeLink() {
    return run("link", async () => {
      const res = await fetch("/api/teacher-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "連結產生失敗");
      setUploadUrl(data.uploadUrl);
      try {
        await navigator.clipboard.writeText(data.uploadUrl);
        return "上傳連結已複製，可直接貼到 LINE 給老師（30 天有效）";
      } catch {
        return "上傳連結已產生（30 天有效）";
      }
    });
  }

  function proxyUpload(docType: string, file: File) {
    return run(`upload-${docType}`, async () => {
      const fd = new FormData();
      fd.append("teacherId", String(teacherId));
      fd.append("docType", docType);
      fd.append("file", file);
      const res = await fetch("/api/teacher-documents/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "上傳失敗");
      return `${DOC_LABELS[docType]}已上傳，狀態為待審核`;
    });
  }

  function review(row: TeacherDocumentRow, reviewStatus: string) {
    let notes = "";
    if (reviewStatus === "需補件") {
      const input = prompt(`請填寫「${DOC_LABELS[row.docType]}」需補件的原因（老師會在上傳頁看到）`);
      if (input === null) return;
      if (!input.trim()) {
        setError("需補件必須填寫原因");
        return;
      }
      notes = input.trim();
    }
    return run(`review-${row.id}`, async () => {
      const res = await fetch(`/api/teacher-documents/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus, notes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "審核失敗");
      return `${DOC_LABELS[row.docType]}已標記為${reviewStatus}`;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
      <div className="mt-10 w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-800">📎 {teacherName}－薪資文件</h2>
            <p className="text-xs text-slate-500">存摺封面與委任書。檔案存在私有空間，每次檢視都會留下稽核紀錄。</p>
          </div>
          <button onClick={onClose} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200">關閉</button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
          {message && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

          <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-3">
            <button
              onClick={makeLink}
              disabled={!!busy}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {busy === "link" ? "產生中..." : "產生老師上傳連結"}
            </button>
            {uploadUrl && (
              <div className="mt-2 break-all rounded-lg bg-white px-3 py-2 text-xs text-slate-600">{uploadUrl}</div>
            )}
            <p className="mt-2 text-xs text-slate-500">老師點連結不用登入就能自己上傳；也可以由行政用下方欄位代傳。</p>
          </div>

          {loading && <div className="py-6 text-center text-sm text-slate-400">載入中...</div>}

          {!loading && DOC_TYPES.map((docType) => {
            const row = rows.find((item) => item.docType === docType);
            const status = row?.reviewStatus || "未上傳";
            return (
              <div key={docType} className="rounded-lg border border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-slate-800">{DOC_LABELS[docType]}</div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${DOC_STATUS_STYLE[status] ?? DOC_STATUS_STYLE.未上傳}`}>{status}</span>
                </div>

                {row && row.fileName && (
                  <div className="mt-2 text-xs text-slate-500">
                    <div>{row.fileName}（{Math.max(1, Math.round(row.fileSize / 1024))} KB）</div>
                    <div className="mt-0.5">{row.uploadedBy}｜{formatDateTime(row.uploadedAt)}</div>
                    {row.reviewedBy && <div className="mt-0.5">審核：{row.reviewedBy}｜{formatDateTime(row.reviewedAt)}</div>}
                    {row.notes && <div className="mt-0.5 text-red-600">需補件原因：{row.notes}</div>}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {row && canViewFile && (
                    <a
                      href={`/api/teacher-documents/${row.id}/file`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                      檢視原檔
                    </a>
                  )}
                  {row && !canViewFile && <span className="text-xs text-slate-400">原檔僅會計／管理者可檢視</span>}

                  {row && docType === "mandate" && status === "待審核" && (
                    <button onClick={() => review(row, "行政已確認")} disabled={!!busy} className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-60">行政已確認</button>
                  )}
                  {row && canViewFile && status !== "已完成" && (docType === "bankbook" || status === "行政已確認") && (
                    <button onClick={() => review(row, "已完成")} disabled={!!busy} className="text-sm font-medium text-green-600 hover:text-green-800 disabled:opacity-60">標記已完成</button>
                  )}
                  {row && status !== "需補件" && (
                    <button onClick={() => review(row, "需補件")} disabled={!!busy} className="text-sm font-medium text-red-500 hover:text-red-700 disabled:opacity-60">需補件</button>
                  )}
                </div>

                <label className="mt-3 block text-xs text-slate-500">
                  行政代傳（老師用 LINE 傳檔給行政時使用）
                  <input
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    disabled={!!busy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void proxyUpload(docType, file);
                      event.target.value = "";
                    }}
                    className="mt-1 block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700"
                  />
                </label>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
