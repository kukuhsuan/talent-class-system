"use client";
import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useParams } from "next/navigation";
import { requiresStudentCount } from "@/lib/courseMeta";
import { normalizeAbilities } from "@/lib/abilityMap";
import { SKILL_FOCUS_OPTIONS, normalizeClassStatus } from "@/lib/teachingReport";

type ReportInfo = {
  id: number;
  date: string;
  school: string;
  department: string;
  category: string;
  reportMode: "kindergarten" | "simple";
  courseName: string;
  className: string;
  teacherName: string;
  studentCount: number | null;
  reportContent: string;
  progressOptions: Array<{ id: number; lesson: number; title: string; value: string; focus?: string; skills?: string[]; outcomeText?: string }>;
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
  representativePhotoUrl?: string;
  photoUrls?: string[];
  shouldAskAssessment?: boolean;
  assessmentUrl?: string;
  assessmentCount?: number;
  schoolNotifyStatus?: string;
  schoolNotifyError?: string;
  reportLocked?: boolean;
  reportPhotoLocked?: boolean;
  reportNotStarted?: boolean;
  courseEndsAt?: string;
  reportExpiresAt?: string;
  schoolSignatureRequired?: boolean;
  schoolVerifierName?: string;
  schoolSignatureData?: string;
  schoolSignedAt?: string | null;
};

const EMPTY = {
  studentCount: "",
  progress: "",
  outcomeText: "",
  skillFocus: [] as string[],
  classStatus: "積極參與",
  representativePhotoUrl: "",
  incident: false,
  incidentChild: "",
  incidentProcess: "",
  incidentAction: "",
  incidentNotified: "否",
  schoolVerifierName: "",
  schoolSignatureData: "",
};

function SignaturePad({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(Boolean(value));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stopTouchScroll = (event: TouchEvent) => event.preventDefault();
    canvas.addEventListener("touchstart", stopTouchScroll, { passive: false });
    canvas.addEventListener("touchmove", stopTouchScroll, { passive: false });
    const rect = canvas.getBoundingClientRect();
    const scale = Math.max(1, Math.min(2, 1600 / Math.max(rect.width, 1), 1200 / Math.max(rect.height, 1)));
    canvas.width = Math.round(rect.width * scale);
    canvas.height = Math.round(rect.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 4 * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (value) {
      const image = new Image();
      image.onload = () => ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      image.src = value;
    }
    return () => {
      canvas.removeEventListener("touchstart", stopTouchScroll);
      canvas.removeEventListener("touchmove", stopTouchScroll);
    };
  }, [open, value]);

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  }
  function start(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    event.preventDefault();
    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const ctx = event.currentTarget.getContext("2d")!;
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    setHasInk(true);
  }
  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || disabled) return;
    event.preventDefault();
    const ctx = event.currentTarget.getContext("2d")!;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasInk(true);
  }
  function finish() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
  }
  function complete() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    drawingRef.current = false;
    onChange(canvas.toDataURL("image/jpeg", 0.68));
    setOpen(false);
  }
  function clear() {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    setHasInk(false);
  }

  return (
    <div>
      {value ? (
        <div className="mt-2 h-28 w-full rounded-xl border border-emerald-200 bg-white bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${value})` }} />
      ) : (
        <div className="mt-2 flex h-28 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-sm text-slate-400">尚未簽名</div>
      )}
      <button type="button" disabled={disabled} onClick={() => { setHasInk(Boolean(value)); setOpen(true); }} className="mt-3 w-full rounded-xl bg-[#3F6B55] px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
        {value ? "重新簽名（開啟滿版）" : "開始簽名（開啟滿版）"}
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex h-[100dvh] touch-none flex-col overflow-hidden overscroll-none bg-slate-900 p-3 text-white sm:p-5">
          <div className="flex items-center justify-between gap-3 pb-3">
            <div>
              <div className="text-base font-bold">園所老師簽名</div>
              <div className="mt-0.5 text-xs text-slate-300">請在下方白色區域簽名，手機橫放會更好寫</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold">取消</button>
          </div>
          <canvas ref={canvasRef} width={1200} height={600} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}
            style={{ touchAction: "none", overscrollBehavior: "none" }} className="min-h-0 flex-1 touch-none select-none rounded-2xl bg-white shadow-inner" />
          <div className="flex gap-3 pt-3">
            <button type="button" disabled={!hasInk} onClick={clear} className="flex-1 rounded-xl border border-slate-600 px-4 py-3 text-sm font-bold disabled:opacity-40">清除</button>
            <button type="button" disabled={!hasInk} onClick={complete} className="flex-[2] rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-40">完成簽名</button>
          </div>
        </div>
      )}
    </div>
  );
}

// 開課前確認（幼兒園第一堂課，老師手機填寫）
type StartConfirmationRecord = {
  id: number;
  attendanceId: number;
  toddlerClassCount: number;
  smallClassCount: number;
  middleClassCount: number;
  bigClassCount: number;
  totalCount: number;
  location: string;
  classNotes: string;
  submittedAt: string;
};

const START_COUNT_FIELDS = [
  { key: "toddler", label: "幼幼班" },
  { key: "small", label: "小班" },
  { key: "middle", label: "中班" },
  { key: "big", label: "大班" },
] as const;

function StartConfirmationCard({ reportId, attendanceId }: { reportId: string; attendanceId: number }) {
  const [eligible, setEligible] = useState(false);
  const [record, setRecord] = useState<StartConfirmationRecord | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({ toddler: 0, small: 0, middle: 0, big: 0 });
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/report/${reportId}/start-confirmation`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setEligible(Boolean(data.eligible));
        setRecord(data.record ?? null);
      })
      .catch(() => undefined);
  }, [reportId]);

  const total = counts.toddler + counts.small + counts.middle + counts.big;

  function adjust(key: string, delta: number) {
    setCounts((current) => ({ ...current, [key]: Math.max(0, Math.min(999, (current[key] ?? 0) + delta)) }));
  }

  async function submit() {
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/report/${reportId}/start-confirmation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toddlerClassCount: counts.toddler,
          smallClassCount: counts.small,
          middleClassCount: counts.middle,
          bigClassCount: counts.big,
          location,
          classNotes: notes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.record) {
          setRecord(data.record);
          setEligible(false);
        }
        throw new Error(data.error || "送出失敗");
      }
      setRecord(data.record);
      setEligible(false);
    } catch (err) {
      setMessage((err as Error).message || "送出失敗，請稍後再試");
    } finally {
      setSaving(false);
    }
  }

  // 本堂已送出：顯示已送出狀態
  if (record && record.attendanceId === attendanceId) {
    return (
      <section className="rounded-2xl border border-[#C9DCCB] bg-[#F6FBF5] p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-[#3F6B55]">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#3F6B55] text-xs text-white">✓</span>
          開課前確認已送出
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
          <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-[#C9DCCB]">幼幼班 {record.toddlerClassCount}｜小班 {record.smallClassCount}</div>
          <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-[#C9DCCB]">中班 {record.middleClassCount}｜大班 {record.bigClassCount}</div>
          <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-[#C9DCCB]">總人數 {record.totalCount} 人</div>
          {record.location ? <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-[#C9DCCB]">地點：{record.location}</div> : null}
        </div>
        <div className="mt-3 text-xs text-slate-500">
          填寫時間：{new Date(record.submittedAt.includes("T") ? record.submittedAt : `${record.submittedAt.replace(" ", "T")}Z`).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
        </div>
      </section>
    );
  }

  if (!eligible) return null;

  return (
    <section className="rounded-2xl border border-[#E3D3B5] bg-[#FDFAF3] p-4 shadow-sm">
      <div className="text-sm font-bold text-[#8A552D]">開課前確認</div>
      <p className="mt-1 text-xs leading-5 text-slate-500">本課程第一堂課請先確認各班人數與上課資訊，本學期填寫一次即可。</p>
      <div className="mt-3 space-y-2">
        {START_COUNT_FIELDS.map((field) => (
          <div key={field.key} className="flex items-center gap-2">
            <div className="w-16 shrink-0 text-sm font-semibold text-slate-700">{field.label}</div>
            <button type="button" onClick={() => adjust(field.key, -1)}
              className="h-12 w-12 shrink-0 rounded-xl border border-slate-200 bg-white text-2xl font-bold text-slate-500 active:bg-slate-100">−</button>
            <input inputMode="numeric" type="number" value={counts[field.key]}
              onChange={(e) => setCounts((current) => ({ ...current, [field.key]: Math.max(0, Math.min(999, Number(e.target.value.replace(/[^\d]/g, "")) || 0)) }))}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white text-center text-lg font-semibold outline-none focus:border-[#C8956C]" />
            <button type="button" onClick={() => adjust(field.key, 1)}
              className="h-12 w-12 shrink-0 rounded-xl border border-slate-200 bg-white text-2xl font-bold text-slate-500 active:bg-slate-100">＋</button>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-[#F3E8D3] px-4 py-3 text-sm font-bold text-[#8A552D]">總人數：{total} 人</div>
      <label className="mt-3 block text-sm font-semibold text-slate-700">
        上課地點
        <input value={location} onChange={(e) => setLocation(e.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#C8956C]" placeholder="例：操場、活動中心" />
      </label>
      <label className="mt-3 block text-sm font-semibold text-slate-700">
        班級注意事項（選填）
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
          className="mt-2 min-h-16 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#C8956C]" placeholder="例：有孩子需特別留意，或器材放置位置" />
      </label>
      {message && <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">{message}</div>}
      <button type="button" onClick={() => void submit()} disabled={saving}
        className="mt-4 w-full rounded-xl bg-[#8A552D] px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
        {saving ? "送出中..." : "送出開課前確認"}
      </button>
    </section>
  );
}

function loadLocalImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("圖片讀取失敗"));
    };
    img.src = url;
  });
}

function extractReportField(content: string, label: string) {
  const line = content.split("\n").find((item) => item.trim().startsWith(`${label}：`));
  return line?.replace(`${label}：`, "").trim() ?? "";
}

async function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("圖片壓縮失敗"));
      else resolve(blob);
    }, "image/jpeg", quality);
  });
}

const PHOTO_LIMIT = 4;

// 成果回報常用句型（一鍵帶入後可再修改）
const OUTCOME_TEMPLATES = [
  "孩子今天能跟著老師完成挑戰，課堂參與穩定，也願意嘗試不同任務。",
  "本堂練習新動作，多數孩子能掌握基本要領，會再於下堂課加強熟練度。",
  "孩子的秩序與專注有進步，分組活動時能互相配合、輪流等待。",
];

function isHeicLike(file: File) {
  return /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

async function compressReportPhoto(file: File) {
  const img = await loadLocalImage(file);
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("手機瀏覽器不支援圖片壓縮");
  ctx.drawImage(img, 0, 0, width, height);

  let result = await canvasToBlob(canvas, 0.76);
  for (const quality of [0.66, 0.56, 0.46]) {
    if (result.size <= 520 * 1024) break;
    result = await canvasToBlob(canvas, quality);
  }

  return new File([result], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
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
  const [assessmentUrl, setAssessmentUrl] = useState("");
  const [notifyStatus, setNotifyStatus] = useState("");
  const [notifyError, setNotifyError] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);
  const draftKey = `report-draft-${params.id}`;
  const draftReadyRef = useRef(false);

  // 草稿自動暫存：老師填到一半離開（接電話、切 LINE）回來不會消失
  useEffect(() => {
    if (!draftReadyRef.current) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ form, customProgress, savedAt: Date.now() }));
    } catch {
      // localStorage 滿或無痕模式：略過即可，不影響填寫
    }
  }, [form, customProgress, draftKey]);

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
        setAssessmentUrl(data.assessmentUrl || "");
        setPhotos(data.photoUrls ?? (data.representativePhotoUrl ? [data.representativePhotoUrl] : []));
        const serverForm = {
          studentCount: data.studentCount?.toString() ?? "",
          progress: savedProgress,
          outcomeText: extractReportField(data.reportContent ?? "", "成果回報") || data.aiTeachingNote || "",
          skillFocus: normalizeAbilities(data.skillFocus ?? [], 4),
          classStatus: normalizeClassStatus(data.classStatus),
          representativePhotoUrl: data.representativePhotoUrl ?? "",
          incident: Boolean(data.incident),
          incidentChild: data.incidentChild ?? "",
          incidentProcess: data.incidentProcess ?? "",
          incidentAction: data.incidentAction ?? "",
          incidentNotified: data.incidentNotified || "否",
          schoolVerifierName: data.schoolVerifierName ?? "",
          schoolSignatureData: data.schoolSignatureData ?? "",
        };
        let restoredCustom = Boolean(savedProgress && !data.progressOptions?.some((item) => item.value === savedProgress));
        // 還原未送出的草稿（只在可填寫時；不覆蓋伺服器已有的簽名紀錄）
        const reportDone = Boolean(data.reportContent?.trim());
        if (!reportDone && !data.reportLocked) {
          try {
            const raw = localStorage.getItem(`report-draft-${params.id}`);
            if (raw) {
              const draft = JSON.parse(raw);
              if (draft?.form && typeof draft.form === "object") {
                Object.assign(serverForm, {
                  ...draft.form,
                  schoolSignatureData: serverForm.schoolSignatureData || draft.form.schoolSignatureData || "",
                });
                if (typeof draft.customProgress === "boolean") restoredCustom = draft.customProgress;
                setDraftRestored(true);
              }
            }
          } catch {
            // 草稿損毀就忽略
          }
        }
        setForm(serverForm);
        setCustomProgress(restoredCustom);
        draftReadyRef.current = true;
      })
      .catch((e) => setError((e as Error).message || "讀取回報表單失敗，請稍後再試"))
      .finally(() => setLoading(false));
  }, [params.id]);

  function toggleSkill(skill: string) {
    if (!form.skillFocus.includes(skill) && form.skillFocus.length >= 4) {
      setError("本堂學習目標最多選擇 4 項");
      return;
    }
    setError("");
    setForm((f) => ({
      ...f,
      skillFocus: f.skillFocus.includes(skill) ? f.skillFocus.filter((item) => item !== skill) : [...f.skillFocus, skill],
    }));
  }

  async function uploadPhoto(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || photoUploading) return;

    setPhotoError("");
    setPhotoUploading(true);
    try {
      let current = photos;
      for (const file of files) {
        if (current.length >= PHOTO_LIMIT) {
          setPhotoError(`每堂課最多 ${PHOTO_LIMIT} 張照片，多餘的照片未上傳`);
          break;
        }
        let compressed: File;
        try {
          compressed = await compressReportPhoto(file);
        } catch (err) {
          // iPhone HEIC 在部分瀏覽器無法讀取，給明確指引
          if (isHeicLike(file)) {
            throw new Error("這張是 iPhone HEIC 格式，此瀏覽器無法處理。請到「設定 → 相機 → 格式」改為「最相容」，或改傳截圖。");
          }
          throw err;
        }
        if (compressed.size > 900 * 1024) {
          throw new Error("圖片壓縮後仍太大，請換一張照片再試");
        }

        const body = new FormData();
        body.append("photo", compressed);
        const res = await fetch(`/api/report/${params.id}/photo`, { method: "POST", body });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "照片上傳失敗，請稍後再試");
        current = Array.isArray(data.photoUrls) ? data.photoUrls : [...current, data.url];
        setPhotos(current);
      }
    } catch (err) {
      setPhotoError((err as Error).message || "照片上傳失敗，請稍後再試");
    } finally {
      setPhotoUploading(false);
    }
  }

  async function removePhoto(url: string) {
    setPhotoError("");
    try {
      const res = await fetch(`/api/report/${params.id}/photo`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "照片移除失敗，請稍後再試");
      setPhotos(Array.isArray(data.photoUrls) ? data.photoUrls : photos.filter((item) => item !== url));
    } catch (err) {
      setPhotoError((err as Error).message || "照片移除失敗，請稍後再試");
    }
  }

  async function submit() {
    if (saving) return;
    const kindergarten = info?.reportMode === "kindergarten";
    const needsStudentCount = requiresStudentCount(info?.category);
    if (needsStudentCount && !form.studentCount) {
      setError("請填寫今日出席人數");
      return;
    }
    if (!form.progress.trim()) {
      setError(kindergarten ? "請選擇或填寫今日課程進度" : "請填寫今天訓練什麼");
      return;
    }
    if (kindergarten && (form.skillFocus.length < 3 || form.skillFocus.length > 4)) {
      setError("請選擇 3～4 個本堂學習目標");
      return;
    }
    // 特殊事件必填：這是事件紀錄，不可留空送出
    if (form.incident) {
      if (!form.incidentChild.trim()) { setError("特殊事件請填寫孩子姓名"); return; }
      if (!form.incidentProcess.trim()) { setError("特殊事件請填寫發生經過"); return; }
      if (!form.incidentAction.trim()) { setError("特殊事件請填寫處理方式"); return; }
    }
    if (info?.schoolSignatureRequired && !form.schoolVerifierName.trim()) {
      setError("請填寫園所確認老師姓名");
      return;
    }
    if (info?.schoolSignatureRequired && !form.schoolSignatureData) {
      setError("請由園所老師完成手寫簽名");
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
          studentCount: form.studentCount === "" ? null : Number(form.studentCount),
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
      try { localStorage.removeItem(draftKey); } catch { /* 忽略 */ }
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
  const needsStudentCount = requiresStudentCount(info.category);
  const locked = Boolean(info.reportLocked);
  const photoLocked = Boolean(info.reportPhotoLocked);
  const showAssessmentEntry = Boolean(assessmentUrl && info.shouldAskAssessment);

  // 缺項提示：常駐顯示還缺什麼，不用按送出才發現
  const missingItems = [
    needsStudentCount && !form.studentCount ? "出席人數" : "",
    !form.progress.trim() ? (isKindergarten ? "課程進度" : "訓練內容") : "",
    isKindergarten && form.skillFocus.length < 3 ? `學習目標（已選 ${form.skillFocus.length}／需 3～4 項）` : "",
    form.incident && (!form.incidentChild.trim() || !form.incidentProcess.trim() || !form.incidentAction.trim()) ? "特殊事件內容" : "",
    info.schoolSignatureRequired && !form.schoolVerifierName.trim() ? "園所老師姓名" : "",
    info.schoolSignatureRequired && !form.schoolSignatureData ? "園所簽名" : "",
  ].filter(Boolean);

  // 48 小時補填期限倒數
  const remainMs = info.reportExpiresAt && !locked && !done ? new Date(info.reportExpiresAt).getTime() - Date.now() : null;
  const remainLabel = remainMs != null && remainMs > 0
    ? remainMs >= 3600000
      ? `${Math.floor(remainMs / 3600000)} 小時 ${Math.floor((remainMs % 3600000) / 60000)} 分`
      : `${Math.max(1, Math.floor(remainMs / 60000))} 分鐘`
    : null;

  function adjustStudentCount(delta: number) {
    if (locked) return;
    const current = Number(form.studentCount);
    const base = Number.isFinite(current) && form.studentCount !== "" ? current : 0;
    setForm({ ...form, studentCount: String(Math.max(0, base + delta)) });
  }

  return (
    <div className="mx-auto max-w-md pb-10">
      <div className="mb-4 rounded-b-[28px] bg-gradient-to-br from-[#F5EBDD] via-[#F9F6EF] to-[#DCE8DD] px-5 pb-6 pt-5 shadow-sm">
        <div className="text-xs font-semibold tracking-[0.2em] text-[#7B9E87]">WAYSLEADER AI LEARNING REPORT</div>
        <h1 className="mt-2 text-2xl font-bold text-[#2E2B27]">課程回報</h1>
        <div className="mt-4 rounded-2xl bg-white/75 p-4 text-sm text-slate-700 shadow-sm">
          <div className="font-semibold text-slate-900">{info.school}</div>
          <div className="mt-1">{info.date}｜{info.courseName}</div>
          <div className="mt-1 text-xs text-slate-500">類型：{info.department || "未分類"}｜老師：{info.teacherName}{info.className ? `｜班級：${info.className}` : ""}</div>
        </div>
      </div>

      {done && (
        <div className="mb-4 rounded-2xl border border-green-100 bg-green-50 p-4 text-sm text-green-700">
          <div className="font-semibold">已送出回報，教學紀錄已整理完成。</div>
          {notifyStatus && (
            <div className={`mt-2 rounded-xl px-3 py-2 text-xs ${notifyStatus === "通知成功" ? "bg-white text-green-700" : "bg-white text-amber-700"}`}>
              園所通知狀態：{notifyStatus}
              {notifyError ? <div className="mt-1 text-slate-500">{notifyError}</div> : null}
            </div>
          )}
        </div>
      )}
      {showAssessmentEntry && (
        <div className="mb-4 rounded-2xl border border-[#C9DCCB] bg-[#F6FBF5] p-4 text-sm text-slate-700">
          <div className="font-semibold text-[#3F6B55]">這是幼兒園最後一堂課</div>
          <p className="mt-1 text-xs text-slate-500">
            {done ? "課程回報已完成，可接著填寫學期末運動評量。" : "若老師忘記填評量，可直接從這裡進入補填。"}
          </p>
          {info.assessmentCount ? <div className="mt-2 text-xs font-semibold text-slate-500">目前已完成 {info.assessmentCount} 位評量</div> : null}
          <a href={assessmentUrl} className="mt-3 block rounded-xl bg-[#3F6B55] px-4 py-3 text-center text-sm font-bold text-white">
            進入學期末運動評量
          </a>
        </div>
      )}
      {draftRestored && !done && (
        <div className="mb-4 rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-700">
          已帶回您上次未送出的填寫內容，可直接繼續。
        </div>
      )}
      {remainLabel && (
        <div className="mb-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
          ⏰ 回報期限剩 {remainLabel}，逾時將無法補填
        </div>
      )}
      {error && <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">{error}</div>}
      {locked && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-600">
          {info.reportNotStarted
            ? `課程尚未結束，請於下課後再回報${info.courseEndsAt ? `（${new Date(info.courseEndsAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 後）` : ""}。`
            : "此回報已超過 48 小時補填期限，目前僅供查看。如需修改請聯繫客服。"}
        </div>
      )}

      <div className="space-y-4">
        {isKindergarten && <StartConfirmationCard reportId={params.id} attendanceId={info.id} />}
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <label className="text-sm font-semibold text-slate-800">出席人數{needsStudentCount ? "" : "（免填）"}</label>
          {needsStudentCount ? (
            <div className="mt-2 flex items-stretch gap-2">
              <button type="button" disabled={locked} onClick={() => adjustStudentCount(-1)}
                className="w-14 rounded-xl border border-slate-200 text-2xl font-bold text-slate-500 active:bg-slate-100 disabled:opacity-40">−</button>
              <input inputMode="numeric" type="number" value={form.studentCount} disabled={locked}
                onChange={(e) => setForm({ ...form, studentCount: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-lg font-semibold outline-none focus:border-[#7B9E87]"
                placeholder="人數" />
              <button type="button" disabled={locked} onClick={() => adjustStudentCount(1)}
                className="w-14 rounded-xl border border-slate-200 text-2xl font-bold text-slate-500 active:bg-slate-100 disabled:opacity-40">＋</button>
            </div>
          ) : (
            <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
              課內課固定班級，免填每堂出席人數
            </div>
          )}
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
                    if (locked) return;
                    setCustomProgress(false);
                    setForm({
                      ...form,
                      progress: item.value,
                      outcomeText: item.outcomeText || form.outcomeText,
                    });
                  }}
                  className={`rounded-2xl border px-4 py-3 text-left transition-colors ${!customProgress && form.progress === item.value ? "border-[#7B9E87] bg-[#E7F0E9] text-[#2F5D49]" : "border-slate-200 bg-white text-slate-700"}`}>
                  <div className="text-xs font-semibold text-[#7B9E87]">第 {item.lesson} 堂</div>
                  <div className="mt-1 text-sm font-semibold leading-5">{item.title}</div>
                </button>
              ))}
              <button type="button" disabled={locked} onClick={() => {
                setCustomProgress(true);
                setForm({ ...form, progress: "" });
              }}
                className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold ${customProgress ? "border-[#C8956C] bg-[#FFF6ED] text-[#8A552D]" : "border-slate-200 bg-white text-slate-600"}`}>
                自訂輸入
              </button>
            </div>
          )}
          {(!isKindergarten || customProgress || !info.progressOptions?.length) && (
            <textarea value={form.progress} disabled={locked} onChange={(e) => setForm({ ...form, progress: e.target.value })}
              className="mt-3 min-h-20 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#7B9E87]"
              placeholder={isKindergarten ? "例：第 6 堂 側拉球，或自行填寫今日進度" : "例：傳接球、體能循環、分組對抗"} />
          )}
        </section>

        {isKindergarten && (
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">本堂學習目標</div>
                <div className="mt-1 text-xs text-slate-500">請勾選本堂達成的 3～4 項能力</div>
              </div>
              <div className="rounded-full bg-[#FFF4E6] px-3 py-1 text-xs font-bold text-[#A5672C]">{form.skillFocus.length} / 4</div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {SKILL_FOCUS_OPTIONS.map((skill, index) => (
                <button key={skill} type="button" disabled={locked} onClick={() => toggleSkill(skill)}
                  className={`flex aspect-square flex-col items-center justify-center rounded-full border p-2 text-center text-xs font-bold leading-4 transition-all ${form.skillFocus.includes(skill) ? "scale-[1.03] border-transparent text-[#2E2B27] shadow-md" : "border-slate-200 bg-white text-slate-500"}`}
                  style={form.skillFocus.includes(skill) ? { backgroundColor: ["#FFE3E3", "#FFF0C7", "#DDF5E7", "#DCEEFF", "#F2E2FF", "#FFE7CF"][index] } : undefined}>
                  <span className="mb-1 text-lg">{["◎", "✦", "●", "↯", "♥", "◉"][index]}</span>
                  {skill}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <label className="text-sm font-semibold text-slate-800">成果回報短文</label>
          <p className="mt-1 text-xs text-slate-500">簡短 2～3 行即可，系統不會自動生成文案。</p>
          <textarea value={form.outcomeText} disabled={locked} onChange={(e) => setForm({ ...form, outcomeText: e.target.value })}
            className="mt-3 min-h-24 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm leading-6 outline-none focus:border-[#7B9E87]"
            placeholder="例：孩子今天能跟著老師完成挑戰，練習控制方向與力道。課堂中大家參與穩定，也願意嘗試不同任務。" />
          {!locked && (
            <div className="mt-2">
              <div className="text-xs font-semibold text-slate-400">常用句型（點選帶入後可再修改）</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {OUTCOME_TEMPLATES.map((text) => (
                  <button key={text} type="button" onClick={() => setForm({ ...form, outcomeText: text })}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs leading-5 text-slate-600 active:bg-slate-100">
                    {text.slice(0, 16)}…
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-800">課堂活動照片（選填）</div>
          <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-700">
            ⚠️ 點名表請傳到 LINE 官方帳號，這裡只上傳課堂活動照片。
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            每堂課最多 {PHOTO_LIMIT} 張，系統會先壓縮再上傳到雲端圖片空間，不會存進 GitHub 或 Vercel 部署檔。
          </p>
          {photos.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {photos.map((url) => (
                <div key={url} className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
                  <img src={url} alt="課堂活動照片" className="h-32 w-full object-cover" />
                  {!photoLocked && (
                    <button type="button" onClick={() => void removePhoto(url)} className="w-full bg-white px-2 py-2 text-xs font-semibold text-red-500">
                      移除
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {photos.length < PHOTO_LIMIT && (
            <label className={`mt-3 flex min-h-14 cursor-pointer items-center justify-center rounded-2xl border border-dashed px-4 py-3 text-sm font-bold transition-colors ${photoUploading || photoLocked ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400" : "border-[#9CB8A6] bg-[#F8FBF8] text-[#3F6B55]"}`}>
              {photoLocked ? "已超過補填期限" : photoUploading ? "照片上傳中..." : `選擇或拍攝活動照片（${photos.length}／${PHOTO_LIMIT}）`}
              <input type="file" accept="image/*" multiple className="hidden" disabled={photoUploading || photoLocked} onChange={uploadPhoto} />
            </label>
          )}
          {photoError && (
            <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
              {photoError}
            </div>
          )}
          <details className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-slate-500">已有公開圖片連結？</summary>
            <input
              type="url"
              inputMode="url"
              value={form.representativePhotoUrl}
              disabled={locked}
              onChange={(e) => setForm({ ...form, representativePhotoUrl: e.target.value })}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#7B9E87]"
              placeholder="https://...（送出時會一併加入照片）"
            />
          </details>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-800">今天是否有特殊事件？</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[false, true].map((value) => (
              <button key={String(value)} type="button" disabled={locked} onClick={() => setForm({ ...form, incident: value })}
                className={`rounded-xl border px-4 py-3 text-sm font-medium ${form.incident === value ? "border-[#7B9E87] bg-[#E7F0E9] text-[#3F6B55]" : "border-slate-200 text-slate-600"}`}>
                {value ? "有" : "無"}
              </button>
            ))}
          </div>
          {form.incident && (
            <div className="mt-4 space-y-3">
              <input value={form.incidentChild} disabled={locked} onChange={(e) => setForm({ ...form, incidentChild: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" placeholder="孩子姓名" />
              <textarea value={form.incidentProcess} disabled={locked} onChange={(e) => setForm({ ...form, incidentProcess: e.target.value })} className="min-h-20 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" placeholder="發生經過" />
              <textarea value={form.incidentAction} disabled={locked} onChange={(e) => setForm({ ...form, incidentAction: e.target.value })} className="min-h-20 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" placeholder="處理方式" />
              <div>
                <div className="mb-2 text-xs font-medium text-slate-500">是否通知{isKindergarten ? "園所" : "現場老師或窗口"}</div>
                <div className="grid grid-cols-2 gap-2">
                  {["是", "否"].map((v) => (
                    <button key={v} type="button" disabled={locked} onClick={() => setForm({ ...form, incidentNotified: v })}
                      className={`rounded-xl border px-4 py-3 text-sm font-medium ${form.incidentNotified === v ? "border-[#7B9E87] bg-[#E7F0E9] text-[#3F6B55]" : "border-slate-200 text-slate-600"}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {info.schoolSignatureRequired && (
          <section className="rounded-2xl border border-[#C9DCCB] bg-[#F6FBF5] p-4 shadow-sm">
            <div className="text-sm font-bold text-[#3F6B55]">園所老師確認簽名</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">請由現場園所老師確認以上出席與回報內容，並在同一支手機完成簽名。</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
              <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-[#C9DCCB]">日期：{new Date().toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}</div>
              <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-[#C9DCCB]">實際上課人數：{form.studentCount || "請於上方填寫"}</div>
            </div>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              園所確認老師姓名（請以正楷簽署本名）
              <input value={form.schoolVerifierName} disabled={locked} onChange={(e) => setForm({ ...form, schoolVerifierName: e.target.value })}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:border-[#7B9E87]" placeholder="請輸入本名（正楷）" />
            </label>
            <div className="mt-4 text-sm font-semibold text-slate-700">手寫簽名（請以正楷簽署本名）</div>
            <SignaturePad value={form.schoolSignatureData} disabled={locked} onChange={(schoolSignatureData) => setForm((current) => ({ ...current, schoolSignatureData }))} />
            {info.schoolSignedAt && <div className="mt-3 text-xs text-slate-500">確認時間：{new Date(info.schoolSignedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</div>}
          </section>
        )}

        {!locked && !done && missingItems.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold leading-5 text-slate-500">
            尚未完成：{missingItems.join("、")}
          </div>
        )}
        {!locked && (
          <button onClick={submit} disabled={saving}
            className="sticky bottom-4 w-full rounded-2xl bg-[#3F6B55] px-5 py-4 text-base font-bold text-white shadow-lg shadow-green-900/15 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? "送出中..." : "送出課程回報"}
          </button>
        )}
      </div>
    </div>
  );
}
