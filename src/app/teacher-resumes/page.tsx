"use client";

import { useEffect, useMemo, useState } from "react";
import { Toast } from "@/components/Toast";
import { ensureOk } from "@/lib/clientApi";
import { useToast } from "@/lib/useToast";

type ResumeRow = {
  teacherId: number;
  teacherName: string;
  teacherPhone: string;
  teacherEmail: string;
  photoUrl: string;
  education: string;
  experience: string;
  teachingStyle: string;
  specialties: string;
  status: string;
  updatedAt: string;
  collectUrl: string;
  cardUrl: string;
};

export default function TeacherResumesPage() {
  const [rows, setRows] = useState<ResumeRow[]>([]);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState<number | null>(null);
  const { toast, showToast } = useToast();

  async function load() {
    const res = await fetch("/api/teacher-resumes", { cache: "no-store" });
    await ensureOk(res, "讀取老師簡歷失敗");
    setRows(await res.json());
  }

  useEffect(() => {
    void Promise.resolve().then(() => load()).catch((error) => showToast("error", (error as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const keyword = search.trim();
    if (!keyword) return rows;
    return rows.filter((row) =>
      [row.teacherName, row.specialties, row.education, row.experience, row.teachingStyle].some((value) => value.includes(keyword)),
    );
  }, [rows, search]);

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    showToast("success", `${label}已複製`);
  }

  async function send(row: ResumeRow) {
    if (!confirm(`要發送簡歷填寫連結給「${row.teacherName}」嗎？`)) return;
    setSending(row.teacherId);
    try {
      const res = await fetch(`/api/teacher-resumes/${row.teacherId}/send`, { method: "POST" });
      await ensureOk(res, "發送填寫連結失敗");
      showToast("success", `已發送給 ${row.teacherName}`);
    } catch (error) {
      showToast("error", (error as Error).message);
    } finally {
      setSending(null);
    }
  }

  return (
    <main className="space-y-5">
      <Toast toast={toast} />
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">老師簡歷</h1>
          <p className="mt-1 text-sm text-slate-500">收集老師照片、學歷、經歷與教學風格，產出公版簡歷。</p>
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 md:w-72"
          placeholder="搜尋老師、專長、學歷"
        />
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-600">
          共 {filtered.length} 位老師
        </div>
        <div className="divide-y divide-slate-100 md:hidden">
          {filtered.map((row) => (
            <div key={row.teacherId} className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  {row.photoUrl ? <img src={row.photoUrl} alt={row.teacherName} className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-900">{row.teacherName}</div>
                  <div className="mt-1 text-sm text-slate-500">{row.specialties || "尚未填寫專長"}</div>
                  <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${row.status === "已填寫" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {row.status}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => send(row)} disabled={sending === row.teacherId} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">
                  {sending === row.teacherId ? "發送中..." : "發送填寫"}
                </button>
                <button onClick={() => copy(row.collectUrl, "填寫連結")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
                  複製填寫
                </button>
                <button onClick={() => window.open(row.cardUrl, "_blank")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
                  查看簡歷
                </button>
                <button onClick={() => copy(row.cardUrl, "簡歷連結")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
                  複製簡歷
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
              <tr>
                <th className="px-4 py-3">老師</th>
                <th className="px-4 py-3">狀態</th>
                <th className="px-4 py-3">專長</th>
                <th className="px-4 py-3">學歷</th>
                <th className="px-4 py-3">教學風格</th>
                <th className="px-4 py-3">更新時間</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((row) => (
                <tr key={row.teacherId}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 overflow-hidden rounded-lg bg-slate-100">
                        {row.photoUrl ? <img src={row.photoUrl} alt={row.teacherName} className="h-full w-full object-cover" /> : null}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">{row.teacherName}</div>
                        <div className="text-xs text-slate-400">{row.teacherPhone || row.teacherEmail || "-"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === "已填寫" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-3 text-slate-600" title={row.specialties}>{row.specialties || "-"}</td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-slate-600" title={row.education}>{row.education || "-"}</td>
                  <td className="max-w-[240px] truncate px-4 py-3 text-slate-600" title={row.teachingStyle}>{row.teachingStyle || "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{row.updatedAt || "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => send(row)} disabled={sending === row.teacherId} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                        {sending === row.teacherId ? "發送中..." : "發送填寫"}
                      </button>
                      <button onClick={() => copy(row.collectUrl, "填寫連結")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">複製填寫</button>
                      <button onClick={() => window.open(row.cardUrl, "_blank")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">查看</button>
                      <button onClick={() => copy(row.cardUrl, "簡歷連結")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">複製簡歷</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">尚無資料。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
