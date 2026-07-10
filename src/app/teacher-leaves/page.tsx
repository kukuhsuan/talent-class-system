"use client";

import { useEffect, useMemo, useState } from "react";

type Inquiry = {
  id: number;
  candidateTeacherId: number;
  candidateTeacherName: string;
  candidateLineUserId: string | null;
  candidateLineRegion: string;
  primaryRegionLabel?: string;
  primarySpecialtyLabel?: string;
  recentAttendanceCount?: number;
  primaryCourseTypes?: string[];
  status: string;
  sentAt: string | null;
  respondedAt: string | null;
};

type LeaveItem = {
  id: number;
  teacherId: number;
  teacherName: string;
  attendanceId: number;
  role: "主教" | "助教";
  leaveDate: string;
  time: string;
  school: string;
  courseType: string;
  address: string;
  reason: string;
  notes: string;
  status: string;
  semesterLeaveCountAtSubmit: number;
  rejectedReason: string;
  createdAt: string;
  isPayrollLocked: boolean;
  isReported: boolean;
  inquiries: Inquiry[];
};

type Candidate = {
  id: number;
  name: string;
  region: string;
  primaryRegion: string;
  primaryRegionLabel: string;
  primarySpecialty: string;
  primarySpecialtyLabel: string;
  recentAttendanceCount: number;
  primaryCourseTypes: string[];
  hasTeachingRecords: boolean;
  hasLineBinding: boolean;
  hasConflict: boolean;
  isOriginalTeacher: boolean;
  score: number;
};

type TeacherOption = {
  id: number;
  name: string;
  region?: string;
  lineUserId?: string | null;
  lineRegion?: string | null;
  teachingProfile?: {
    primaryRegionLabel: string;
    primarySpecialtyLabel: string;
    recentAttendanceCount: number;
    primaryCourseTypes: string[];
  };
};

const statusTone: Record<string, string> = {
  "待審核": "bg-amber-50 text-amber-700",
  "已核准，待找代課": "bg-blue-50 text-blue-700",
  "尋找代課中": "bg-indigo-50 text-indigo-700",
  "已找到代課": "bg-emerald-50 text-emerald-700",
  "已駁回": "bg-rose-50 text-rose-700",
  "已取消": "bg-slate-100 text-slate-600",
};

const STATUS_FILTERS = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待審核" },
  { value: "approved", label: "已核准" },
  { value: "searching", label: "尋找代課中" },
  { value: "found", label: "已找到代課" },
  { value: "rejected", label: "已駁回" },
  { value: "cancelled", label: "已取消" },
];

async function fetchLeaves(year: number, month: number, status: string) {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
    status,
  });
  return fetch(`/api/teacher-leaves?${params}`, { cache: "no-store" }).then((res) => res.json());
}

const inquiryLabel: Record<string, string> = {
  pending: "未回覆",
  available: "可代課",
  unavailable: "無法代課",
  cancelled: "取消代課",
  expired: "已失效",
  noLongerNeeded: "已找到代課",
};

const inquiryTone: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  available: "bg-emerald-50 text-emerald-700",
  unavailable: "bg-rose-50 text-rose-700",
  cancelled: "bg-orange-50 text-orange-700",
  expired: "bg-slate-100 text-slate-400",
  noLongerNeeded: "bg-emerald-50 text-emerald-700",
};

export default function TeacherLeavesPage() {
  const now = new Date();
  const [items, setItems] = useState<LeaveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Record<number, Candidate[]>>({});
  const [selected, setSelected] = useState<Record<number, Set<number>>>({});
  const [busy, setBusy] = useState<string>("");
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
  const [filterStatus, setFilterStatus] = useState("all");
  const [manualLeave, setManualLeave] = useState<LeaveItem | null>(null);
  const [teacherOptions, setTeacherOptions] = useState<TeacherOption[]>([]);
  const [manualTeacherQuery, setManualTeacherQuery] = useState("");
  const [manualTeacherId, setManualTeacherId] = useState<number | null>(null);
  const [manualNotes, setManualNotes] = useState("");
  const [manualNotifyOtherCandidates, setManualNotifyOtherCandidates] = useState(true);
  const [manualNotifySubstituteTeacher, setManualNotifySubstituteTeacher] = useState(true);

  const counts = useMemo(() => {
    const total = items.length;
    const pending = items.filter((item) => item.status === "待審核").length;
    const searching = items.filter((item) => item.status === "尋找代課中" || item.status === "已核准，待找代課").length;
    return { total, pending, searching };
  }, [items]);

  const statusLabel = STATUS_FILTERS.find((item) => item.value === filterStatus)?.label ?? "全部";
  const titleCount = filterStatus === "all" ? `共 ${items.length} 筆` : `${statusLabel} ${items.length} 筆`;
  const emptyText = filterStatus === "all" ? "本月份沒有請假申請" : "本月份沒有符合此狀態的請假申請";
  const years = Array.from({ length: 5 }, (_, index) => now.getFullYear() - 1 + index);
  const manualTeacherOptions = useMemo(() => {
    const query = manualTeacherQuery.trim().toLowerCase();
    return teacherOptions
      .filter((teacher) => teacher.id !== manualLeave?.teacherId)
      .filter((teacher) => {
        if (!query) return true;
        const profile = teacher.teachingProfile;
        return teacher.name.toLowerCase().includes(query)
          || (teacher.region ?? "").toLowerCase().includes(query)
          || (profile?.primaryRegionLabel ?? "").toLowerCase().includes(query)
          || (profile?.primarySpecialtyLabel ?? "").toLowerCase().includes(query)
          || (profile?.primaryCourseTypes ?? []).some((course) => course.toLowerCase().includes(query));
      })
      .slice(0, 12);
  }, [manualLeave?.teacherId, manualTeacherQuery, teacherOptions]);

  async function load() {
    setLoading(true);
    const data = await fetchLeaves(filterYear, filterMonth, filterStatus);
    setItems(data.items ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let ignore = false;
    void Promise.resolve().then(async () => {
      setLoading(true);
      const data = await fetchLeaves(filterYear, filterMonth, filterStatus);
      if (ignore) return;
      setItems(data.items ?? []);
      setLoading(false);
    });
    return () => { ignore = true; };
  }, [filterMonth, filterStatus, filterYear]);

  async function action(url: string, success: string, body?: unknown) {
    setBusy(url);
    setMessage("");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : "{}",
    });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) throw new Error(data.error ?? "操作失敗");
    setMessage(success);
    await load();
    return data;
  }

  async function approve(id: number) {
    try {
      await action(`/api/teacher-leaves/${id}/approve`, "已核准請假");
    } catch (error) {
      alert((error as Error).message);
    }
  }

  async function reject(id: number) {
    const reason = prompt("請輸入駁回原因（可留空）：") ?? "";
    try {
      await action(`/api/teacher-leaves/${id}/reject`, "已駁回請假", { reason });
    } catch (error) {
      alert((error as Error).message);
    }
  }

  async function loadCandidates(id: number) {
    setOpenId((current) => current === id ? null : id);
    if (candidates[id]) return;
    const data = await fetch(`/api/teacher-leaves/${id}/candidates`).then((res) => res.json());
    if (data.error) {
      alert(data.error);
      return;
    }
    setCandidates((prev) => ({ ...prev, [id]: data.items ?? [] }));
  }

  function toggleCandidate(leaveId: number, teacherId: number) {
    setSelected((prev) => {
      const next = new Set(prev[leaveId] ?? []);
      if (next.has(teacherId)) next.delete(teacherId);
      else next.add(teacherId);
      return { ...prev, [leaveId]: next };
    });
  }

  async function sendInquiries(id: number) {
    const ids = [...(selected[id] ?? new Set<number>())];
    if (ids.length === 0) return alert("請先勾選要詢問的老師");
    try {
      const data = await action(`/api/teacher-leaves/${id}/send-inquiries`, `已發送 ${ids.length} 位老師代課詢問`, { candidateTeacherIds: ids });
      if (data.skippedTeachers?.length) alert(`部分略過：\n${data.skippedTeachers.join("\n")}`);
    } catch (error) {
      alert((error as Error).message);
    }
  }

  async function confirmSubstitute(leave: LeaveItem, inquiry: Inquiry) {
    try {
      await action(`/api/teacher-leaves/${leave.id}/confirm-substitute`, "已確認代課，出勤與薪資已同步", { inquiryId: inquiry.id });
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes("已回報") && confirm("此課程已回報，確定仍要更換老師並同步薪資嗎？")) {
        try {
          await action(`/api/teacher-leaves/${leave.id}/confirm-substitute`, "已確認代課，出勤與薪資已同步", {
            inquiryId: inquiry.id,
            confirmReportedChange: true,
          });
        } catch (retryError) {
          alert((retryError as Error).message);
        }
        return;
      }
      alert(message);
    }
  }

  async function ensureTeacherOptions() {
    if (teacherOptions.length > 0) return;
    const data = await fetch("/api/teachers", { cache: "no-store" }).then((res) => res.json());
    setTeacherOptions(Array.isArray(data) ? data : []);
  }

  async function openManualAssign(leave: LeaveItem) {
    setManualLeave(leave);
    setManualTeacherQuery("");
    setManualTeacherId(null);
    setManualNotes("");
    setManualNotifyOtherCandidates(true);
    setManualNotifySubstituteTeacher(true);
    try {
      await ensureTeacherOptions();
    } catch (error) {
      alert((error as Error).message || "載入老師清單失敗");
    }
  }

  async function submitManualAssign(confirmReportedChange = false) {
    if (!manualLeave || !manualTeacherId) return alert("請先選擇代課老師");
    const url = `/api/teacher-leaves/${manualLeave.id}/manual-substitute`;
    setBusy(url);
    setMessage("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          substituteTeacherId: manualTeacherId,
          notes: manualNotes,
          notifyOtherCandidates: manualNotifyOtherCandidates,
          notifySubstituteTeacher: manualNotifySubstituteTeacher,
          confirmReportedChange,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.needsConfirmReportedChange && confirm("此課程已回報，確定仍要更換老師並同步薪資嗎？")) {
          setBusy("");
          await submitManualAssign(true);
          return;
        }
        throw new Error(data.error ?? "手動指定代課失敗");
      }
      const skipped = data.skippedNoLine?.length ? `；${data.skippedNoLine.length} 位老師未綁 LINE 已略過` : "";
      const failed = data.notifyErrors?.length ? `；${data.notifyErrors.length} 筆 LINE 通知失敗` : "";
      setMessage(`已手動指定 ${data.substituteTeacher?.name ?? "代課老師"}，並通知 ${data.otherCandidatesNotified ?? 0} 位候選老師${skipped}${failed}`);
      setManualLeave(null);
      await load();
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">老師請假</h1>
        <p className="mt-1 text-sm text-slate-500">老師送出請假後，管理端核准、手動發送代課詢問，最後再確認代課老師。</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">篩選結果</div>
          <div className="mt-1 text-3xl font-bold text-slate-800">{counts.total}</div>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
          <div className="text-sm text-amber-700">待審核</div>
          <div className="mt-1 text-3xl font-bold text-amber-700">{counts.pending}</div>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 shadow-sm">
          <div className="text-sm text-blue-700">待找代課</div>
          <div className="mt-1 text-3xl font-bold text-blue-700">{counts.searching}</div>
        </div>
      </div>

      {message && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</div>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-bold text-slate-800">請假申請列表｜{filterYear} 年 {filterMonth} 月｜{titleCount}</h2>
            <p className="mt-1 text-xs text-slate-500">老師可在 LINE 傳「申請請假」送出申請。月份以請假課程日期計算，不是申請時間。</p>
          </div>
          <div className="grid gap-3 md:grid-cols-[180px_180px_1fr] md:items-end">
            <label className="text-sm font-medium text-slate-700">
              年份
              <select
                value={filterYear}
                onChange={(event) => setFilterYear(Number(event.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
              >
                {years.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              月份
              <select
                value={filterMonth}
                onChange={(event) => setFilterMonth(Number(event.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{month} 月</option>)}
              </select>
            </label>
            <div>
              <div className="mb-1 text-sm font-medium text-slate-700">狀態</div>
              <div className="flex flex-wrap gap-2">
                {STATUS_FILTERS.map((status) => (
                  <button
                    key={status.value}
                    onClick={() => setFilterStatus(status.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      filterStatus === status.value
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {status.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-400">載入中...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400">{emptyText}</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item) => (
              <div key={item.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold text-slate-800">{item.teacherName}</span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{item.role}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[item.status] ?? "bg-slate-100 text-slate-600"}`}>{item.status}</span>
                      {item.isPayrollLocked && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">薪資已鎖</span>}
                      {item.isReported && <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">已回報</span>}
                    </div>
                    <div className="text-sm text-slate-600">
                      {item.leaveDate}　{item.time}　{item.school}｜{item.courseType}
                    </div>
                    {item.address && <div className="text-xs text-slate-400">{item.address}</div>}
                    <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <span className="font-semibold">原因：</span>{item.reason}
                    </div>
                    {item.status === "已駁回" && item.rejectedReason && (
                      <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        <span className="font-semibold">駁回原因：</span>{item.rejectedReason}
                      </div>
                    )}
                    <div className="text-xs text-slate-500">
                      申請時本學期累計 {item.semesterLeaveCountAtSubmit} 次｜申請時間 {item.createdAt?.slice(0, 16).replace("T", " ")}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {item.status === "待審核" && (
                      <>
                        <button disabled={Boolean(busy)} onClick={() => approve(item.id)} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">核准請假</button>
                        <button disabled={Boolean(busy)} onClick={() => reject(item.id)} className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">駁回</button>
                      </>
                    )}
                    {item.status !== "已駁回" && item.status !== "已取消" && item.status !== "已找到代課" && (
                      <>
                        <button disabled={Boolean(busy) || item.isPayrollLocked} onClick={() => loadCandidates(item.id)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                          選老師發詢問
                        </button>
                        <button disabled={Boolean(busy) || item.isPayrollLocked} onClick={() => openManualAssign(item)} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                          手動指定代課
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {item.inquiries.length > 0 && (
                  <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="mb-2 text-xs font-bold text-slate-500">老師回覆狀態</div>
                    <div className="flex flex-wrap gap-2">
                      {item.inquiries.map((inquiry) => (
                        <div key={inquiry.id} className="flex flex-col gap-2 rounded-lg bg-white px-3 py-2 text-sm shadow-sm md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <div className="font-medium text-slate-700">{inquiry.candidateTeacherName}</div>
                            <div className="mt-0.5 text-xs text-slate-500">
                              {inquiry.primaryRegionLabel ?? "尚無排課紀錄"}｜{inquiry.primarySpecialtyLabel ?? "尚無排課紀錄"}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-400">
                              近 90 天 {inquiry.recentAttendanceCount ?? 0} 堂
                              {inquiry.primaryCourseTypes?.length ? `｜${inquiry.primaryCourseTypes.join("、")}` : ""}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${inquiryTone[inquiry.status] ?? "bg-slate-100 text-slate-600"}`}>
                              狀態：{inquiryLabel[inquiry.status] ?? inquiry.status}
                            </span>
                          {inquiry.status === "available" && item.status !== "已找到代課" && (
                            <button onClick={() => confirmSubstitute(item, inquiry)} className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">
                              確認此老師代課
                            </button>
                          )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {openId === item.id && (
                  <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-800">選擇要詢問的老師</div>
                        <div className="text-xs text-slate-500">依同區、同專長、可代課狀態與近期排課自動排序；發送前仍由管理端最後勾選。</div>
                      </div>
                      <button onClick={() => sendInquiries(item.id)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">發送代課詢問</button>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                      {(candidates[item.id] ?? []).map((teacher) => {
                        const disabled = teacher.isOriginalTeacher || !teacher.hasLineBinding || teacher.hasConflict;
                        return (
                          <label key={teacher.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-3 text-sm ${disabled ? "opacity-50" : "hover:border-blue-200"}`}>
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={Boolean(selected[item.id]?.has(teacher.id))}
                              onChange={() => toggleCandidate(item.id, teacher.id)}
                              className="mt-1"
                            />
                            <span className="min-w-0">
                              <span className="block font-semibold text-slate-800">{teacher.name}</span>
                              <span className="mt-1 block text-xs text-slate-600">
                                {teacher.primaryRegionLabel}｜{teacher.primarySpecialtyLabel}
                              </span>
                              <span className="mt-0.5 block text-[11px] text-slate-400">
                                近 90 天 {teacher.recentAttendanceCount} 堂
                                {teacher.primaryCourseTypes.length > 0 ? `｜主要課程：${teacher.primaryCourseTypes.join("、")}` : ""}
                              </span>
                              <span className="mt-1 flex flex-wrap gap-1 text-[11px]">
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{teacher.primaryRegionLabel}</span>
                                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-700">{teacher.primarySpecialtyLabel}</span>
                                <span className={`rounded-full px-2 py-0.5 ${teacher.hasLineBinding ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                                  {teacher.hasLineBinding ? "LINE 已綁" : "未綁 LINE"}
                                </span>
                                {teacher.hasConflict && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">同時段有課</span>}
                                {teacher.isOriginalTeacher && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">原老師</span>}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {manualLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800">手動指定代課老師</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {manualLeave.leaveDate}　{manualLeave.time}　{manualLeave.school}｜{manualLeave.courseType}
                </p>
              </div>
              <button onClick={() => setManualLeave(null)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600">關閉</button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block text-sm font-semibold text-slate-700">
                代課老師搜尋
                <input
                  value={manualTeacherQuery}
                  onChange={(event) => setManualTeacherQuery(event.target.value)}
                  placeholder="輸入老師姓名或地區搜尋"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                />
              </label>

              <div className="grid max-h-72 gap-2 overflow-y-auto md:grid-cols-2">
                {manualTeacherOptions.map((teacher) => {
                  const selectedTeacher = manualTeacherId === teacher.id;
                  const hasLine = Boolean(teacher.lineUserId && teacher.lineRegion);
                  return (
                    <button
                      key={teacher.id}
                      type="button"
                      onClick={() => setManualTeacherId(teacher.id)}
                      className={`rounded-xl border p-3 text-left text-sm transition-colors ${
                        selectedTeacher ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white hover:border-blue-200"
                      }`}
                    >
                      <span className="block font-semibold text-slate-800">{teacher.name}</span>
                      {teacher.teachingProfile && (
                        <span className="mt-1 block text-xs text-slate-600">
                          {teacher.teachingProfile.primaryRegionLabel}｜{teacher.teachingProfile.primarySpecialtyLabel}
                        </span>
                      )}
                      {teacher.teachingProfile && (
                        <span className="mt-0.5 block text-[11px] text-slate-400">
                          近 90 天 {teacher.teachingProfile.recentAttendanceCount} 堂
                          {teacher.teachingProfile.primaryCourseTypes.length > 0 ? `｜${teacher.teachingProfile.primaryCourseTypes.join("、")}` : ""}
                        </span>
                      )}
                      <span className="mt-1 flex flex-wrap gap-1 text-[11px]">
                        {teacher.teachingProfile?.primaryRegionLabel && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{teacher.teachingProfile.primaryRegionLabel}</span>}
                        {teacher.teachingProfile?.primarySpecialtyLabel && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-700">{teacher.teachingProfile.primarySpecialtyLabel}</span>}
                        <span className={`rounded-full px-2 py-0.5 ${hasLine ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                          {hasLine ? "LINE 已綁" : "未綁 LINE"}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {manualTeacherOptions.length === 0 && <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-400">找不到符合的老師</div>}
              </div>

              <label className="block text-sm font-semibold text-slate-700">
                備註（選填）
                <textarea
                  value={manualNotes}
                  onChange={(event) => setManualNotes(event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                  placeholder="例如：行政電話確認可代課"
                />
              </label>

              <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={manualNotifyOtherCandidates} onChange={(event) => setManualNotifyOtherCandidates(event.target.checked)} />
                  通知其他候選老師已找到代課
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={manualNotifySubstituteTeacher} onChange={(event) => setManualNotifySubstituteTeacher(event.target.checked)} />
                  通知新代課老師
                </label>
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={() => setManualLeave(null)} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600">取消</button>
                <button disabled={Boolean(busy) || !manualTeacherId} onClick={() => submitManualAssign()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  確認指定
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
