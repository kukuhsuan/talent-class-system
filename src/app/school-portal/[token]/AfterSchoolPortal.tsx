"use client";
// 安親班園所端（運動班長品牌）：只保留 成果／申請異動／評分 三個分頁
// 設計原則：專業穩重、少圓角漸層、Lucide 風格線條 icon、375px 行動優先
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { courseLabel } from "@/lib/courseMeta";

/* ---------- 型別 ---------- */
export type PortalSummary = {
  school: { id: number; name: string; type: string };
  isAfterSchool: boolean;
  pendingRatings: number;
  processingChanges: number;
  verified: boolean;
};

type ReportItem = {
  id: number; date: string; courseName: string; teacherName: string; time: string;
  studentCount: number; reportContent: string; skillFocus: string; classStatus: string;
  incident: boolean; incidentNote: string; aiSummary: string; aiTeachingNote: string; photoUrls: string[];
};
type ReportsResponse = {
  year: number; month: number; total: number; lessonCount: number; reportedCount: number;
  courseOptions: string[]; items: ReportItem[]; hasMore: boolean;
};

type RatingPending = { attendanceId: number; date: string; courseName: string; teacherName: string; status: string; ratingUrl: string };
type RatingDone = { attendanceId: number; date: string; courseName: string; teacherName: string; scoreOverall: number; submittedAt: string | null };
type RatingsResponse = { pending: RatingPending[]; completed: RatingDone[] };

type ChangeOption = {
  id: number; courseId: number; date: string; time: string; schoolId: number | null; school: string;
  address: string; location: string; courseType: string; teacherId: number; teacherName: string;
};
type ChangeRequest = {
  id: number; changeScope: string; changeTypes: string[]; originalDate: string; newDate: string | null;
  originalStartTime: string; originalEndTime: string; newStartTime: string; newEndTime: string;
  newSchoolName: string; newLocation: string; reasonType: string; reasonNote: string; status: string;
  reviewNote: string; createdAt: string; course: { courseType: string }; teacher: { name: string };
  targets: Array<{ attendanceId: number; originalDate: string }>;
};
type ChangesResponse = { options: ChangeOption[]; requests: ChangeRequest[]; schools: Array<{ id: number; name: string; region: string; address: string }> };

type Tab = "outcomes" | "changes" | "ratings";

/* ---------- 5 分鐘前端快取 ---------- */
const CACHE_TTL = 5 * 60 * 1000;
const portalCache = new Map<string, { at: number; data: unknown }>();
function cacheGet<T>(key: string): T | null {
  const hit = portalCache.get(key);
  if (!hit || Date.now() - hit.at > CACHE_TTL) return null;
  return hit.data as T;
}
function cacheSet(key: string, data: unknown) { portalCache.set(key, { at: Date.now(), data }); }
function cacheClear(prefix: string) { for (const key of [...portalCache.keys()]) if (key.startsWith(prefix)) portalCache.delete(key); }

/* ---------- Lucide 風格線條 icon ---------- */
function Icon({ name, className }: { name: "book" | "calendar" | "star" | "check" | "alert" | "copy" | "image" | "chevron"; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    book: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="M12 14v4M14 16h-4" /></>,
    star: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />,
    check: <path d="M20 6 9 17l-5-5" />,
    alert: <><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></>,
    chevron: <path d="m6 9 6 6 6-6" />,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className ?? "h-5 w-5"} aria-hidden>
      {paths[name]}
    </svg>
  );
}

/* ---------- 共用小元件 ---------- */
function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-[14px] border border-[#E2E8F0] bg-white p-4">
      <div className="h-4 w-2/3 rounded bg-[#E2E8F0]" />
      <div className="mt-3 h-3 w-1/2 rounded bg-[#EDF1F5]" />
      <div className="mt-3 h-20 rounded bg-[#F5F7FA]" />
    </div>
  );
}
function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-[14px] border border-[#E2E8F0] bg-white p-6 text-center">
      <p className="text-sm text-[#C24141]">{message || "資料載入失敗，請稍後再試。"}</p>
      <button onClick={onRetry} className="mt-3 rounded-[10px] bg-[#1F3A6D] px-5 py-2.5 text-sm font-bold text-white">重新載入</button>
    </div>
  );
}
function EmptyBox({ text }: { text: string }) {
  return <div className="rounded-[14px] border border-dashed border-[#E2E8F0] bg-white p-8 text-center text-sm text-[#64748B]">{text}</div>;
}

/* ---------- 園所驗證碼 Modal ---------- */
function VerifyModal({ token, onClose, onVerified }: { token: string; onClose: () => void; onVerified: () => void }) {
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!/^\d{6}$/.test(code)) { setError("請輸入 6 位數驗證碼"); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/school-portal/${encodeURIComponent(token)}/verify`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, remember }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "驗證失敗，請稍後再試");
      onVerified();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal>
      <div className="w-full max-w-sm rounded-[16px] bg-white p-5 shadow-xl">
        <h3 className="text-[17px] font-bold text-[#1F2937]">園所身分驗證</h3>
        <p className="mt-2 text-sm leading-6 text-[#64748B]">為確認是園所人員操作，請輸入 6 位數園所驗證碼。驗證成功後，這台裝置 30 天內不需再次輸入。</p>
        <input
          inputMode="numeric" pattern="\d*" maxLength={6} value={code} autoFocus
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="6 位數驗證碼"
          className="mt-4 w-full rounded-[10px] border border-[#E2E8F0] px-4 py-3 text-center text-xl tracking-[0.4em] text-[#1F2937] outline-none focus:border-[#315E9F]"
        />
        <label className="mt-3 flex items-center gap-2 text-sm text-[#1F2937]">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4" />
          記住這台裝置 30 天
        </label>
        {error && <p className="mt-2 text-sm text-[#C24141]">{error}</p>}
        <button disabled={busy || code.length !== 6} onClick={submit} className="mt-4 w-full rounded-[10px] bg-[#1F3A6D] py-3 text-sm font-bold text-white disabled:opacity-40">
          {busy ? "驗證中…" : "確認並繼續"}
        </button>
        <button onClick={onClose} className="mt-2 w-full rounded-[10px] py-2.5 text-sm text-[#64748B]">取消</button>
        <p className="mt-3 text-center text-xs text-[#64748B]">忘記驗證碼？請聯繫運動班長客服重新取得。</p>
      </div>
    </div>
  );
}

/* ---------- 學習成果分享圖（Canvas，不用 Vercel Function） ---------- */
function loadImg(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const chars = [...text.replace(/\s+/g, " ").trim()];
  let line = ""; let lines = 0;
  for (const ch of chars) {
    if (ctx.measureText(line + ch).width > maxWidth) {
      ctx.fillText(lines === maxLines - 1 ? line.slice(0, -1) + "…" : line, x, y + lines * lineHeight);
      lines += 1; line = ch;
      if (lines >= maxLines) return y + lines * lineHeight;
    } else line += ch;
  }
  if (line) { ctx.fillText(line, x, y + lines * lineHeight); lines += 1; }
  return y + lines * lineHeight;
}
async function generateShareImage(item: ReportItem, schoolName: string) {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#F5F7FA"; ctx.fillRect(0, 0, W, H);
  // 頁首品牌帶
  ctx.fillStyle = "#1F3A6D"; ctx.fillRect(0, 0, W, 150);
  const logo = await loadImg("/sports-leader-logo.png");
  if (logo) {
    ctx.save();
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath(); ctx.arc(96, 75, 48, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(96, 75, 44, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(logo, 52, 31, 88, 88);
    ctx.restore();
  }
  ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 44px 'Noto Sans TC', sans-serif";
  ctx.fillText("運動班長", 168, 70);
  ctx.font = "28px 'Noto Sans TC', sans-serif"; ctx.fillStyle = "#C9D6EA";
  ctx.fillText("安親班課程服務平台", 168, 112);
  // 課程資訊卡
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath(); ctx.roundRect(48, 190, W - 96, 190, 16); ctx.fill();
  ctx.fillStyle = "#1F2937"; ctx.font = "bold 42px 'Noto Sans TC', sans-serif";
  ctx.fillText(`${item.date.replaceAll("-", "/")}｜${item.courseName}`, 84, 262);
  ctx.fillStyle = "#64748B"; ctx.font = "30px 'Noto Sans TC', sans-serif";
  ctx.fillText(`${schoolName}｜${item.teacherName} 老師｜${item.studentCount} 位孩子`, 84, 320);
  ctx.fillStyle = "#D99032"; ctx.font = "bold 28px 'Noto Sans TC', sans-serif";
  if (item.skillFocus.trim()) ctx.fillText(`能力培養：${item.skillFocus.trim().slice(0, 18)}`, 84, 362);
  // 照片（4:3）
  let photoBottom = 420;
  const photo = item.photoUrls[0] ? await loadImg(item.photoUrls[0]) : null;
  if (photo) {
    const pw = W - 96, ph = Math.round(pw * 3 / 4);
    const scale = Math.max(pw / photo.width, ph / photo.height);
    const sw = pw / scale, sh = ph / scale;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(48, 420, pw, ph, 16); ctx.clip();
    ctx.drawImage(photo, (photo.width - sw) / 2, (photo.height - sh) / 2, sw, sh, 48, 420, pw, ph);
    ctx.restore();
    photoBottom = 420 + ph + 40;
  }
  // 老師回報文字
  const summary = (item.aiSummary || item.reportContent).trim();
  if (summary) {
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath(); ctx.roundRect(48, photoBottom, W - 96, H - photoBottom - 120, 16); ctx.fill();
    ctx.fillStyle = "#1F3A6D"; ctx.font = "bold 32px 'Noto Sans TC', sans-serif";
    ctx.fillText("課程成果", 84, photoBottom + 64);
    ctx.fillStyle = "#1F2937"; ctx.font = "30px 'Noto Sans TC', sans-serif";
    const maxLines = Math.max(1, Math.floor((H - photoBottom - 240) / 48));
    wrapText(ctx, summary, 84, photoBottom + 120, W - 168, 48, maxLines);
  }
  // 頁尾
  ctx.fillStyle = "#64748B"; ctx.font = "24px 'Noto Sans TC', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("運動班長｜系統技術支援：WaysLeader AI", W / 2, H - 48);
  ctx.textAlign = "left";
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `運動班長成果_${item.date}_${item.courseName}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, "image/png");
}
function buildParentText(item: ReportItem, schoolName: string) {
  const lines = [
    `【${schoolName}｜課程成果分享】`,
    `📅 ${item.date.replaceAll("-", "/")}（${item.courseName}）`,
    `👩‍🏫 授課老師：${item.teacherName}`,
  ];
  const summary = (item.aiSummary || item.reportContent).trim();
  if (summary) lines.push("", summary);
  if (item.skillFocus.trim()) lines.push("", `本堂課培養能力：${item.skillFocus.trim()}`);
  lines.push("", "— 運動班長 安親班課程服務平台");
  return lines.join("\n");
}

/* ---------- 成果分頁 ---------- */
function OutcomeCard({ item, schoolName }: { item: ReportItem; schoolName: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [making, setMaking] = useState(false);
  const summary = (item.aiSummary || item.reportContent).trim();
  const long = summary.length > 80;

  async function copyText() {
    try {
      await navigator.clipboard.writeText(buildParentText(item, schoolName));
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { window.prompt("請長按複製以下文字", buildParentText(item, schoolName)); }
  }

  return (
    <article className="overflow-hidden rounded-[14px] border border-[#E2E8F0] bg-white">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[16px] font-bold text-[#1F2937]">{item.date.replaceAll("-", "/")}｜{item.courseName}</h3>
          {item.incident && <span className="shrink-0 rounded-full bg-[#FBF3E8] px-2.5 py-1 text-xs font-bold text-[#D99032]">特殊狀況</span>}
        </div>
        <p className="mt-1 text-[13px] text-[#64748B]">{item.teacherName} 老師｜{item.time}｜{item.studentCount} 位孩子</p>
        {item.skillFocus.trim() && <p className="mt-2 text-[14px] font-bold text-[#315E9F]">能力培養：{item.skillFocus.trim()}</p>}
      </div>
      {item.photoUrls.length > 0 && (
        <div className={expanded ? "grid grid-cols-2 gap-1 px-4" : "px-4"}>
          {(expanded ? item.photoUrls : item.photoUrls.slice(0, 1)).map((url, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={index} src={url} alt="課堂照片" loading="lazy" className="aspect-[4/3] w-full rounded-[10px] object-cover" />
          ))}
          {!expanded && item.photoUrls.length > 1 && <p className="mt-1 text-right text-xs text-[#64748B]">共 {item.photoUrls.length} 張照片</p>}
        </div>
      )}
      {summary && (
        <div className="mx-4 mt-3 rounded-[10px] bg-[#F5F7FA] p-3">
          <p className="whitespace-pre-wrap text-[14px] leading-6 text-[#1F2937]">{expanded || !long ? summary : summary.slice(0, 80) + "…"}</p>
          {item.aiTeachingNote.trim() && expanded && <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-[#64748B]">{item.aiTeachingNote.trim()}</p>}
        </div>
      )}
      {item.incidentNote && <p className="mx-4 mt-2 rounded-[10px] bg-[#FBF3E8] px-3 py-2 text-[13px] text-[#8A5A17]">{item.incidentNote}</p>}
      {(long || item.photoUrls.length > 1 || item.aiTeachingNote.trim()) && (
        <button onClick={() => setExpanded(!expanded)} className="mx-4 mt-2 flex items-center gap-1 text-[13px] font-bold text-[#315E9F]">
          {expanded ? "收合" : "查看完整成果"}
          <Icon name="chevron" className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#E2E8F0] p-3">
        <button onClick={copyText} className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-[10px] border border-[#E2E8F0] text-[14px] font-bold text-[#1F3A6D]">
          <Icon name={copied ? "check" : "copy"} className="h-4 w-4" />{copied ? "已複製" : "複製給家長"}
        </button>
        <button
          onClick={async () => { setMaking(true); try { await generateShareImage(item, schoolName); } finally { setMaking(false); } }}
          disabled={making}
          className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-[10px] bg-[#1F3A6D] text-[14px] font-bold text-white disabled:opacity-50"
        >
          <Icon name="image" className="h-4 w-4" />{making ? "產生中…" : "產生成果圖片"}
        </button>
      </div>
    </article>
  );
}

function OutcomesTab({ token, schoolName, year, month }: { token: string; schoolName: string; year: number; month: number }) {
  const [data, setData] = useState<ReportsResponse | null>(null);
  const [items, setItems] = useState<ReportItem[]>([]);
  const [course, setCourse] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (offset: number) => {
    const key = `${token}:reports:${year}-${month}:${course}:${offset}`;
    const cached = offset === 0 ? cacheGet<ReportsResponse>(key) : null;
    if (cached) { setData(cached); setItems(cached.items); setLoading(false); setError(""); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (offset === 0) setLoading(true); else setLoadingMore(true);
    setError("");
    try {
      const query = new URLSearchParams({ year: String(year), month: String(month), offset: String(offset), limit: "10" });
      if (course) query.set("course", course);
      const res = await fetch(`/api/school-portal/${encodeURIComponent(token)}/reports?${query}`, { signal: controller.signal });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "載入失敗");
      const response = body as ReportsResponse;
      setData(response);
      setItems((current) => offset === 0 ? response.items : [...current, ...response.items]);
      if (offset === 0) cacheSet(key, response);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
    } finally { setLoading(false); setLoadingMore(false); }
  }, [token, year, month, course]);

  useEffect(() => { load(0); return () => abortRef.current?.abort(); }, [load]);

  if (loading) return <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>;
  if (error) return <ErrorBox message={error} onRetry={() => load(0)} />;
  if (!data) return null;

  return (
    <div className="space-y-3">
      <div className="rounded-[14px] border border-[#E2E8F0] bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[15px] font-bold text-[#1F2937]">{month} 月課程成果</p>
          <p className="text-[13px] text-[#64748B]">已完成 <span className="font-bold text-[#1F3A6D]">{data.reportedCount}</span>/{data.lessonCount} 堂</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#EDF1F5]">
          <div className="h-full rounded-full bg-[#315E9F] transition-all" style={{ width: `${data.lessonCount ? Math.round((data.reportedCount / data.lessonCount) * 100) : 0}%` }} />
        </div>
        {data.courseOptions.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {["", ...data.courseOptions].map((option) => (
              <button key={option || "all"} onClick={() => setCourse(option)}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold ${course === option ? "bg-[#1F3A6D] text-white" : "border border-[#E2E8F0] text-[#64748B]"}`}>
                {option || "全部課程"}
              </button>
            ))}
          </div>
        )}
      </div>
      {items.length === 0 && <EmptyBox text="本月尚無課程成果，老師完成課後回報後會顯示在這裡。" />}
      {items.map((item) => <OutcomeCard key={item.id} item={item} schoolName={schoolName} />)}
      {data.hasMore && items.length > 0 && (
        <button onClick={() => load(items.length)} disabled={loadingMore} className="w-full rounded-[10px] border border-[#E2E8F0] bg-white py-3 text-[14px] font-bold text-[#1F3A6D] disabled:opacity-50">
          {loadingMore ? "載入中…" : `載入更多（還有 ${data.total - items.length} 筆）`}
        </button>
      )}
    </div>
  );
}

/* ---------- 申請異動分頁（3 步驟） ---------- */
const TYPE_LABELS: Record<string, string> = { DATE: "日期", TIME: "時間", LOCATION: "地點", STUDENT_COUNT: "人數", CANCEL: "停課" };
const STATUS_STEPS = ["已送出", "行政確認中", "等待老師回覆", "老師已同意", "異動已完成"];
function statusStep(status: string): { step: number; label: string; tone: "gray" | "amber" | "green" | "red" } {
  switch (status) {
    case "待行政審核": return { step: 1, label: "行政確認中", tone: "amber" };
    case "待老師回覆": return { step: 2, label: "等待老師回覆", tone: "amber" };
    case "需要討論": return { step: 2, label: "行政與老師確認中", tone: "amber" };
    case "老師可配合": return { step: 3, label: "老師已同意", tone: "green" };
    case "已完成": return { step: 4, label: "異動已完成", tone: "green" };
    case "老師無法配合": return { step: 2, label: "老師無法配合，行政協助安排中", tone: "red" };
    case "草稿": return { step: 0, label: "退回補充", tone: "red" };
    case "已取消": return { step: 0, label: "已取消", tone: "gray" };
    default: return { step: 0, label: status, tone: "gray" };
  }
}

function RequestCard({ request }: { request: ChangeRequest }) {
  const { step, label, tone } = statusStep(request.status);
  const toneClass = { gray: "bg-[#F5F7FA] text-[#64748B]", amber: "bg-[#FBF3E8] text-[#8A5A17]", green: "bg-[#E9F5EE] text-[#2F855A]", red: "bg-[#FAECEC] text-[#C24141]" }[tone];
  const active = request.status !== "已取消" && request.status !== "草稿" && tone !== "red";
  return (
    <div className="rounded-[14px] border border-[#E2E8F0] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-[15px] font-bold text-[#1F2937]">{request.originalDate.slice(0, 10).replaceAll("-", "/")}｜{courseLabel(request.course.courseType)}</p>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${toneClass}`}>{label}</span>
      </div>
      <p className="mt-1 text-[13px] text-[#64748B]">
        申請編號 #{request.id}｜{request.changeTypes.map((t) => TYPE_LABELS[t] ?? t).join("、")}｜{request.teacher.name} 老師
      </p>
      {active && (
        <div className="mt-3 flex items-center">
          {STATUS_STEPS.map((stepLabel, index) => (
            <div key={stepLabel} className="flex flex-1 items-center last:flex-none">
              <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${index <= step ? "bg-[#2F855A]" : "bg-[#E2E8F0]"}`} title={stepLabel} />
              {index < STATUS_STEPS.length - 1 && <div className={`h-0.5 flex-1 ${index < step ? "bg-[#2F855A]" : "bg-[#E2E8F0]"}`} />}
            </div>
          ))}
        </div>
      )}
      {active && <p className="mt-1.5 text-xs text-[#64748B]">{STATUS_STEPS.filter((_, index) => index <= step).join(" → ")}</p>}
      {request.reviewNote && <p className="mt-2 rounded-[10px] bg-[#FBF3E8] px-3 py-2 text-[13px] text-[#8A5A17]">行政回覆：{request.reviewNote}</p>}
    </div>
  );
}

function ChangesTab({ token, onNeedVerify, onSubmitted }: { token: string; onNeedVerify: (retry: () => void) => void; onSubmitted: () => void }) {
  const [data, setData] = useState<ChangesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // 精靈狀態
  const [step, setStep] = useState(0); // 0=清單 1=選課程 2=異動內容 3=確認
  const [attendanceId, setAttendanceId] = useState<number | null>(null);
  const [targetIds, setTargetIds] = useState<number[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [newDate, setNewDate] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newSchoolId, setNewSchoolId] = useState<number | null>(null);
  const [newLocation, setNewLocation] = useState("");
  const [newStudentCount, setNewStudentCount] = useState("");
  const [reasonType, setReasonType] = useState("園所活動");
  const [reasonNote, setReasonNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [successId, setSuccessId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const key = `${token}:changes`;
    const cached = cacheGet<ChangesResponse>(key);
    if (cached) { setData(cached); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/school-portal/${encodeURIComponent(token)}/changes`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "載入失敗");
      setData(body as ChangesResponse);
      cacheSet(key, body);
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const selected = data?.options.find((option) => option.id === attendanceId) ?? null;
  const sameCourse = selected ? (data?.options ?? []).filter((option) => option.courseId === selected.courseId) : [];

  function reset() {
    setStep(0); setAttendanceId(null); setTargetIds([]); setTypes([]); setNewDate(""); setNewStart(""); setNewEnd("");
    setNewSchoolId(null); setNewLocation(""); setNewStudentCount(""); setReasonType("園所活動"); setReasonNote(""); setMessage("");
  }
  function toggleType(type: string) {
    setTypes((current) => {
      if (type === "CANCEL") return current.includes("CANCEL") ? [] : ["CANCEL"];
      const next = current.includes(type) ? current.filter((item) => item !== type) : [...current.filter((item) => item !== "CANCEL"), type];
      return next;
    });
  }
  const step2Valid = types.length > 0
    && (!types.includes("DATE") || /^\d{4}-\d{2}-\d{2}$/.test(newDate))
    && (!types.includes("TIME") || (newStart && newEnd))
    && (!types.includes("LOCATION") || newSchoolId != null || newLocation.trim())
    && (!types.includes("STUDENT_COUNT") || newStudentCount !== "");

  const doSubmit = useCallback(async () => {
    if (!attendanceId || saving) return;
    setSaving(true); setMessage("");
    try {
      const school = data?.schools.find((row) => row.id === newSchoolId);
      const res = await fetch(`/api/school-portal/${encodeURIComponent(token)}/changes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendanceIds: targetIds.length > 0 ? targetIds : [attendanceId],
          changeScope: targetIds.length > 1 ? "SELECTED" : "SINGLE",
          changeTypes: types, newDate, newStartTime: newStart, newEndTime: newEnd,
          newSchoolId, newSchoolName: school?.name ?? "", newAddress: school?.address ?? "", newLocation,
          newStudentCount: newStudentCount === "" ? null : Number(newStudentCount),
          reasonType, reasonNote,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401 && body.requiresVerify) { onNeedVerify(() => { void doSubmit(); }); return; }
      if (!res.ok) throw new Error(body.error || "送出異動申請失敗");
      cacheClear(`${token}:changes`);
      setSuccessId((body as ChangeRequest).id);
      reset();
      onSubmitted();
      await load();
    } catch (err) { setMessage((err as Error).message); } finally { setSaving(false); }
  }, [attendanceId, saving, data, newSchoolId, token, targetIds, types, newDate, newStart, newEnd, newLocation, newStudentCount, reasonType, reasonNote, onNeedVerify, onSubmitted, load]);

  if (loading) return <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>;
  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return null;

  const stepHeader = (
    <div className="mb-4 flex items-center justify-center gap-1">
      {["選擇課程", "異動內容", "確認送出"].map((label, index) => (
        <div key={label} className="flex items-center">
          <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step >= index + 1 ? "bg-[#1F3A6D] text-white" : "bg-[#EDF1F5] text-[#64748B]"}`}>{index + 1}</div>
          <span className={`ml-1.5 text-[13px] font-bold ${step >= index + 1 ? "text-[#1F3A6D]" : "text-[#64748B]"}`}>{label}</span>
          {index < 2 && <div className="mx-2 h-0.5 w-4 bg-[#E2E8F0]" />}
        </div>
      ))}
    </div>
  );

  // 步驟 1：選課程＋日期
  if (step === 1) return (
    <div className="rounded-[14px] border border-[#E2E8F0] bg-white p-4">
      {stepHeader}
      <p className="text-[15px] font-bold text-[#1F2937]">選擇要異動的課程</p>
      <p className="mt-1 text-[13px] text-[#64748B]">只會列出尚未上課的課堂。</p>
      <div className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto">
        {data.options.length === 0 && <EmptyBox text="目前沒有可申請異動的未來課程。" />}
        {data.options.map((option) => (
          <button key={option.id} onClick={() => { setAttendanceId(option.id); setTargetIds([option.id]); setNewDate(option.date); setNewStart(option.time.split("-")[0] ?? ""); setNewEnd(option.time.split("-")[1] ?? ""); }}
            className={`w-full rounded-[10px] border p-3 text-left ${attendanceId === option.id ? "border-[#1F3A6D] bg-[#F0F4FA]" : "border-[#E2E8F0]"}`}>
            <p className="text-[14px] font-bold text-[#1F2937]">{option.date.replaceAll("-", "/")}｜{courseLabel(option.courseType)}</p>
            <p className="text-[12px] text-[#64748B]">{option.time}｜{option.teacherName} 老師</p>
          </button>
        ))}
      </div>
      {selected && sameCourse.length > 1 && !types.includes("DATE") && (
        <div className="mt-3 rounded-[10px] border border-[#E2E8F0] p-3">
          <p className="text-[13px] font-bold text-[#1F2937]">要一併申請的其他日期（可複選）</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {sameCourse.map((option) => (
              <label key={option.id} className={`flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[13px] ${targetIds.includes(option.id) ? "bg-[#F0F4FA] font-bold text-[#1F3A6D]" : "bg-[#F5F7FA] text-[#64748B]"}`}>
                <input type="checkbox" checked={targetIds.includes(option.id)} disabled={option.id === attendanceId}
                  onChange={() => setTargetIds((current) => current.includes(option.id) ? current.filter((id) => id !== option.id) : [...current, option.id])} />
                {option.date.slice(5).replace("-", "/")}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={reset} className="min-h-[44px] rounded-[10px] border border-[#E2E8F0] text-[14px] font-bold text-[#64748B]">取消</button>
        <button disabled={!attendanceId} onClick={() => setStep(2)} className="min-h-[44px] rounded-[10px] bg-[#1F3A6D] text-[14px] font-bold text-white disabled:opacity-40">下一步</button>
      </div>
    </div>
  );

  // 步驟 2：異動內容
  if (step === 2 && selected) return (
    <div className="rounded-[14px] border border-[#E2E8F0] bg-white p-4">
      {stepHeader}
      <div className="rounded-[10px] bg-[#F5F7FA] p-3 text-[13px] leading-6 text-[#1F2937]">
        {selected.date.replaceAll("-", "/")}｜{courseLabel(selected.courseType)}｜{selected.time}<br />{selected.teacherName} 老師{targetIds.length > 1 ? `｜共 ${targetIds.length} 堂` : ""}
      </div>
      <p className="mt-3 text-[14px] font-bold text-[#1F2937]">異動類型（可複選，停課須單獨申請）</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {Object.entries(TYPE_LABELS).map(([value, label]) => (
          <button key={value} onClick={() => toggleType(value)}
            className={`min-h-[40px] rounded-[10px] px-4 text-[14px] font-bold ${types.includes(value) ? "bg-[#1F3A6D] text-white" : "border border-[#E2E8F0] text-[#64748B]"}`}>
            {label}
          </button>
        ))}
      </div>
      {types.includes("DATE") && targetIds.length > 1 && <p className="mt-2 text-[12px] text-[#C24141]">日期異動一次只能申請一堂，請回上一步只選一個日期。</p>}
      <div className="mt-3 space-y-3">
        {types.includes("DATE") && <label className="block"><span className="mb-1 block text-[13px] font-bold text-[#1F2937]">新日期</span><input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-full rounded-[10px] border border-[#E2E8F0] px-3 py-2.5 text-[14px]" /></label>}
        {types.includes("TIME") && (
          <div className="grid grid-cols-2 gap-2">
            <label><span className="mb-1 block text-[13px] font-bold text-[#1F2937]">新開始時間</span><input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="w-full rounded-[10px] border border-[#E2E8F0] px-3 py-2.5 text-[14px]" /></label>
            <label><span className="mb-1 block text-[13px] font-bold text-[#1F2937]">新結束時間</span><input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="w-full rounded-[10px] border border-[#E2E8F0] px-3 py-2.5 text-[14px]" /></label>
          </div>
        )}
        {types.includes("LOCATION") && (
          <>
            <label className="block"><span className="mb-1 block text-[13px] font-bold text-[#1F2937]">更換校區（可留在原校區）</span>
              <select value={newSchoolId ?? ""} onChange={(e) => setNewSchoolId(e.target.value ? Number(e.target.value) : null)} className="w-full rounded-[10px] border border-[#E2E8F0] px-3 py-2.5 text-[14px]">
                <option value="">同園所（不更換校區）</option>
                {data.schools.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </label>
            <label className="block"><span className="mb-1 block text-[13px] font-bold text-[#1F2937]">新上課地點</span><input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="例如三樓禮堂" className="w-full rounded-[10px] border border-[#E2E8F0] px-3 py-2.5 text-[14px]" /></label>
          </>
        )}
        {types.includes("STUDENT_COUNT") && <label className="block"><span className="mb-1 block text-[13px] font-bold text-[#1F2937]">調整後人數</span><input type="number" min={0} value={newStudentCount} onChange={(e) => setNewStudentCount(e.target.value)} placeholder="例如 18" className="w-full rounded-[10px] border border-[#E2E8F0] px-3 py-2.5 text-[14px]" /></label>}
        <label className="block"><span className="mb-1 block text-[13px] font-bold text-[#1F2937]">異動原因</span>
          <select value={reasonType} onChange={(e) => setReasonType(e.target.value)} className="w-full rounded-[10px] border border-[#E2E8F0] px-3 py-2.5 text-[14px]">
            {["園所活動", "教室調整", "時間調整", "臨時狀況", "其他"].map((reason) => <option key={reason}>{reason}</option>)}
          </select>
        </label>
        <label className="block"><span className="mb-1 block text-[13px] font-bold text-[#1F2937]">補充說明（選填）</span><input value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} className="w-full rounded-[10px] border border-[#E2E8F0] px-3 py-2.5 text-[14px]" /></label>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={() => setStep(1)} className="min-h-[44px] rounded-[10px] border border-[#E2E8F0] text-[14px] font-bold text-[#64748B]">上一步</button>
        <button disabled={!step2Valid || (types.includes("DATE") && targetIds.length > 1)} onClick={() => setStep(3)} className="min-h-[44px] rounded-[10px] bg-[#1F3A6D] text-[14px] font-bold text-white disabled:opacity-40">下一步</button>
      </div>
    </div>
  );

  // 步驟 3：確認送出
  if (step === 3 && selected) return (
    <div className="rounded-[14px] border border-[#E2E8F0] bg-white p-4">
      {stepHeader}
      <p className="text-[15px] font-bold text-[#1F2937]">確認申請內容</p>
      <div className="mt-3 space-y-1.5 rounded-[10px] bg-[#F5F7FA] p-3 text-[14px] leading-6 text-[#1F2937]">
        <p>課程：{courseLabel(selected.courseType)}（{selected.teacherName} 老師）</p>
        <p>日期：{targetIds.length > 1 ? data.options.filter((option) => targetIds.includes(option.id)).map((option) => option.date.slice(5).replace("-", "/")).join("、") : selected.date.replaceAll("-", "/")}</p>
        <p>異動類型：{types.map((t) => TYPE_LABELS[t]).join("、")}</p>
        {types.includes("DATE") && <p>新日期：{newDate.replaceAll("-", "/")}</p>}
        {types.includes("TIME") && <p>新時間：{newStart}-{newEnd}</p>}
        {types.includes("LOCATION") && <p>新地點：{[data.schools.find((row) => row.id === newSchoolId)?.name, newLocation].filter(Boolean).join("・") || "同園所"}</p>}
        {types.includes("STUDENT_COUNT") && <p>調整後人數：{newStudentCount} 人</p>}
        <p>原因：{reasonType}{reasonNote ? `・${reasonNote}` : ""}</p>
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-[10px] bg-[#FBF3E8] p-3 text-[13px] leading-6 text-[#8A5A17]">
        <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
        送出申請不代表課表已直接修改，將由行政與老師確認後更新。
      </div>
      {message && <p className="mt-2 text-sm text-[#C24141]">{message}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={() => setStep(2)} disabled={saving} className="min-h-[44px] rounded-[10px] border border-[#E2E8F0] text-[14px] font-bold text-[#64748B]">上一步</button>
        <button onClick={doSubmit} disabled={saving} className="min-h-[44px] rounded-[10px] bg-[#1F3A6D] text-[14px] font-bold text-white disabled:opacity-40">{saving ? "送出中…" : "確認送出"}</button>
      </div>
    </div>
  );

  // 清單頁
  return (
    <div className="space-y-3">
      {successId != null && (
        <div className="flex items-start gap-2 rounded-[14px] border border-[#2F855A]/30 bg-[#E9F5EE] p-4 text-[14px] leading-6 text-[#2F855A]">
          <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>已收到您的異動申請（申請編號 #{successId}），我們會由行政與老師確認後更新課表，進度可在下方查看。<button onClick={() => setSuccessId(null)} className="ml-2 font-bold underline">知道了</button></div>
        </div>
      )}
      <button onClick={() => { setSuccessId(null); setStep(1); }} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[10px] bg-[#1F3A6D] text-[15px] font-bold text-white">
        <Icon name="calendar" className="h-5 w-5" />申請課程異動
      </button>
      <h3 className="pt-1 text-[15px] font-bold text-[#1F2937]">申請進度</h3>
      {data.requests.length === 0 && <EmptyBox text="目前尚無異動申請，點上方按鈕即可申請。" />}
      {data.requests.map((request) => <RequestCard key={request.id} request={request} />)}
    </div>
  );
}

/* ---------- 評分分頁 ---------- */
function RatingsTab({ token, onCounts }: { token: string; onCounts: (pending: number) => void }) {
  const [data, setData] = useState<RatingsResponse | null>(null);
  const [view, setView] = useState<"pending" | "completed">("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const key = `${token}:ratings`;
    const cached = cacheGet<RatingsResponse>(key);
    if (cached) { setData(cached); onCounts(cached.pending.length); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/school-portal/${encodeURIComponent(token)}/ratings`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "載入失敗");
      setData(body as RatingsResponse);
      cacheSet(key, body);
      onCounts((body as RatingsResponse).pending.length);
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }, [token, onCounts]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>;
  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 rounded-[10px] border border-[#E2E8F0] bg-white p-1">
        {([["pending", `待評分（${data.pending.length}）`], ["completed", `已完成（${data.completed.length}）`]] as const).map(([value, label]) => (
          <button key={value} onClick={() => setView(value)} className={`min-h-[40px] rounded-[8px] text-[14px] font-bold ${view === value ? "bg-[#1F3A6D] text-white" : "text-[#64748B]"}`}>{label}</button>
        ))}
      </div>
      {view === "pending" && (
        <>
          {data.pending.length === 0 && (
            <div className="rounded-[14px] border border-[#E2E8F0] bg-white p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#E9F5EE] text-[#2F855A]"><Icon name="check" className="h-6 w-6" /></div>
              <p className="mt-3 text-[15px] font-bold text-[#1F2937]">本月待評分課程已全部完成</p>
              <p className="mt-1 text-[13px] text-[#64748B]">老師完成課後回報後，新的評分會出現在這裡。</p>
            </div>
          )}
          {data.pending.map((item) => (
            <a key={item.attendanceId} href={item.ratingUrl} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#E2E8F0] bg-white p-4">
              <div>
                <p className="text-[15px] font-bold text-[#1F2937]">{item.date.replaceAll("-", "/")}｜{item.courseName}</p>
                <p className="mt-0.5 text-[13px] text-[#64748B]">{item.teacherName} 老師</p>
              </div>
              <span className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-[10px] bg-[#D99032] px-4 text-[14px] font-bold text-white"><Icon name="star" className="h-4 w-4" />去評分</span>
            </a>
          ))}
        </>
      )}
      {view === "completed" && (
        <>
          {data.completed.length === 0 && <EmptyBox text="尚無已完成的評分。" />}
          {data.completed.map((item) => (
            <div key={item.attendanceId} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#E2E8F0] bg-white p-4">
              <div>
                <p className="text-[15px] font-bold text-[#1F2937]">{item.date.replaceAll("-", "/")}｜{item.courseName}</p>
                <p className="mt-0.5 text-[13px] text-[#64748B]">{item.teacherName} 老師</p>
              </div>
              <span className="flex items-center gap-1 text-[14px] font-bold text-[#D99032]"><Icon name="star" className="h-4 w-4" />{item.scoreOverall} 分</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ---------- 主元件 ---------- */
export default function AfterSchoolPortal({ token, summary }: { token: string; summary: PortalSummary }) {
  const now = new Date();
  const [tab, setTab] = useState<Tab>("outcomes");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [pendingRatings, setPendingRatings] = useState(summary.pendingRatings);
  const [processingChanges, setProcessingChanges] = useState(summary.processingChanges);
  const [verifyRetry, setVerifyRetry] = useState<{ retry: () => void } | null>(null);

  // 品牌：分頁標題與 PWA manifest 都用運動班長
  useEffect(() => {
    document.title = "運動班長｜安親班課程服務平台";
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const original = link?.href ?? "";
    if (link) link.href = `/api/school-portal/${encodeURIComponent(token)}/manifest`;
    return () => { if (link && original) link.href = original; };
  }, [token]);

  const months = useMemo(() => {
    const list: Array<{ y: number; m: number }> = [];
    const base = new Date();
    for (let index = 0; index < 12; index++) {
      const d = new Date(base.getFullYear(), base.getMonth() - index, 1);
      list.push({ y: d.getFullYear(), m: d.getMonth() + 1 });
    }
    return list;
  }, []);

  const NAV: Array<{ id: Tab; label: string; icon: "book" | "calendar" | "star"; badge: number }> = [
    { id: "outcomes", label: "成果", icon: "book", badge: 0 },
    { id: "changes", label: "申請異動", icon: "calendar", badge: processingChanges },
    { id: "ratings", label: "評分", icon: "star", badge: pendingRatings },
  ];

  const selectTab = (next: Tab) => { setTab(next); window.scrollTo({ top: 0 }); };

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#1F2937]">
      {/* 頁首 */}
      <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-[1040px] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/sports-leader-logo.png" alt="運動班長" className="h-10 w-10 rounded-full border border-[#E2E8F0] bg-white object-contain" />
              <div>
                <p className="text-[15px] font-bold leading-5 text-[#1F3A6D]">運動班長</p>
                <p className="text-[12px] leading-4 text-[#64748B]">安親班課程服務平台</p>
              </div>
            </div>
            {tab === "outcomes" ? (
              <select
                value={`${year}-${month}`}
                onChange={(e) => { const [y, m] = e.target.value.split("-").map(Number); setYear(y); setMonth(m); }}
                className="rounded-[10px] border border-[#E2E8F0] bg-white px-3 py-2 text-[14px] font-bold text-[#1F3A6D]"
                aria-label="選擇月份"
              >
                {months.map(({ y, m }) => <option key={`${y}-${m}`} value={`${y}-${m}`}>{y} 年 {m} 月</option>)}
              </select>
            ) : (
              <span className="text-[14px] font-bold text-[#64748B]">{year} 年 {month} 月</span>
            )}
          </div>
          <p className="mt-2 truncate text-[17px] font-bold text-[#1F2937]">{summary.school.name}</p>
          {/* 桌機版分頁列 */}
          <nav className="mt-2 hidden gap-1 lg:flex">
            {NAV.map((item) => (
              <button key={item.id} onClick={() => selectTab(item.id)}
                className={`relative flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-[14px] font-bold ${tab === item.id ? "bg-[#1F3A6D] text-white" : "text-[#64748B] hover:bg-[#F5F7FA]"}`}>
                <Icon name={item.icon} className="h-4 w-4" />{item.label}
                {item.badge > 0 && <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#D99032] px-1.5 text-[11px] font-bold text-white">{item.badge}</span>}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* 內容 */}
      <main className="mx-auto max-w-[1040px] px-4 pb-28 pt-4 lg:pb-10">
        {tab === "outcomes" && <OutcomesTab token={token} schoolName={summary.school.name} year={year} month={month} />}
        {tab === "changes" && (
          <ChangesTab
            token={token}
            onNeedVerify={(retry) => setVerifyRetry({ retry })}
            onSubmitted={() => setProcessingChanges((n) => n + 1)}
          />
        )}
        {tab === "ratings" && <RatingsTab token={token} onCounts={setPendingRatings} />}
        <footer className="mt-8 pb-2 text-center text-[12px] text-[#64748B]">運動班長｜系統技術支援：WaysLeader AI</footer>
      </main>

      {/* 手機底部導覽（3 項、44px 觸控、safe area） */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E2E8F0] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="grid grid-cols-3">
          {NAV.map((item) => (
            <button key={item.id} onClick={() => selectTab(item.id)} className="relative flex min-h-[56px] flex-col items-center justify-center gap-0.5" aria-label={item.label}>
              {item.badge > 0 && <span className="absolute right-[22%] top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#D99032] px-1 text-[10px] font-bold leading-[18px] text-white">{item.badge}</span>}
              <Icon name={item.icon} className={`h-5 w-5 ${tab === item.id ? "text-[#1F3A6D]" : "text-[#94A3B8]"}`} />
              <span className={`text-[11px] font-bold ${tab === item.id ? "text-[#1F3A6D]" : "text-[#94A3B8]"}`}>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {verifyRetry && (
        <VerifyModal
          token={token}
          onClose={() => setVerifyRetry(null)}
          onVerified={() => { const { retry } = verifyRetry; setVerifyRetry(null); retry(); }}
        />
      )}
    </div>
  );
}
