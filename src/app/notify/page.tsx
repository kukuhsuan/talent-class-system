"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { courseLabel } from "@/lib/courseMeta";

// 客服批次通知中心：批次發送／老師綁定／園所綁定／發送紀錄

type Teacher = { id: number; name: string; lineUserId: string | null; lineBindCode: string | null; lineRegion: string };
type School = { id: number; name: string; region: string; lineUserId: string | null; lineBindCode: string | null };

type Recipient = {
  id: number; name: string; lineBound: boolean; maskedLineId: string; lineRegion: string;
  courseTypes: string[]; regions?: string[]; region?: string; isAfterSchool?: boolean; activeCourseCount: number;
};

type Template = {
  key: string; label: string; target: "teacher" | "school";
  editable: boolean; needsTyphoonStatus: boolean; needsAck: boolean; description: string; defaultBody: string;
};

type PreviewData = {
  template: { key: string; label: string };
  total: number; sendable: number;
  unbound: Array<{ id: number; name: string }>;
  skipped: Array<{ id: number; name: string; reason: string }>;
  oaGroups: Record<string, number>;
  containsPublicLink: boolean;
  recipients: Array<{ id: number; name: string; lineBound: boolean; maskedLineId: string; lineRegion: string; message: string; skipped: string }>;
};

type Batch = {
  id: number; uuid: string; actorName: string; actorRole: string;
  templateLabel: string; messageSummary: string; targetType: string;
  testMode: number; dryRun: number; total: number; success: number; failed: number; unbound: number; skipped: number;
  status: string; createdAt: string; finishedAt: string | null;
};

type BatchRecipient = {
  id: number; recipientId: number; name: string; lineRegion: string; maskedLineId: string;
  status: string; error: string; message: string; sentAt: string | null; ackAt: string | null;
};

const REGION_LABEL: Record<string, string> = { north: "北部", south: "南部" };
const OA_LABEL: Record<string, string> = { north: "北部 OA", south: "南部 OA", school: "園所 OA 1", school2: "園所 OA 2" };

// 可用變數：名稱＋範例＋適用對象（只列實際會被替換的變數）
const VAR_DEFS: Array<{ name: string; sample: string; targets: Array<"teacher" | "school">; typhoonOnly?: boolean; ackOnly?: boolean }> = [
  { name: "姓名", sample: "王小明", targets: ["teacher", "school"] },
  { name: "園所", sample: "快樂幼兒園", targets: ["school"] },
  { name: "日期", sample: "2026/7/20（週一）", targets: ["teacher", "school"] },
  { name: "星期", sample: "週一", targets: ["teacher"] },
  { name: "課程摘要", sample: "自動帶入每人本學期課程清單（園所／課程／時間）", targets: ["teacher", "school"] },
  { name: "園所連結", sample: "園所專屬看板網址（自動產生）", targets: ["school"] },
  { name: "開課確認連結", sample: "開課資料確認網址（安親班不附）", targets: ["school"] },
  { name: "停課狀態", sample: "上方所選的課程狀態（颱風範本專用）", targets: ["teacher", "school"], typhoonOnly: true },
  { name: "確認連結", sample: "每人專屬「確認收到」網址（自動產生，點選後紀錄顯示已確認）", targets: ["teacher"], ackOnly: true },
];
const RESULT_LABEL: Record<string, string> = { success: "成功", failed: "失敗", unbound: "未綁定", skipped: "略過", pending: "處理中" };
const RESULT_STYLE: Record<string, string> = {
  success: "bg-green-100 text-green-700", failed: "bg-red-100 text-red-700",
  unbound: "bg-orange-100 text-orange-600", skipped: "bg-slate-100 text-slate-500", pending: "bg-blue-100 text-blue-600",
};

export default function NotifyPage() {
  const [tab, setTab] = useState<"batch" | "teachers" | "schools" | "logs">("batch");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [sending, setSending] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [publicBase, setPublicBase] = useState("");

  useEffect(() => { queueMicrotask(() => setPublicBase(window.location.origin)); }, []);
  useEffect(() => {
    fetch("/api/teachers").then(r => r.json()).then(data => setTeachers(Array.isArray(data) ? data : []));
    fetch("/api/schools?minimal=1").then(r => r.json()).then(data => setSchools(Array.isArray(data) ? data : []));
  }, []);

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

  const bound = teachers.filter(t => t.lineUserId).length;
  const unbound = teachers.filter(t => !t.lineUserId).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">客服通知中心</h1>
        <p className="text-sm text-slate-500">批次發送 LINE 通知、管理老師與園所綁定、查詢發送紀錄</p>
      </div>

      {msg && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4 text-sm text-green-800 flex justify-between">
          <span className="break-all">{msg}</span>
          <button onClick={() => setMsg("")} className="text-green-500 hover:text-green-700 ml-3 shrink-0">✕</button>
        </div>
      )}

      <div className="flex gap-1 mb-4 border-b border-slate-200 overflow-x-auto">
        {([["batch", "批次發送"], ["teachers", "老師 LINE 綁定"], ["schools", "園所 LINE 綁定"], ["logs", "發送紀錄"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "batch" && <BatchSendTab onDone={setMsg} />}

      {tab === "teachers" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
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
          <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
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
                    <td className="px-4 py-3 text-xs text-slate-500">{t.lineRegion ? REGION_LABEL[t.lineRegion] || t.lineRegion : "—"}</td>
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
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-blue-800 mb-2">LINE Webhook 設定網址（貼到 LINE Developers Console）</p>
            <div className="space-y-1">
              {[["北部 OA", "/api/line/north"], ["南部 OA", "/api/line/south"], ["園所 OA 1", "/api/line/school"], ["園所 OA 2", "/api/line/school2"]].map(([label, path]) => (
                <div key={path} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-blue-700 w-20 shrink-0">{label}</span>
                  <code className="text-xs bg-white border border-blue-200 px-2 py-1 rounded flex-1 select-all break-all">
                    {publicBase ? `${publicBase}${path}` : `（載入中）${path}`}
                  </code>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "schools" && (
        <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
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

      {tab === "logs" && <LogsTab />}
    </div>
  );
}

// ── 批次發送 ─────────────────────────────────────────────
function BatchSendTab({ onDone }: { onDone: (msg: string) => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [targetType, setTargetType] = useState<"teacher" | "school">("teacher");
  const [templateKey, setTemplateKey] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [boundFilter, setBoundFilter] = useState<"all" | "bound" | "unbound">("all");
  const [customBody, setCustomBody] = useState("");
  const [typhoonStatus, setTyphoonStatus] = useState("");
  const [testMode, setTestMode] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [batchUuid, setBatchUuid] = useState("");
  const [busy, setBusy] = useState<"" | "preview" | "send">("");
  const [error, setError] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // 點選變數 → 插入游標位置
  const insertVar = (name: string) => {
    const token = `{${name}}`;
    const el = bodyRef.current;
    setCustomBody(prev => {
      const start = el?.selectionStart ?? prev.length;
      const end = el?.selectionEnd ?? start;
      const next = prev.slice(0, start) + token + prev.slice(end);
      requestAnimationFrame(() => {
        if (el) { el.focus(); el.selectionStart = el.selectionEnd = start + token.length; }
      });
      return next;
    });
    setPreview(null);
    setConfirmed(false);
  };

  useEffect(() => {
    fetch("/api/notify-batch").then(r => r.json()).then(data => setTemplates(data.templates ?? []));
  }, []);

  useEffect(() => {
    setRecipients([]);
    setSelected(new Set());
    setPreview(null);
    setConfirmed(false);
    fetch(`/api/notify-batch/recipients?type=${targetType}`).then(r => r.json()).then(data => setRecipients(Array.isArray(data) ? data : []));
  }, [targetType]);

  const targetTemplates = templates.filter(t => t.target === targetType);
  const template = templates.find(t => t.key === templateKey) ?? null;

  useEffect(() => {
    // 切換範本時帶入預設內文、清空預覽
    setCustomBody(template?.defaultBody ?? "");
    setTyphoonStatus("");
    setPreview(null);
    setConfirmed(false);
  }, [templateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const regionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipients) {
      if (targetType === "teacher") { for (const region of r.regions ?? []) set.add(region); }
      else if (r.region) set.add(r.region);
    }
    return [...set].sort();
  }, [recipients, targetType]);

  const courseOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipients) for (const c of r.courseTypes) set.add(c);
    return [...set].sort();
  }, [recipients]);

  const filtered = useMemo(() => recipients.filter(r => {
    if (search && !r.name.includes(search.trim())) return false;
    if (regionFilter) {
      const regions = targetType === "teacher" ? (r.regions ?? []) : [r.region ?? ""];
      if (!regions.includes(regionFilter)) return false;
    }
    if (courseFilter && !r.courseTypes.includes(courseFilter)) return false;
    if (boundFilter === "bound" && !r.lineBound) return false;
    if (boundFilter === "unbound" && r.lineBound) return false;
    return true;
  }), [recipients, search, regionFilter, courseFilter, boundFilter, targetType]);

  const toggle = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setPreview(null); setConfirmed(false);
  };

  async function doPreview() {
    setError(""); setBusy("preview"); setPreview(null); setConfirmed(false);
    try {
      const res = await fetch("/api/notify-batch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview", templateKey, targetType,
          recipientIds: [...selected], customBody, typhoonStatus: typhoonStatus || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "預覽失敗");
      setPreview(data);
      setPreviewIndex(0);
      setBatchUuid(crypto.randomUUID());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function doSend() {
    if (!preview || !confirmed || busy) return;
    setError(""); setBusy("send");
    try {
      const res = await fetch("/api/notify-batch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send", uuid: batchUuid, templateKey, targetType,
          recipientIds: [...selected], customBody, typhoonStatus: typhoonStatus || undefined,
          testMode, dryRun, confirm: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "發送失敗");
      const b: Batch = data.batch;
      onDone(`批次 #${b.id}${b.dryRun ? "（模擬）" : ""}${b.testMode ? "（測試）" : ""} 發送完成：成功 ${b.success}、失敗 ${b.failed}、未綁定 ${b.unbound}、略過 ${b.skipped}${data.duplicated ? "（此批已發送過，未重複發送）" : ""}`);
      setPreview(null); setConfirmed(false); setSelected(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const previewRecipient = preview?.recipients[previewIndex];

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {/* 左：對象與名單 */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl border p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">1. 選擇收件對象</h2>
          <div className="flex gap-2 mb-3">
            {([["teacher", "老師"], ["school", "園所"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => { setTargetType(key); setTemplateKey(""); }}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium ${targetType === key ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="姓名搜尋"
              className="border rounded-lg px-3 py-1.5 text-sm col-span-2 md:col-span-1" />
            <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
              <option value="">全部地區</option>
              {regionOptions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={courseFilter} onChange={e => setCourseFilter(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
              <option value="">全部課程</option>
              {courseOptions.map(c => <option key={c} value={c}>{courseLabel(c)}</option>)}
            </select>
            <select value={boundFilter} onChange={e => setBoundFilter(e.target.value as typeof boundFilter)} className="border rounded-lg px-2 py-1.5 text-sm">
              <option value="all">綁定狀態：全部</option>
              <option value="bound">已綁定 LINE</option>
              <option value="unbound">未綁定 LINE</option>
            </select>
          </div>
          <div className="flex items-center gap-3 mt-3 text-sm">
            <button onClick={() => { setSelected(new Set(filtered.map(r => r.id))); setPreview(null); setConfirmed(false); }}
              className="text-blue-600 hover:text-blue-800 font-medium">全選篩選結果（{filtered.length}）</button>
            <button onClick={() => { setSelected(new Set()); setPreview(null); setConfirmed(false); }}
              className="text-slate-500 hover:text-slate-700">清除選擇</button>
            <span className="ml-auto text-slate-600">已選 <b className="text-blue-600">{selected.size}</b> 位（上限 100）</span>
          </div>
          <div className="mt-3 max-h-72 overflow-y-auto border rounded-lg divide-y">
            {filtered.map(r => (
              <label key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4" />
                <span className="font-medium text-slate-800">{r.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${r.lineBound ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-600"}`}>
                  {r.lineBound ? "已綁定" : "未綁定"}
                </span>
                <span className="text-xs text-slate-400 ml-auto">{OA_LABEL[r.lineRegion] ?? r.lineRegion}</span>
              </label>
            ))}
            {filtered.length === 0 && <div className="px-3 py-6 text-center text-sm text-slate-400">沒有符合篩選的對象</div>}
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">2. 選擇範本與訊息</h2>
          <select value={templateKey} onChange={e => setTemplateKey(e.target.value)} className="border rounded-lg px-3 py-2 text-sm w-full">
            <option value="">請選擇範本</option>
            {targetTemplates.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          {template && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-slate-500">{template.description}</p>
              {template.needsTyphoonStatus && (
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">課程狀態（必選，不預設停課）</label>
                  <div className="flex gap-2">
                    {["停課", "照常上課", "等待園所確認"].map(s => (
                      <button key={s} onClick={() => { setTyphoonStatus(s); setPreview(null); setConfirmed(false); }}
                        className={`px-3 py-1.5 rounded-lg text-sm ${typhoonStatus === s ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <textarea ref={bodyRef} value={customBody} onChange={e => { setCustomBody(e.target.value); setPreview(null); setConfirmed(false); }}
                rows={10} className="border rounded-lg px-3 py-2 text-sm w-full font-mono" />
              <div>
                <p className="text-xs font-medium text-slate-600 mb-1">可用變數（點選插入游標位置）</p>
                <div className="flex flex-wrap gap-1.5">
                  {VAR_DEFS.filter(v => v.targets.includes(targetType) && (!v.typhoonOnly || template.needsTyphoonStatus) && (!v.ackOnly || template.needsAck)).map(v => (
                    <button key={v.name} type="button" onClick={() => insertVar(v.name)}
                      className="px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs hover:bg-blue-100 border border-blue-100"
                      title={`範例：${v.sample}`}>
                      {`{${v.name}}`}
                    </button>
                  ))}
                </div>
                <div className="mt-2 text-xs text-slate-400 space-y-0.5">
                  <p className="font-medium text-slate-500">範例</p>
                  {VAR_DEFS.filter(v => v.targets.includes(targetType) && (!v.typhoonOnly || template.needsTyphoonStatus) && (!v.ackOnly || template.needsAck)).map(v => (
                    <p key={v.name}>{`{${v.name}}`} → {v.sample}</p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 右：預覽與發送 */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl border p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">3. 預覽發送</h2>
          <div className="flex flex-wrap items-center gap-4 mb-3 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={testMode} onChange={e => setTestMode(e.target.checked)} className="h-4 w-4" />
              只傳給測試人員（請只勾選測試帳號）
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} className="h-4 w-4" />
              模擬發送（不實際傳送 LINE）
            </label>
          </div>
          <button onClick={doPreview} disabled={!templateKey || selected.size === 0 || busy !== ""}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {busy === "preview" ? "產生預覽中..." : "預覽發送"}
          </button>
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        </div>

        {preview && (
          <div className="bg-white rounded-xl border p-4 space-y-4">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 text-center">
              <div className="rounded-lg bg-slate-50 p-2"><div className="text-lg font-bold text-slate-700">{preview.total}</div><div className="text-xs text-slate-500">收件人數</div></div>
              <div className="rounded-lg bg-green-50 p-2"><div className="text-lg font-bold text-green-600">{preview.sendable}</div><div className="text-xs text-slate-500">可發送</div></div>
              <div className="rounded-lg bg-orange-50 p-2"><div className="text-lg font-bold text-orange-500">{preview.unbound.length}</div><div className="text-xs text-slate-500">未綁定</div></div>
              <div className="rounded-lg bg-slate-50 p-2"><div className="text-lg font-bold text-slate-500">{preview.skipped.length}</div><div className="text-xs text-slate-500">略過</div></div>
            </div>
            <div className="text-xs text-slate-600 space-y-1">
              <p>使用官方帳號：{Object.entries(preview.oaGroups).map(([k, v]) => `${OA_LABEL[k] ?? k} ${v} 位`).join("、") || "—"}</p>
              <p>是否包含公開連結：<b className={preview.containsPublicLink ? "text-amber-600" : "text-slate-500"}>{preview.containsPublicLink ? "是（園所看板／確認連結）" : "否"}</b></p>
              {preview.unbound.length > 0 && <p className="text-orange-600">未綁定 LINE（不會收到）：{preview.unbound.map(u => u.name).join("、")}</p>}
              {preview.skipped.length > 0 && <p className="text-slate-500">略過：{preview.skipped.map(s => `${s.name}（${s.reason}）`).join("、")}</p>}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-slate-600">每位收件者實際訊息預覽：</span>
                <select value={previewIndex} onChange={e => setPreviewIndex(Number(e.target.value))} className="border rounded-lg px-2 py-1 text-xs">
                  {preview.recipients.map((r, i) => (
                    <option key={r.id} value={i}>{r.name}{r.skipped ? "（略過）" : r.lineBound ? "" : "（未綁定）"}</option>
                  ))}
                </select>
                {previewRecipient && <span className="text-xs text-slate-400">{OA_LABEL[previewRecipient.lineRegion] ?? previewRecipient.lineRegion}　{previewRecipient.maskedLineId || "未綁定"}</span>}
              </div>
              <pre className="whitespace-pre-wrap rounded-lg border bg-slate-50 p-3 text-sm text-slate-800 max-h-72 overflow-y-auto">
                {previewRecipient?.skipped ? `（此收件人將被略過：${previewRecipient.skipped}）` : previewRecipient?.message || "（無訊息）"}
              </pre>
            </div>

            <div className="border-t pt-4">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="h-4 w-4" />
                我已確認收件人及訊息
              </label>
              <button onClick={doSend} disabled={!confirmed || busy !== ""}
                className="mt-3 rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {busy === "send" ? "發送中，請勿重複點擊..." : dryRun ? "確認發送（模擬）" : "確認發送"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 發送紀錄 ─────────────────────────────────────────────
function LogsTab() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [detail, setDetail] = useState<{ batch: Batch; recipients: BatchRecipient[] } | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/notify-batch").then(r => r.json()).then(data => setBatches(data.batches ?? []));
  }, []);

  async function openDetail(id: number) {
    setLoadingId(id);
    const res = await fetch(`/api/notify-batch/${id}`);
    const data = await res.json();
    if (res.ok) setDetail(data);
    setLoadingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">批次</th>
              <th className="text-left px-4 py-3 font-medium">時間</th>
              <th className="text-left px-4 py-3 font-medium">發送者</th>
              <th className="text-left px-4 py-3 font-medium">範本</th>
              <th className="text-left px-4 py-3 font-medium">對象</th>
              <th className="text-left px-4 py-3 font-medium">結果</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {batches.map(b => (
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium">#{b.id}</div>
                  <div className="text-[10px] text-slate-400 font-mono">{b.uuid.slice(0, 8)}</div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{b.createdAt.replace("T", " ").slice(0, 16)}</td>
                <td className="px-4 py-3 text-xs">{b.actorName}<div className="text-slate-400">{b.actorRole}</div></td>
                <td className="px-4 py-3 text-xs">
                  {b.templateLabel}
                  {b.dryRun ? <span className="ml-1 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">模擬</span> : null}
                  {b.testMode ? <span className="ml-1 text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded">測試</span> : null}
                  <div className="text-slate-400 max-w-[220px] truncate">{b.messageSummary}</div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{b.targetType === "school" ? "園所" : "老師"} {b.total} 位</td>
                <td className="px-4 py-3 text-xs">
                  <span className="text-green-600">成功 {b.success}</span>
                  {b.failed > 0 && <span className="text-red-500">／失敗 {b.failed}</span>}
                  {b.unbound > 0 && <span className="text-orange-500">／未綁定 {b.unbound}</span>}
                  {b.skipped > 0 && <span className="text-slate-400">／略過 {b.skipped}</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openDetail(b.id)} disabled={loadingId === b.id}
                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1 rounded-lg disabled:opacity-50">
                    {loadingId === b.id ? "載入中..." : "明細"}
                  </button>
                </td>
              </tr>
            ))}
            {batches.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-slate-400">尚無批次發送紀錄</td></tr>}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700">批次 #{detail.batch.id}｜{detail.batch.templateLabel}｜{detail.batch.actorName}</h2>
            <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600 text-sm">收合 ✕</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">收件人</th>
                  <th className="text-left px-3 py-2 font-medium">LINE OA</th>
                  <th className="text-left px-3 py-2 font-medium">識別碼</th>
                  <th className="text-left px-3 py-2 font-medium">結果</th>
                  <th className="text-left px-3 py-2 font-medium">確認收到</th>
                  <th className="text-left px-3 py-2 font-medium">錯誤原因</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {detail.recipients.map(r => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{OA_LABEL[r.lineRegion] ?? r.lineRegion}</td>
                    <td className="px-3 py-2 text-xs font-mono text-slate-400">{r.maskedLineId || "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${RESULT_STYLE[r.status] ?? "bg-slate-100 text-slate-500"}`}>
                        {RESULT_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.ackAt
                        ? <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700" title={r.ackAt}>✅ 已確認</span>
                        : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500 max-w-[260px] truncate" title={r.error}>{r.error || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
