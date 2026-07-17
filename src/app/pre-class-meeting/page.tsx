"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { courseLabel } from "@/lib/courseMeta";
import { Toast, type ToastState } from "@/components/Toast";

// 課前會議管理：每週五 12:30–13:00 線上會議，通知下週有課教練。

type Attendee = {
  id: number;
  teacherId: number;
  teacherName: string;
  hasLine: boolean;
  source: string;
  removed: boolean;
  notifyStatus: string;
  notifyError: string;
  notifiedAt: string | null;
  reply: string;
  repliedAt: string | null;
  courses: Array<{ date: string; school: string; courseType: string; time: string }>;
};

type Meeting = {
  id: number;
  meetingDate: string;
  startTime: string;
  endTime: string;
  meetLink: string;
  note: string;
  targetStart: string;
  targetEnd: string;
  confirmedAt: string | null;
  attendees: Attendee[];
};

type TeacherOption = { id: number; name: string };

function dateLabel(iso: string) {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}（${weekday}）`;
}

const REPLY_BADGE: Record<string, string> = {
  會參加: "bg-green-50 text-green-700",
  無法參加: "bg-rose-50 text-rose-700",
  尚未回覆: "bg-slate-100 text-slate-500",
};
const NOTIFY_BADGE: Record<string, string> = {
  已通知: "bg-blue-50 text-blue-700",
  通知失敗: "bg-rose-50 text-rose-700",
  未通知: "bg-amber-50 text-amber-700",
};

export default function PreClassMeetingPage() {
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((type: "success" | "error", message: string, duration = 3000) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ type, message });
    toastTimer.current = setTimeout(() => setToast(null), duration);
  }, []);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ meetingDate: "", startTime: "", endTime: "", meetLink: "", note: "" });
  const [addTeacherId, setAddTeacherId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meetingsRes, teachersRes] = await Promise.all([
        fetch("/api/pre-class-meetings"),
        fetch("/api/teachers?minimal=1").catch(() => null),
      ]);
      const meetingData = await meetingsRes.json();
      setMeetings(Array.isArray(meetingData) ? meetingData : []);
      if (teachersRes?.ok) {
        const teacherData = await teachersRes.json();
        const list = Array.isArray(teacherData) ? teacherData : teacherData.items ?? [];
        setTeachers(list.map((teacher: { id: number; name: string }) => ({ id: teacher.id, name: teacher.name })));
      }
    } catch {
      showToast("error", "載入課前會議失敗，請重新整理", 4000);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const patchMeeting = async (id: number, body: Record<string, unknown>, successText: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/pre-class-meetings/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "更新失敗");
      showToast("success", successText, 2600);
      await load();
    } catch (error) {
      showToast("error", (error as Error).message, 4000);
    } finally {
      setBusy(false);
    }
  };

  const notify = async (meetingId: number, teacherId?: number) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/pre-class-meetings/${meetingId}/notify`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(teacherId ? { teacherId } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "發送失敗");
      const failText = data.failures?.length ? `，失敗 ${data.failures.length} 位：${data.failures.join("、")}` : "";
      showToast(data.failures?.length ? "error" : "success", teacherId ? "已補發通知" : `已發送 ${data.sent} 位${failText}`, 5000);
      await load();
    } catch (error) {
      showToast("error", (error as Error).message, 5000);
    } finally {
      setBusy(false);
    }
  };

  const changeAttendee = async (meetingId: number, teacherId: number, method: "POST" | "DELETE") => {
    setBusy(true);
    try {
      const res = await fetch(`/api/pre-class-meetings/${meetingId}/attendees`, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teacherId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "操作失敗");
      showToast("success", method === "POST" ? "已加入名單" : "已移除", 2400);
      await load();
    } catch (error) {
      showToast("error", (error as Error).message, 4000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Toast toast={toast} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">課前會議</h1>
        <p className="mt-1 text-sm text-slate-500">
          固定每週五 12:30～13:00 線上會議，通知下週有「安親班」課程的教練（幼兒園課不列入）；週四自動產生名單，請確認後再一鍵發送。
        </p>
      </div>

      {loading && <div className="py-16 text-center text-slate-400">載入中…</div>}

      <div className="space-y-6">
        {meetings.map((meeting) => {
          const active = meeting.attendees.filter((row) => !row.removed);
          const lateUnnotified = active.filter((row) => row.source === "late" && row.notifyStatus === "未通知");
          const replied = active.filter((row) => row.reply !== "尚未回覆").length;
          const notified = active.filter((row) => row.notifyStatus === "已通知").length;
          const isEditing = editId === meeting.id;
          return (
            <section key={meeting.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/60 p-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">{dateLabel(meeting.meetingDate)} {meeting.startTime}～{meeting.endTime}</h2>
                    {meeting.confirmedAt
                      ? <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">名單已確認</span>
                      : <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">名單待確認</span>}
                    {lateUnnotified.length > 0 && (
                      <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">新增教練尚未通知 {lateUnnotified.length} 位</span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    通知對象：{dateLabel(meeting.targetStart)}～{dateLabel(meeting.targetEnd)} 有課教練｜應參加 {active.length} 位｜已通知 {notified}｜已回覆 {replied}
                  </div>
                  <a href={meeting.meetLink} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-sm font-medium text-blue-600 hover:text-blue-800">{meeting.meetLink}</a>
                  {meeting.note && <div className="mt-1 whitespace-pre-line text-sm text-slate-600">{meeting.note}</div>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!meeting.confirmedAt && (
                    <button disabled={busy} onClick={() => patchMeeting(meeting.id, { confirmed: true }, "名單已確認，可以發送通知")}
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60">確認名單</button>
                  )}
                  <button disabled={busy || !meeting.confirmedAt} title={meeting.confirmedAt ? "" : "請先確認名單"}
                    onClick={() => notify(meeting.id)}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">一鍵發送通知</button>
                  <button disabled={busy}
                    onClick={() => {
                      if (isEditing) { setEditId(null); return; }
                      setEditForm({ meetingDate: meeting.meetingDate, startTime: meeting.startTime, endTime: meeting.endTime, meetLink: meeting.meetLink, note: meeting.note });
                      setEditId(meeting.id);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">{isEditing ? "取消編輯" : "編輯會議"}</button>
                </div>
              </div>

              {isEditing && (
                <div className="border-b border-slate-100 bg-blue-50/40 p-5">
                  <div className="grid gap-3 md:grid-cols-4">
                    <label className="text-sm font-medium text-slate-700">會議日期
                      <input type="date" value={editForm.meetingDate} onChange={(e) => setEditForm({ ...editForm, meetingDate: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                    <label className="text-sm font-medium text-slate-700">開始時間
                      <input type="time" value={editForm.startTime} onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                    <label className="text-sm font-medium text-slate-700">結束時間
                      <input type="time" value={editForm.endTime} onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                    <label className="text-sm font-medium text-slate-700">視訊連結
                      <input value={editForm.meetLink} onChange={(e) => setEditForm({ ...editForm, meetLink: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                  </div>
                  <label className="mt-3 block text-sm font-medium text-slate-700">會議內容補充（會顯示在通知訊息中）
                    <textarea value={editForm.note} rows={2} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                  <div className="mt-3 flex gap-2">
                    <button disabled={busy} onClick={async () => { await patchMeeting(meeting.id, editForm, "會議已更新"); setEditId(null); }}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">儲存變更</button>
                    <span className="self-center text-xs text-slate-500">改期或改時間後，已通知教練不會自動重發，可用「一鍵發送」前先取消確認再確認，或個別補發。</span>
                  </div>
                </div>
              )}

              <div className="p-5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <select value={addTeacherId} onChange={(e) => setAddTeacherId(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="">手動新增教練…</option>
                    {teachers.filter((teacher) => !active.some((row) => row.teacherId === teacher.id)).map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                    ))}
                  </select>
                  <button disabled={busy || !addTeacherId}
                    onClick={async () => { await changeAttendee(meeting.id, Number(addTeacherId), "POST"); setAddTeacherId(""); }}
                    className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50">加入名單</button>
                </div>

                {active.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">目標週目前沒有排課教練。</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                          <th className="py-2 pr-3">教練</th>
                          <th className="py-2 pr-3">目標週課程</th>
                          <th className="py-2 pr-3">通知狀態</th>
                          <th className="py-2 pr-3">教練回覆</th>
                          <th className="py-2">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {active.map((row) => (
                          <tr key={row.id} className="border-b border-slate-100 align-top">
                            <td className="py-3 pr-3 whitespace-nowrap">
                              <div className="font-semibold text-slate-900">{row.teacherName}</div>
                              {!row.hasLine && <div className="mt-0.5 text-xs text-rose-600">未綁定 LINE</div>}
                              {row.source === "late" && row.notifyStatus === "未通知" && (
                                <span className="mt-1 inline-block rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">新增教練尚未通知</span>
                              )}
                              {row.source === "manual" && <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">手動加入</span>}
                            </td>
                            <td className="py-3 pr-3">
                              {row.courses.length === 0
                                ? <span className="text-xs text-slate-400">目標週無排課（手動加入）</span>
                                : row.courses.map((course, index) => (
                                  <div key={`${row.id}-${index}`} className="text-xs leading-5 text-slate-600">
                                    {dateLabel(course.date)}｜{course.school}｜{courseLabel(course.courseType)}{course.time ? `｜${course.time}` : ""}
                                  </div>
                                ))}
                            </td>
                            <td className="py-3 pr-3 whitespace-nowrap">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${NOTIFY_BADGE[row.notifyStatus] ?? "bg-slate-100 text-slate-500"}`}>{row.notifyStatus}</span>
                              {row.notifyError && <div className="mt-1 max-w-[160px] text-xs text-rose-600">{row.notifyError}</div>}
                              {row.notifiedAt && <div className="mt-1 text-xs text-slate-400">{new Date(row.notifiedAt).toLocaleString("zh-TW")}</div>}
                            </td>
                            <td className="py-3 pr-3 whitespace-nowrap">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${REPLY_BADGE[row.reply] ?? "bg-slate-100 text-slate-500"}`}>{row.reply}</span>
                              {row.repliedAt && <div className="mt-1 text-xs text-slate-400">{new Date(row.repliedAt).toLocaleString("zh-TW")}</div>}
                            </td>
                            <td className="py-3 whitespace-nowrap">
                              <div className="flex gap-3">
                                <button disabled={busy || !row.hasLine} onClick={() => notify(meeting.id, row.teacherId)}
                                  className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40">{row.notifyStatus === "已通知" ? "補發" : "發送"}</button>
                                <button disabled={busy} onClick={() => changeAttendee(meeting.id, row.teacherId, "DELETE")}
                                  className="text-sm font-medium text-rose-500 hover:text-rose-700">移除</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
