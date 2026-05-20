"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CLASS_STATUS_OPTIONS, SKILL_FOCUS_OPTIONS } from "@/lib/teachingReport";

type ReportInfo = {
  id: number;
  date: string;
  school: string;
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
  photos: string[];
  aiSummary: string;
  aiSkillFocus: string;
  aiTeachingNote: string;
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
  photos: [] as string[],
};

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1200;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("照片處理失敗"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function TeacherReportPage() {
  const params = useParams<{ id: string }>();
  const [info, setInfo] = useState<ReportInfo | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [customProgress, setCustomProgress] = useState(false);

  useEffect(() => {
    fetch(`/api/report/${params.id}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "讀取回報表單失敗，請稍後再試");
        return data;
      })
      .then((data: ReportInfo) => {
        const savedProgress = data.reportContent?.split("\n")[0]?.replace(/^課程進度：/, "") ?? "";
        setInfo(data);
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
          photos: data.photos ?? [],
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

  async function onPhotoChange(files: FileList | null) {
    if (!files) return;
    setError("");
    try {
      const selected = Array.from(files).slice(0, 5 - form.photos.length);
      const images = await Promise.all(selected.map(resizeImage));
      setForm((f) => ({ ...f, photos: [...f.photos, ...images].slice(0, 5) }));
    } catch {
      setError("照片處理失敗，請換一張照片再試");
    }
  }

  async function submit() {
    if (saving) return;
    if (!form.studentCount) {
      setError("請填寫今日出席人數");
      return;
    }
    if (!form.progress.trim()) {
      setError("請選擇或填寫今日課程進度");
      return;
    }
    if (form.skillFocus.length === 0) {
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
        }),
      });
      const responseData = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(responseData.error || "送出失敗");
      const generated = responseData;
      setInfo((current) => current ? { ...current, ...generated } : current);
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

  return (
    <div className="mx-auto max-w-md pb-10">
      <div className="mb-4 rounded-b-[28px] bg-gradient-to-br from-[#F5EBDD] via-[#F9F6EF] to-[#DCE8DD] px-5 pb-6 pt-5 shadow-sm">
        <div className="text-xs font-semibold tracking-[0.2em] text-[#7B9E87]">UPBEAR CLASS REPORT</div>
        <h1 className="mt-2 text-2xl font-bold text-[#2E2B27]">課後回報</h1>
        <div className="mt-4 rounded-2xl bg-white/75 p-4 text-sm text-slate-700 shadow-sm">
          <div className="font-semibold text-slate-900">{info.school}</div>
          <div className="mt-1">{info.date}｜{info.courseName}</div>
          <div className="mt-1 text-xs text-slate-500">老師：{info.teacherName}{info.className ? `｜班級：${info.className}` : ""}</div>
        </div>
      </div>

      {done && (
        <div className="mb-4 rounded-2xl border border-green-100 bg-green-50 p-4 text-sm text-green-700">
          已送出回報，教學紀錄已自動整理完成。
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
          <label className="text-sm font-semibold text-slate-800">今日課程進度</label>
          <p className="mt-1 text-xs text-slate-500">請點選今天上到哪一堂，若沒有適合的內容再自訂輸入。</p>
          {info.progressOptions?.length > 0 && (
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
          {(customProgress || !info.progressOptions?.length) && (
            <textarea value={form.progress} onChange={(e) => setForm({ ...form, progress: e.target.value })}
              className="mt-3 min-h-20 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#7B9E87]"
              placeholder="例：第 6 堂 側拉球，或自行填寫今日進度" />
          )}
        </section>

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
                <div className="mb-2 text-xs font-medium text-slate-500">是否通知園所</div>
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

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-800">課堂照片</div>
          <p className="mt-1 text-xs text-slate-500">可上傳 1～5 張，可從相簿選擇或直接拍照。</p>
          <div className="mt-2 text-xs font-medium text-[#3F6B55]">已選擇 {form.photos.length} / 5 張照片</div>
          <label className="mt-3 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-[#B8CDBE] bg-[#F8FBF8] px-4 py-5 text-sm font-medium text-[#3F6B55]">
            + 選擇或拍攝照片
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPhotoChange(e.target.files)} />
          </label>
          {form.photos.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {form.photos.map((photo, index) => (
                <div key={`${photo.slice(0, 20)}-${index}`} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt={`課堂照片 ${index + 1}`} className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setForm((f) => ({ ...f, photos: f.photos.filter((_, i) => i !== index) }))}
                    className="absolute right-1 top-1 rounded-full bg-black/55 px-2 py-1 text-xs text-white">刪除</button>
                </div>
              ))}
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
