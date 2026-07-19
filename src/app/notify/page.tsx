"use client";
import { useEffect, useState } from "react";
import { courseLabel } from "@/lib/courseMeta";

type Teacher = { id: number; name: string; lineUserId: string | null; lineBindCode: string | null; lineRegion: string };
type School = { id: number; name: string; region: string; lineUserId: string | null; lineBindCode: string | null };
type Attendance = {
  id: number;
  date: string;
  course: { school: string; courseType: string; code: string };
  actualTeacher: { name: string; lineUserId: string | null; lineRegion: string | null };
  reportSentAt: string | null;
  reportContent: string;
  cancelled: boolean;
  studentCount: number | null;
  pendingReport?: boolean;
};

const REGION_LABEL = { north: "北部", south: "南部" };

export default function NotifyPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [tab, setTab] = useState<"teachers" | "schools" | "attendance">("teachers");
  const [sending, setSending] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [publicBase, setPublicBase] = useState("");

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  useEffect(() => {
    queueMicrotask(() => setPublicBase(window.location.origin));
  }, []);

  useEffect(() => {
    fetch("/api/teachers").then(r => r.json()).then(setTeachers);
    // minimal=1 跳過開課確認彙整（完整模式在正式站會逾時，導致園所清單一直空白）
    fetch("/api/schools?minimal=1").then(r => r.json()).then(data => setSchools(Array.isArray(data) ? data : []));
  }, []);

  useEffect(() => {
    fetch(`/api/attendance?year=${year}&month=${month}&pageSize=50&page=1`)
      .then(r => r.json())
      .then(data => setAttendance(Array.isArray(data) ? data : (data.items ?? [])));
  }, [year, month]);

  async function generateTeacherCode(teacherId: number) {
    setSending(teacherId);
    const res = await fetch("/api/teachers/bind", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teacherId }) });
    const { code } = await res.json();
    setTeachers(prev => prev.map(t => t.id === teacherId ? { ...t, lineBindCode: code } : t));
    setSending(null);
  }

  async function generateSchoolCode(schoolId: number) {
    setSending(schoolId * -1);
    const res = await fetch("/api/schools/bind", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schoolId }) });
    const { code } = await res.json();
    setSchools(prev => prev.map(s => s.id === schoolId ? { ...s, lineBindCode: code } : s));
    setSending(null);
  }

  async function sendReminder(dayOffset = 0) {
    const sendingKey = dayOffset === 1 ? -997 : -999;
    setSending(sendingKey);
    try {
      const res = await fetch("/api/line/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "reminder", dayOffset }),
      });
      const data = await res.json();
      const label = dayOffset === 1 ? "明日課程提醒" : "今日課程提醒";
      if (!res.ok) throw new Error(data.error ?? `${label}發送失敗`);
      const failedText = data.failed ? `，${data.failed} 位失敗：${(data.errors ?? []).join("；")}` : "";
      setMsg(`${label}已發送 ${data.sent} 則，${data.skipped} 位老師尚未綁定 LINE${failedText}`);
    } catch (error) {
      setMsg(`課程提醒發送失敗：${(error as Error).message}`);
    } finally {
      setSending(null);
    }
  }

  async function sendSchedule() {
    setSending(-998);
    try {
      const res = await fetch("/api/line/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "課程表傳送失敗");
      const failedText = data.failed ? `，${data.failed} 位失敗：${(data.errors ?? []).join("；")}` : "";
      setMsg(`課程表已發送給 ${data.sent} 位老師，${data.skipped} 位略過${failedText}`);
    } catch (error) {
      setMsg(`課程傳送發生錯誤：${(error as Error).message}`);
    } finally {
      setSending(null);
    }
  }

  async function sendReportRequest(attendanceId: number) {
    setSending(attendanceId);
    const res = await fetch("/api/line/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "report_request", attendanceId }) });
    if (res.ok) setMsg("已發送回報請求");
    else { const d = await res.json(); setMsg(`發送失敗：${d.error}`); }
    setSending(null);
  }

  const bound = teachers.filter(t => t.lineUserId).length;
  const unbound = teachers.filter(t => !t.lineUserId).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">LINE 通知管理</h1>
          <p className="text-sm text-slate-500">管理老師/園所綁定，發送課程提醒與回報請求</p>
        </div>
        <div className="flex gap-2">
          <button onClick={sendSchedule} disabled={sending === -998}
            className="bg-amber-700 hover:bg-amber-800 text-white font-medium px-4 py-2 rounded-lg text-sm disabled:opacity-50">
            {sending === -998 ? "發送中..." : "📅 發送課程表"}
          </button>
          <button onClick={() => sendReminder(1)} disabled={sending === -997}
            className="bg-sky-600 hover:bg-sky-700 text-white font-medium px-4 py-2 rounded-lg text-sm disabled:opacity-50">
            {sending === -997 ? "發送中..." : "發送明日課程提醒"}
          </button>
          <button onClick={() => sendReminder(0)} disabled={sending === -999}
            className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-lg text-sm disabled:opacity-50">
            {sending === -999 ? "發送中..." : "發送今日課程提醒"}
          </button>
        </div>
      </div>

      {msg && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4 text-sm text-green-800 flex justify-between">
          {msg}
          <button onClick={() => setMsg("")} className="text-green-500 hover:text-green-700">✕</button>
        </div>
      )}

      {/* Webhook URLs */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <p className="text-sm font-semibold text-blue-800 mb-2">LINE Webhook 設定網址（貼到 LINE Developers Console）</p>
        <p className="text-xs text-blue-700 mb-3">
          以下網址依目前瀏覽器網域產生（本機測試請用 <code className="bg-white/80 px-1 rounded">http://localhost:…</code> 公開網址需 HTTPS）。
        </p>
        <div className="space-y-1">
          {[
            { label: "北部 OA", path: "/api/line/north" },
            { label: "南部 OA", path: "/api/line/south" },
            { label: "園所 OA 1", path: "/api/line/school" },
            { label: "園所 OA 2", path: "/api/line/school2" },
          ].map(({ label, path }) => (
            <div key={path} className="flex items-center gap-2">
              <span className="text-xs font-medium text-blue-700 w-20">{label}</span>
              <code className="text-xs bg-white border border-blue-200 px-2 py-1 rounded flex-1 select-all break-all">
                {publicBase ? `${publicBase}${path}` : `（載入中）${path}`}
              </code>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-600 mt-4 border-t border-blue-200/80 pt-3">
          <span className="font-semibold text-slate-700">園所 OA 測試：</span>
          原本園所 OA 使用 <code className="bg-white px-1 rounded">LINE_SCHOOL_TOKEN</code> / <code className="bg-white px-1 rounded">LINE_SCHOOL_SECRET</code>；
          第二組園所 OA 使用 <code className="bg-white px-1 rounded">LINE_SCHOOL2_TOKEN</code> / <code className="bg-white px-1 rounded">LINE_SCHOOL2_SECRET</code>。
          園所從哪一組 OA 完成綁定，之後課程回報就會由同一組 OA 發送。
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{bound}</div>
          <div className="text-xs text-slate-500 mt-1">已綁定老師</div>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <div className="text-2xl font-bold text-orange-500">{unbound}</div>
          <div className="text-xs text-slate-500 mt-1">未綁定老師</div>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{schools.filter(s => s.lineUserId).length}</div>
          <div className="text-xs text-slate-500 mt-1">已綁定園所</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {([["teachers", "老師綁定"], ["schools", "園所綁定"], ["attendance", "出勤回報"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "teachers" && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">老師</th>
                <th className="text-left px-4 py-3 font-medium">LINE 狀態</th>
                <th className="text-left px-4 py-3 font-medium">地區</th>
                <th className="text-left px-4 py-3 font-medium">綁定碼</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {teachers.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{t.name}</td>
                  <td className="px-4 py-3">
                    {t.lineUserId
                      ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">已綁定</span>
                      : <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">未綁定</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {t.lineRegion ? REGION_LABEL[t.lineRegion as keyof typeof REGION_LABEL] || t.lineRegion : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {t.lineBindCode
                      ? <code className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">{t.lineBindCode}</code>
                      : <span className="text-xs text-slate-400">未產生</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => generateTeacherCode(t.id)} disabled={sending === t.id}
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1 rounded-lg disabled:opacity-50">
                      {sending === t.id ? "產生中..." : t.lineBindCode ? "重新產生" : "產生綁定碼"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "schools" && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">園所</th>
                <th className="text-left px-4 py-3 font-medium">地區</th>
                <th className="text-left px-4 py-3 font-medium">LINE 狀態</th>
                <th className="text-left px-4 py-3 font-medium">綁定碼</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {schools.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{s.region || "—"}</td>
                  <td className="px-4 py-3">
                    {s.lineUserId
                      ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">已綁定</span>
                      : <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">未綁定</span>}
                  </td>
                  <td className="px-4 py-3">
                    {s.lineBindCode
                      ? <code className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">{s.lineBindCode}</code>
                      : <span className="text-xs text-slate-400">未產生</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => generateSchoolCode(s.id)} disabled={sending === s.id * -1}
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1 rounded-lg disabled:opacity-50">
                      {sending === s.id * -1 ? "產生中..." : s.lineBindCode ? "重新產生" : "產生綁定碼"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "attendance" && (
        <div>
          <div className="flex gap-3 mb-4">
            <select value={year} onChange={e => setYear(Number(e.target.value))} className="border rounded-lg px-3 py-1.5 text-sm">
              {[2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
            </select>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border rounded-lg px-3 py-1.5 text-sm">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
            </select>
          </div>
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">日期</th>
                  <th className="text-left px-4 py-3 font-medium">學校 / 課程</th>
                  <th className="text-left px-4 py-3 font-medium">老師</th>
                  <th className="text-left px-4 py-3 font-medium">回報內容</th>
                  <th className="text-left px-4 py-3 font-medium">轉發園所</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {attendance.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-slate-500">{a.date.slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{a.course.school}</div>
                      <div className="text-xs text-slate-400">{courseLabel(a.course.courseType)}</div>
                    </td>
                    <td className="px-4 py-3">
                      {a.actualTeacher.name}
                      {!a.actualTeacher.lineUserId && <div className="text-xs text-orange-400">未綁定 LINE</div>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {a.reportContent
                        ? <span className="text-green-700">{a.reportContent}{a.studentCount != null ? ` · ${a.studentCount}人` : ""}</span>
                        : <span className="text-slate-400">尚未回報</span>}
                    </td>
                    <td className="px-4 py-3">
                      {a.reportSentAt
                        ? <span className="text-xs text-green-600">已轉發</span>
                        : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {a.actualTeacher.lineUserId && a.pendingReport && (
                        <button onClick={() => sendReportRequest(a.id)} disabled={sending === a.id}
                          className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1 rounded-lg disabled:opacity-50">
                          {sending === a.id ? "發送中..." : "請老師回報"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {attendance.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-slate-400">本月尚無上課紀錄</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
