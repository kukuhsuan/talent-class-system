"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CLASS_STATUS_OPTIONS, SKILL_FOCUS_OPTIONS } from "@/lib/teachingReport";

type ReportInfo = {
  id: number;
  date: string;
  school: string;
  department: string;
  reportMode: "kindergarten" | "simple";
  courseName: string;
  className: string;
  teacherName: string;
  studentCount: number | null;
  reportContent: string;
  progressOptions: Array<{ id: number; lesson: number; title: string; value: string }>;
  skillFocus: string[];
  classStatus: string;
  incident: boolean;
  incidentChild: string;
  incidentProcess: string;
  incidentAction: string;
  incidentNotified: string;
  aiSummary: string;
  aiSkillFocus: string;
  aiTeachingNote: string;
  shouldAskAssessment?: boolean;
  assessmentCount?: number;
  schoolNotifyStatus?: string;
  schoolNotifyError?: string;
};

const EMPTY = {
  studentCount: "",
  progress: "",
  skillFocus: [] as string[],
  classStatus: "很順利",
  incident: false,
  incidentChild: "",
  incidentProcess: "",
  incidentAction: "",
  incidentNotified: "否",
};

export default function TeacherReportPage() {
  const params = useParams<{ id: string }>();
  const [info, setInfo] = useState<ReportInfo | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [customProgress, setCustomProgress] = useState(false);
  const [assessmentUrl, setAssessmentUrl] = useState("");
  const [notifyStatus, setNotifyStatus] = useState("");
  const [notifyError, setNotifyError] = useState("");

  useEffect(() => {
    fetch(`/api/report/${params.id}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "讀取回報表單失敗，請稍後再試");
        return data;
      })
      .then((data: ReportInfo) => {
        const savedProgress = data.reportContent?.split("\n")[0]?.replace(/^(課程進度|訓練內容)：/, "") ?? "";
        setInfo(data);
        setNotifyStatus(data.schoolNotifyStatus || "");
        setNotifyError(data.schoolNotifyError || "");
        setForm({
          studentCount: data.studentCount?.toString() ?? "",
          progress: savedProgress,
          skillFocus: data.skillFocus ?? [],
          classStatus: data.classStatus || "很順利",
          incident: Boolean(data.incident),
          incidentChild: data.incidentChild ?? "",
          incidentProcess: data.incidentProcess ?? "",
          incidentAction: data.incidentAction ?? "",
          incidentNotified: data.incidentNotified || "否",
        });
        setCustomProgress(Boolean(savedProgress && !data.progressOptions?.some((item) => item.value === savedProgress)));
      })
      .catch((e) => setError((e as Error).message || "讀取回報表單失敗，請稍後再試"))
      .finally(() => setLoading(false));
  }, [params.id]);

  function toggleSkill(skill: string) {
    setForm((f) => ({
      ...f,
      skillFocus: f.skillFocus.includes(skill) ? f.skillFocus.filter((item) => item !== skill) : [...f.skillFocus, skill],
    }));
  }

  async function submit() {
    if (saving) return;
    const kindergarten = info?.reportMode === "kindergarten";
    if (!form.studentCount) {
      setError("請填寫今日出席人數");
      return;
    }
    if (!form.progress.trim()) {
      setError(kindergarten ? "請選擇或填寫今日課程進度" : "請填寫今天訓練什麼");
      return;
    }
    if (kindergarten && form.skillFocus.length === 0) {
      setError("請至少選擇一個今日能力培養");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/report/${params.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          studentCount: Number(form.studentCount),
          skillFocus: kindergarten ? form.skillFocus : [],
          classStatus: kindergarten ? form.classStatus : "",
        }),
      });
      const responseData = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(responseData.error || "送出失敗");
      const generated = responseData;
      setInfo((current) => current ? { ...current, ...generated } : current);
      setAssessmentUrl(responseData.assessmentUrl || "");
      setNotifyStatus(responseData.schoolNotifyStatus || "");
      setNotifyError(responseData.schoolNotifyError || "");
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message || "送出失敗，請稍後再試");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-md py-16 text-center text-slate-500">載入表單中...</div>;
  if (!info) return <div className="mx-auto max-w-md py-16 text-center text-red-500">{error || "找不到表單"}</div>;
  const isKindergarten = info.reportMode === "kindergarten";

  return (
    <div className="mx-auto max-w-md pb-10">
      <div className="mb-4 rounded-b-[28px] bg-gradient-to-br from-[#F5EBDD] via-[#F9F6EF] to-[#DCE8DD] px-5 pb-6 pt-5 shadow-sm">
        <div className="text-xs font-semibold tracking-[0.2em] text-[#7B9E87]">UPBEAR CLASS REPORT</div>
        <h1 className="mt-2 text-2xl font-bold text-[#2E2B27]">課後回報</h1>
        <div className="mt-4 rounded-2xl bg-white/75 p-4 text-sm text-slate-700 shadow-sm">
          <div className="font-semibold text-slate-900">{info.school}</div>
          <div className="mt-1">{info.date}｜{info.courseName}</div>
          <div className="mt-1 text-xs text-slate-500">類型：{info.department || "未分類"}｜老師：{info.teacherName}{info.className ? `｜班級：${info.className}` : ""}</div>
        </div>
      </div>

      {done && (
        <div className="mb-4 rounded-2xl border border-green-100 bg-green-50 p-4 text-sm text-green-700">
          <div className="font-semibold">已送出回報，教學紀錄已自動整理完成。</div>
          {notifyStatus && (
            <div className={`mt-2 rounded-xl px-3 py-2 text-xs ${notifyStatus === "通知成功" ? "bg-white text-green-700" : "bg-white text-amber-700"}`}>
              園所通知狀態：{notifyStatus}
              {notifyError ? <div className="mt-1 text-slate-500">{notifyError}</div> : null}
            </div>
          )}
          {assessmentUrl && (
            <div className="mt-3 rounded-xl bg-white p-3 text-slate-700">
              <div className="font-semibold text-[#3F6B55]">這是幼兒園最後一堂課</div>
              <p className="mt-1 text-xs text-slate-500">是否進行本學期幼兒運動評量？</p>
              <a href={assessmentUrl} className="mt-3 block rounded-xl bg-[#3F6B55] px-4 py-3 text-center text-sm font-bold text-white">
                進入學期末運動評量
              </a>
            </div>
          )}
        </div>
      )}
      {error && <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">{error}</div>}

      <div className="space-y-4">
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <label className="text-sm font-semibold text-slate-800">出席人數</label>
          <input inputMode="numeric" type="number" value={form.studentCount}
            onChange={(e) => setForm({ ...form, studentCount: e.target.value })}
            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-lg font-semibold outline-none focus:border-[#7B9E87]"
            placeholder="請輸入人數" />
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <label className="text-sm font-semibold text-slate-800">{isKindergarten ? "今日課程進度" : "今天訓練什麼"}</label>
          <p className="mt-1 text-xs text-slate-500">
            {isKindergarten ? "請點選今天上到哪一堂，若沒有適合的內容再自訂輸入。" : "簡短填寫今天訓練內容即可。"}
          </p>
          {isKindergarten && info.progressOptions?.length > 0 && (
            <div className="mt-3 grid gap-2">
              {info.progressOptions.map((item) => (
                <button key={`${item.lesson}-${item.title}`} type="button"
                  onClick={() => {
                    setCustomProgress(false);
                    setForm({ ...form, progress: item.value });
                  }}
                  className={`rounded-2xl border px-4 py-3 text-left transition-colors ${!customProgress && form.progress === item.value ? "border-[#7B9E87] bg-[#E7F0E9] text-[#2F5D49]" : "border-slate-200 bg-white text-slate-700"}`}>
                  <div className="text-xs font-semibold text-[#7B9E87]">第 {item.lesson} 堂</div>
                  <div className="mt-1 text-sm font-semibold leading-5">{item.title}</div>
                </button>
              ))}
              <button type="button" onClick={() => {
                setCustomProgress(true);
                setForm({ ...form, progress: "" });
              }}
                className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold ${customProgress ? "border-[#C8956C] bg-[#FFF6ED] text-[#8A552D]" : "border-slate-200 bg-white text-slate-600"}`}>
                自訂輸入
              </button>
            </div>
          )}
          {(!isKindergarten || customProgress || !info.progressOptions?.length) && (
            <textarea value={form.progress} onChange={(e) => setForm({ ...form, progress: e.target.value })}
              className="mt-3 min-h-20 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#7B9E87]"
              placeholder={isKindergarten ? "例：第 6 堂 側拉球，或自行填寫今日進度" : "例：傳接球、體能循環、分組對抗"} />
          )}
        </section>

        {isKindergarten && (
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-800">今日能力培養</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {SKILL_FOCUS_OPTIONS.map((skill) => (
                <button key={skill} type="button" onClick={() => toggleSkill(skill)}
                  className={`rounded-full border px-3 py-3 text-sm font-medium transition-colors ${form.skillFocus.includes(skill) ? "border-[#7B9E87] bg-[#E7F0E9] text-[#3F6B55]" : "border-slate-200 bg-white text-slate-600"}`}>
                  {skill}
                </button>
              ))}
            </div>
          </section>
        )}

        {isKindergarten && (
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-800">課堂狀況</div>
            <div className="mt-3 space-y-2">
              {CLASS_STATUS_OPTIONS.map((status) => (
                <label key={status} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${form.classStatus === status ? "border-[#7B9E87] bg-[#F1F7F2]" : "border-slate-200"}`}>
                  <input type="radio" checked={form.classStatus === status} onChange={() => setForm({ ...form, classStatus: status })} />
                  <span className="text-sm font-medium text-slate-700">{status}</span>
                </label>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-800">今天是否有特殊事件？</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[false, true].map((value) => (
              <button key={String(value)} type="button" onClick={() => setForm({ ...form, incident: value })}
                className={`rounded-xl border px-4 py-3 text-sm font-medium ${form.incident === value ? "border-[#7B9E87] bg-[#E7F0E9] text-[#3F6B55]" : "border-slate-200 text-slate-600"}`}>
                {value ? "有" : "無"}
              </button>
            ))}
          </div>
          {form.incident && (
            <div className="mt-4 space-y-3">
              <input value={form.incidentChild} onChange={(e) => setForm({ ...form, incidentChild: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" placeholder="孩子姓名" />
              <textarea value={form.incidentProcess} onChange={(e) => setForm({ ...form, incidentProcess: e.target.value })} className="min-h-20 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" placeholder="發生經過" />
              <textarea value={form.incidentAction} onChange={(e) => setForm({ ...form, incidentAction: e.target.value })} className="min-h-20 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" placeholder="處理方式" />
              <div>
                <div className="mb-2 text-xs font-medium text-slate-500">是否通知{isKindergarten ? "園所" : "現場老師或窗口"}</div>
                <div className="grid grid-cols-2 gap-2">
                  {["是", "否"].map((v) => (
                    <button key={v} type="button" onClick={() => setForm({ ...form, incidentNotified: v })}
                      className={`rounded-xl border px-4 py-3 text-sm font-medium ${form.incidentNotified === v ? "border-[#7B9E87] bg-[#E7F0E9] text-[#3F6B55]" : "border-slate-200 text-slate-600"}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {(info.aiSummary || done) && (
          <section className="rounded-2xl border border-[#DCE8DD] bg-[#F8FBF8] p-4 shadow-sm">
            <div className="text-sm font-semibold text-[#3F6B55]">AI 教學紀錄整理</div>
            <div className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
              {info.aiSummary && <p>{info.aiSummary}</p>}
              {info.aiSkillFocus && <p>{info.aiSkillFocus}</p>}
              {info.aiTeachingNote && <p>{info.aiTeachingNote}</p>}
            </div>
          </section>
        )}

        <button onClick={submit} disabled={saving}
          className="sticky bottom-4 w-full rounded-2xl bg-[#3F6B55] px-5 py-4 text-base font-bold text-white shadow-lg shadow-green-900/15 disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? "送出中..." : "送出課後回報"}
        </button>
      </div>
    </div>
  );
}
