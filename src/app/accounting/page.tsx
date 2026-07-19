"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type MonthEnd = {
  year: number; month: number; ready: boolean;
  attendance: { lessons: number; cancelled: number; people: number; inSchoolHours: number; schools: number; missingStudentCount: number };
  salary: { teachers: number; total: number; hoursReviewCount: number; unreportedCount: number; locked: boolean };
  invoices: { count: number; total: number; missing: string[] };
  schools: Array<{ school: string; lessons: number; people: number; inSchoolHours: number; missingCount: number; missingReport: number; invoiceCreated: boolean; invoiceRequired: boolean }>;
};

const now = new Date();
const money = (value: number) => `$${value.toLocaleString("zh-TW")}`;

export default function AccountingPage() {
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<MonthEnd | null>(null);
  const [loading, setLoading] = useState(true);
  const [schoolFilter, setSchoolFilter] = useState<"pending" | "done" | "all">("pending");
  const [schoolPage, setSchoolPage] = useState(1);
  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/accounting-month-end?year=${year}&month=${month}`);
    setData(await res.json());
    setLoading(false);
  }, [month, year]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const blockers = data ? [
    { label: "課後課程尚未填學生人數", count: data.attendance.missingStudentCount, href: `/attendance?year=${year}&month=${month}` },
    { label: "計薪時數待確認", count: data.salary.hoursReviewCount, href: `/salary?year=${year}&month=${month}` },
    { label: "園所尚未建立請款單", count: data.invoices.missing.length, href: `/school-invoices?year=${year}&month=${month}` },
  ] : [];
  // 還缺什麼：給下載按鈕與狀態列使用
  const missingSummary = blockers.filter((item) => item.count > 0).map((item) => `${item.label} ${item.count} 筆`);
  const excelHref = `/api/accounting-month-end?year=${year}&month=${month}&format=xlsx`;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div><h1 className="text-2xl font-black text-slate-900">月底結帳中心</h1><p className="mt-1 text-sm text-slate-500">照著下方 4 個步驟處理，完成後再下載 Excel 給會計。</p></div>
        <div className="flex flex-wrap gap-2">
          <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setSchoolPage(1); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2">{[2024,2025,2026,2027,2028].map((value) => <option key={value}>{value}</option>)}</select>
          <select value={month} onChange={(e) => { setMonth(Number(e.target.value)); setSchoolPage(1); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2">{Array.from({length:12},(_,i)=>i+1).map((value)=><option key={value} value={value}>{value} 月</option>)}</select>
          <button onClick={load} disabled={loading} className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">{loading ? "整理中…" : "重新整理"}</button>
          {data?.ready ? (
            <a href={excelHref} className="rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700">下載 Excel 給會計</a>
          ) : (
            // 資料未齊全：停用正式下載，僅提供標示清楚的草稿
            <span title={missingSummary.join("、") || "資料整理中"} className="cursor-not-allowed rounded-lg bg-slate-200 px-4 py-2 font-bold text-slate-400">完成待辦後才能下載</span>
          )}
        </div>
      </div>

      {loading && !data && (
        // 載入骨架：避免顯示假的 0
        <div className="space-y-5">
          <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
          <div className="grid gap-3 md:grid-cols-4">{[0,1,2,3].map((i)=><div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}</div>
          <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      )}

      {data && <>
        <div className={`mb-5 rounded-2xl border p-4 ${data.ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-center justify-between gap-3"><div><div className={`text-lg font-black ${data.ready ? "text-emerald-800" : "text-amber-800"}`}>{data.ready ? "✓ 資料都完成，可以交給會計" : "還不能結帳：請先完成下方待辦"}</div><p className="mt-1 text-sm text-slate-600">薪資表目前：{data.salary.locked ? "已確認完成" : "尚未確認完成"}</p></div><span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-600">{year} 年 {month} 月</span></div>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-4">
          <Metric label="課後學生總人次" value={`${data.attendance.people.toLocaleString("zh-TW")} 人次`} note="依每堂課實際填寫人數加總" color="blue" />
          <Metric label="課內上課總時數" value={`${data.attendance.inSchoolHours.toLocaleString("zh-TW")} 小時`} note="課內不用填人數，只核對時數" color="slate" />
          <Metric label="預計向園所收款" value={data.invoices.count === 0 ? "尚未計算" : money(data.invoices.total)} note={data.invoices.count === 0 ? `等待建立請款單（還缺 ${data.invoices.missing.length} 間）` : `目前已建立 ${data.invoices.count} 張請款單${data.invoices.missing.length ? `，還缺 ${data.invoices.missing.length} 間` : ""}`} color="emerald" />
          <Metric label="預計支付老師薪資" value={money(data.salary.total)} note={`共 ${data.salary.teachers} 位老師`} color="violet" />
        </div>

        <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-black text-slate-900">先處理這些事情</h2><p className="mt-1 text-xs text-slate-500">點每一項就會前往處理頁面</p><div className="mt-3 space-y-2">{blockers.map((item,index)=><Link key={item.label} href={item.href} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3 hover:bg-blue-50"><span className="text-sm font-semibold text-slate-700"><b className="mr-2 text-blue-600">{index + 1}.</b>{item.label}</span><span className={`rounded-full px-2.5 py-1 text-xs font-black ${item.count ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{item.count ? `還有 ${item.count} 筆 →` : "✓ 已完成"}</span></Link>)}</div></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-black text-slate-900">月底作業順序</h2><div className="mt-3 grid gap-2 sm:grid-cols-2"><Quick href={`/attendance?year=${year}&month=${month}`} title="① 補齊上課人數" note="每堂課都要填實際學生人數"/><Quick href={`/school-invoices?year=${year}&month=${month}`} title="② 建立園所請款單" note="確認要向各園所收多少錢"/><Quick href={`/salary?year=${year}&month=${month}`} title="③ 確認老師薪資" note="核對時數、金額並完成結算"/>{data.ready ? <Quick href={excelHref} title="④ 下載完整 Excel" note="人數、請款與薪資一次交付會計"/> : <div className="cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 p-3" title={missingSummary.join("、")}><div className="font-bold text-slate-400">④ 下載完整 Excel</div><div className="mt-1 text-xs text-slate-400">完成前三步後開放下載</div></div>}</div></section>
        </div>

        {(() => {
          // 待處理 = 還缺人數，或需請款但尚未建立請款單
          const isPending = (row: MonthEnd["schools"][number]) => row.missingCount > 0 || (row.invoiceRequired && !row.invoiceCreated);
          const filtered = [...data.schools].filter((row) => schoolFilter === "all" ? true : schoolFilter === "pending" ? isPending(row) : !isPending(row)).sort((a, b) => Number(a.invoiceCreated) - Number(b.invoiceCreated) || b.missingCount - a.missingCount);
          const pageSize = 20;
          const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
          const page = Math.min(schoolPage, totalPages);
          const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
          const pendingCount = data.schools.filter(isPending).length;
          const filters: Array<{ key: typeof schoolFilter; label: string }> = [
            { key: "pending", label: `待處理 ${pendingCount}` },
            { key: "done", label: `已完成 ${data.schools.length - pendingCount}` },
            { key: "all", label: `全部 ${data.schools.length}` },
          ];
          return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><div><h2 className="font-black text-slate-900">園所月結資料</h2><p className="text-xs text-slate-500">課後看學生人次；課內只看時數；Demo 只付老師費用，不向園所請款。</p></div><div className="flex gap-1">{filters.map((item)=><button key={item.key} onClick={()=>{setSchoolFilter(item.key);setSchoolPage(1);}} className={`rounded-lg px-3 py-2 text-xs font-bold ${schoolFilter===item.key?"bg-blue-600 text-white":"border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{item.label}</button>)}</div></div><div className="overflow-auto"><table className="w-full min-w-[900px] text-sm"><thead className="sticky top-0 bg-slate-50 text-slate-600"><tr><th className="px-4 py-3 text-left">園所名稱</th><th className="px-4 py-3 text-right">本月課堂</th><th className="px-4 py-3 text-right">課後學生人次</th><th className="px-4 py-3 text-right">課內時數</th><th className="px-4 py-3 text-left">還要處理</th><th className="px-4 py-3 text-center">請款單</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">{schoolFilter==="pending"?"✓ 沒有需要處理的園所":"沒有符合的園所"}</td></tr> : rows.map((row)=><tr key={row.school}><td className="px-4 py-3 font-semibold text-slate-800">{row.school}</td><td className="px-4 py-3 text-right">{row.lessons} 堂</td><td className="px-4 py-3 text-right">{row.people ? `${row.people} 人次` : "—"}</td><td className="px-4 py-3 text-right">{row.inSchoolHours ? `${row.inSchoolHours} 小時` : "—"}</td><td className="px-4 py-3">{row.missingCount > 0 ? <Link href={`/attendance?year=${year}&month=${month}`} className="font-bold text-amber-700 hover:underline">{row.missingCount} 堂課後課未填人數 →</Link>:<span className="text-emerald-700">✓ 會計資料完成</span>}</td><td className="px-4 py-3 text-center">{row.invoiceRequired?<Link href={`/school-invoices?year=${year}&month=${month}`} className={`rounded-full px-2 py-1 text-xs font-bold ${row.invoiceCreated?"bg-emerald-100 text-emerald-700":"bg-amber-100 text-amber-700"}`}>{row.invoiceCreated?"✓ 已建立":"去建立 →"}</Link>:<span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-bold text-violet-700">Demo 免請款</span>}</td></tr>)}</tbody></table></div>{totalPages > 1 && <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm"><span className="text-slate-500">共 {filtered.length} 間，第 {page} / {totalPages} 頁</span><div className="flex gap-2"><button onClick={()=>setSchoolPage(page-1)} disabled={page<=1} className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold text-slate-600 disabled:opacity-40">上一頁</button><button onClick={()=>setSchoolPage(page+1)} disabled={page>=totalPages} className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold text-slate-600 disabled:opacity-40">下一頁</button></div></div>}</section>;
        })()}
      </>}
    </div>
  );
}

function Metric({label,value,note,color}:{label:string;value:string;note:string;color:"blue"|"emerald"|"violet"|"slate"}) { const styles={blue:"border-blue-200 bg-blue-50 text-blue-900",emerald:"border-emerald-200 bg-emerald-50 text-emerald-900",violet:"border-violet-200 bg-violet-50 text-violet-900",slate:"border-slate-200 bg-white text-slate-900"}; return <div className={`rounded-2xl border p-4 ${styles[color]}`}><div className="text-sm font-bold opacity-70">{label}</div><div className="mt-1 text-2xl font-black">{value}</div><div className="mt-1 text-xs opacity-60">{note}</div></div> }
function Quick({href,title,note}:{href:string;title:string;note:string}) { return <Link href={href} className="rounded-xl border border-slate-200 p-3 hover:border-blue-200 hover:bg-blue-50"><div className="font-bold text-slate-800">{title} →</div><div className="mt-1 text-xs text-slate-500">{note}</div></Link> }
