"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SCHOOL_INVOICE_BRANDS } from "@/lib/schoolInvoiceConfig";

type School = { id: number; name: string; type: string; region: string };
type SchoolInvoiceSnapshot = {
  id?: number;
  schoolId: number;
  schoolName: string;
  brandName: string;
  invoiceMonth: string;
  invoiceDate: string;
  status: string;
  totalAmount: number;
  taxType: string;
  notes: string;
  companyName: string;
  phone: string;
  fax: string;
  bankName: string;
  bankAccount: string;
  accountName: string;
  items: Array<{
    courseType: string;
    courseName: string;
    periodLabel: string;
    billingType: "perClass" | "perPerson";
    unitPrice: number;
    minChargeCount: number;
    quantity: number;
    quantityLabel: string;
    classCount: number;
    totalStudentCount: number;
    billableCount: number;
    totalHours: number;
    subtotal: number;
    note: string;
    details: Array<{ attendanceId: number | null; date: string; weekday: string; time: string; hours: number; studentCount: number | null; billableCount: number | null; note: string }>;
  }>;
};
type SavedInvoice = Omit<SchoolInvoiceSnapshot, "items"> & { id: number; createdAt?: string; updatedAt?: string };

const current = new Date();

function money(value: number) {
  return value.toLocaleString("zh-TW");
}

function shortDate(date: string) {
  const d = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
}

function invoicePeriodLabel(invoiceMonth: string) {
  const [year, month] = invoiceMonth.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

function billingTypeLabel(type: "perClass" | "perPerson") {
  return type === "perPerson" ? "按人次計費" : "按堂計費";
}

function fmtHours(value: number) {
  return value.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
}

export default function SchoolInvoicesPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [schoolSearch, setSchoolSearch] = useState("");
  const [schoolPickerOpen, setSchoolPickerOpen] = useState(false);
  const [year, setYear] = useState(current.getFullYear());
  const [month, setMonth] = useState(current.getMonth() + 1);
  const [brandName, setBrandName] = useState("");
  const [notes, setNotes] = useState("");
  const [taxType, setTaxType] = useState("未稅");
  const [unitPrices, setUnitPrices] = useState<Record<string, string>>({});
  const [billingTypes, setBillingTypes] = useState<Record<string, "perClass" | "perPerson">>({});
  const [minChargeCounts, setMinChargeCounts] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<SchoolInvoiceSnapshot | null>(null);
  const [invoices, setInvoices] = useState<SavedInvoice[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const selectedSchool = useMemo(() => schools.find((school) => String(school.id) === schoolId), [schoolId, schools]);
  const filteredSchools = useMemo(() => {
    const keyword = schoolSearch.trim().toLowerCase();
    const matched = keyword
      ? schools.filter((school) => `${school.name} ${school.region} ${school.type}`.toLowerCase().includes(keyword))
      : schools;
    return matched.slice(0, 30);
  }, [schoolSearch, schools]);

  const loadSchools = useCallback(async () => {
    const res = await fetch("/api/schools?minimal=1");
    const data = await res.json();
    setSchools(Array.isArray(data) ? data : data.items ?? []);
  }, []);

  const loadInvoices = useCallback(async () => {
    const params = new URLSearchParams({ year: String(year), month: String(month) });
    if (schoolId) params.set("schoolId", schoolId);
    const res = await fetch(`/api/school-invoices?${params}`);
    const data = await res.json();
    if (Array.isArray(data)) setInvoices(data);
  }, [month, schoolId, year]);

  useEffect(() => { void Promise.resolve().then(loadSchools); }, [loadSchools]);
  useEffect(() => { void Promise.resolve().then(loadInvoices); }, [loadInvoices]);

  async function loadPreview(nextPrices = unitPrices, nextBillingTypes = billingTypes, nextMinChargeCounts = minChargeCounts) {
    if (!schoolId) {
      setMessage("請先選擇園所");
      return;
    }
    setLoadingPreview(true);
    setMessage("");
    try {
      const body = {
        schoolId: Number(schoolId),
        year,
        month,
        brandName,
        taxType,
        notes,
        unitPrices: Object.fromEntries(Object.entries(nextPrices).map(([key, value]) => [key, Number(value) || 0])),
        billingTypes: nextBillingTypes,
        minChargeCounts: Object.fromEntries(Object.entries(nextMinChargeCounts).map(([key, value]) => [key, Number(value) || 0])),
      };
      const res = await fetch("/api/school-invoices/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "請款單預覽失敗");
      setPreview(data);
      if (!brandName && data.brandName) setBrandName(data.brandName);
      setUnitPrices((currentPrices) => {
        const next = { ...currentPrices };
        for (const item of data.items ?? []) {
          if (next[item.courseType] === undefined) next[item.courseType] = item.unitPrice ? String(item.unitPrice) : "";
        }
        return next;
      });
      setBillingTypes((currentTypes) => {
        const next = { ...currentTypes };
        for (const item of data.items ?? []) {
          if (next[item.courseType] === undefined) next[item.courseType] = item.billingType;
        }
        return next;
      });
      setMinChargeCounts((currentCounts) => {
        const next = { ...currentCounts };
        for (const item of data.items ?? []) {
          if (next[item.courseType] === undefined) next[item.courseType] = item.minChargeCount ? String(item.minChargeCount) : "";
        }
        return next;
      });
    } catch (error) {
      setPreview(null);
      setMessage((error as Error).message || "請款單預覽失敗");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function updatePrice(courseType: string, value: string) {
    const next = { ...unitPrices, [courseType]: value };
    setUnitPrices(next);
    if (preview) await loadPreview(next, billingTypes, minChargeCounts);
  }

  async function updateBillingType(courseType: string, value: "perClass" | "perPerson") {
    const next = { ...billingTypes, [courseType]: value };
    setBillingTypes(next);
    if (preview) await loadPreview(unitPrices, next, minChargeCounts);
  }

  async function updateMinChargeCount(courseType: string, value: string) {
    const next = { ...minChargeCounts, [courseType]: value };
    setMinChargeCounts(next);
    if (preview) await loadPreview(unitPrices, billingTypes, next);
  }

  async function createInvoice() {
    if (!preview || preview.items.length === 0) return;
    const zeroItems = preview.items.filter((item) => !item.unitPrice);
    if (zeroItems.length && !confirm(`以下課程單價為 0：${zeroItems.map((item) => item.courseName).join("、")}。仍要產生請款單嗎？`)) return;

    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/school-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId: Number(schoolId),
          year,
          month,
          brandName: brandName || preview.brandName,
          taxType,
          notes,
          unitPrices: Object.fromEntries(Object.entries(unitPrices).map(([key, value]) => [key, Number(value) || 0])),
          billingTypes,
          minChargeCounts: Object.fromEntries(Object.entries(minChargeCounts).map(([key, value]) => [key, Number(value) || 0])),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "請款單建立失敗");
      setMessage(`已產生請款單 #${data.id}`);
      await loadInvoices();
      window.open(`/school-invoices/${data.id}/print`, "_blank");
    } catch (error) {
      setMessage((error as Error).message || "請款單建立失敗");
    } finally {
      setSaving(false);
    }
  }

  async function deleteInvoice(id: number) {
    if (!confirm(`確定刪除請款單 #${id}？\n刪除只會移除請款單快照，不會影響出勤、課程或老師薪資資料。`)) return;
    setMessage("");
    try {
      const res = await fetch(`/api/school-invoices/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "請款單刪除失敗");
      setMessage(`已刪除請款單 #${id}`);
      await loadInvoices();
    } catch (error) {
      setMessage((error as Error).message || "請款單刪除失敗");
    }
  }

  const years = [2025, 2026, 2027, 2028];

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">園所請款單</h1>
          <p className="mt-1 text-sm text-slate-500">依園所與月份產生公司向園所收款的請款單，不影響老師薪資。</p>
        </div>
        <Link href="/schools" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          園所管理
        </Link>
      </div>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="grid gap-4 md:grid-cols-6">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">園所</label>
            <div className="relative" onBlur={() => window.setTimeout(() => setSchoolPickerOpen(false), 120)}>
              <input
                value={schoolSearch}
                onChange={(e) => {
                  const value = e.target.value;
                  setSchoolSearch(value);
                  setSchoolPickerOpen(true);
                  if (!value.trim()) {
                    setSchoolId("");
                    setPreview(null);
                  }
                }}
                onFocus={() => setSchoolPickerOpen(true)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="搜尋園所名稱、地區或類型"
              />
              {schoolPickerOpen && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  {filteredSchools.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-slate-400">找不到符合的園所</div>
                  ) : (
                    filteredSchools.map((school) => (
                      <button
                        key={school.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSchoolId(String(school.id));
                          setSchoolSearch(school.name);
                          setSchoolPickerOpen(false);
                          setPreview(null);
                        }}
                        className={`block w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${String(school.id) === schoolId ? "bg-blue-50 text-blue-700" : "text-slate-700"}`}
                      >
                        <span className="font-semibold">{school.name}</span>
                        <span className="ml-2 text-xs text-slate-400">{school.region || "未填地區"} · {school.type || "未分類"}</span>
                      </button>
                    ))
                  )}
                  {schools.length > filteredSchools.length && (
                    <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400">請輸入更多關鍵字縮小範圍</div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">年份</label>
            <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setPreview(null); }} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">月份</label>
            <select value={month} onChange={(e) => { setMonth(Number(e.target.value)); setPreview(null); }} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m} 月</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">品牌</label>
            <select value={brandName} onChange={(e) => { setBrandName(e.target.value); setPreview(null); }} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">系統預設</option>
              {SCHOOL_INVOICE_BRANDS.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">稅別</label>
            <select value={taxType} onChange={(e) => setTaxType(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="未稅">未稅</option>
              <option value="含稅">含稅</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">備註</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="可留空" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={() => loadPreview()} disabled={!schoolId || loadingPreview} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            {loadingPreview ? "整理中..." : "產生預覽"}
          </button>
          {selectedSchool && <span className="text-sm text-slate-500">目前選擇：{selectedSchool.name}</span>}
          {message && <span className={message.includes("失敗") || message.includes("請") ? "text-sm font-medium text-red-600" : "text-sm font-medium text-green-600"}>{message}</span>}
        </div>
      </section>

      {preview && (
        <section className="mb-6 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm md:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">請款單預覽</h2>
              <p className="mt-1 text-sm text-slate-500">{preview.companyName}｜{brandName || preview.brandName} 請款單｜{invoicePeriodLabel(preview.invoiceMonth)}</p>
            </div>
            <div className="rounded-xl bg-blue-50 px-4 py-3 text-right">
              <div className="text-xs font-semibold text-blue-500">合計金額</div>
              <div className="text-2xl font-black text-blue-700">${money(preview.totalAmount)}</div>
              <div className="text-xs text-blue-500">{taxType}</div>
            </div>
          </div>

          {preview.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
              本月份沒有可請款課程。
            </div>
          ) : (
            <div className="space-y-5">
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[1180px] text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">項目</th>
                      <th className="px-3 py-2 text-left">期間</th>
                      <th className="px-3 py-2 text-left">收費方式</th>
                      <th className="px-3 py-2 text-right">單價（元）</th>
                      <th className="px-3 py-2 text-right">實際人次</th>
                      <th className="px-3 py-2 text-right">最低收費（人/堂）</th>
                      <th className="px-3 py-2 text-right">計費數量</th>
                      <th className="px-3 py-2 text-right">金額</th>
                      <th className="px-3 py-2 text-left">備註</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.items.map((item) => (
                      <tr key={item.courseType}>
                        <td className="px-3 py-3 font-semibold text-slate-800">{item.courseName}才藝</td>
                        <td className="px-3 py-3 text-slate-600">{item.periodLabel}</td>
                        <td className="px-3 py-3">
                          <select value={billingTypes[item.courseType] ?? item.billingType} onChange={(e) => { void updateBillingType(item.courseType, e.target.value as "perClass" | "perPerson"); }} className="rounded-lg border border-slate-200 px-3 py-2">
                            <option value="perClass">按堂計費</option>
                            <option value="perPerson">按人次計費</option>
                          </select>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="inline-flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                            <input inputMode="numeric" value={unitPrices[item.courseType] ?? ""} onChange={(e) => { void updatePrice(item.courseType, e.target.value); }} className="w-24 px-3 py-2 text-right outline-none" placeholder="0" />
                            <span className="border-l border-slate-100 bg-slate-50 px-2 py-2 text-slate-500">元</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right text-slate-600">
                          {item.billingType === "perPerson" ? `${money(item.totalStudentCount)} 人次` : "—"}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {item.billingType === "perPerson" ? (
                            <div className="inline-flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                              <input
                                inputMode="numeric"
                                value={minChargeCounts[item.courseType] ?? ""}
                                onChange={(e) => { void updateMinChargeCount(item.courseType, e.target.value); }}
                                className="w-16 px-3 py-2 text-right outline-none"
                                placeholder="0"
                              />
                              <span className="border-l border-slate-100 bg-slate-50 px-2 py-2 text-slate-500">人</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right text-slate-600">{money(item.quantity)} {item.quantityLabel}</td>
                        <td className="px-3 py-3 text-right font-bold text-slate-900">${money(item.subtotal)}</td>
                        <td className="px-3 py-3 text-slate-500">{item.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {preview.items.map((item) => (
                <div key={`${item.courseType}-detail`} className="rounded-xl border border-slate-200 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-slate-800">{item.courseName}課程細目</h3>
                      <div className="mt-1 text-xs text-slate-500">{billingTypeLabel(item.billingType)}</div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {item.billingType === "perPerson"
                        ? `總實到：${money(item.totalStudentCount)} 人次｜總計費：${money(item.billableCount)} 人次`
                        : `總堂數：${item.classCount} 堂｜總時數：${fmtHours(item.totalHours)} 小時`}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead className="text-slate-500">
                        <tr className="border-b border-slate-100">
                          <th className="py-2 text-left">日期</th>
                          <th className="py-2 text-left">星期</th>
                          <th className="py-2 text-left">時間</th>
                          {item.billingType === "perPerson" ? (
                            <>
                              <th className="py-2 text-right">實到人數</th>
                              <th className="py-2 text-right">計費人數</th>
                            </>
                          ) : (
                            <th className="py-2 text-right">時數</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {item.details.map((detail) => (
                          <tr key={`${item.courseType}-${detail.attendanceId}`} className="border-b border-slate-50">
                            <td className="py-2">{shortDate(detail.date)}</td>
                            <td className="py-2">{detail.weekday}</td>
                            <td className="py-2">{detail.time || "—"}</td>
                            {item.billingType === "perPerson" ? (
                              <>
                                <td className="py-2 text-right">{detail.studentCount == null ? "—" : `${detail.studentCount} 人次`}</td>
                                <td className="py-2 text-right">{detail.billableCount == null ? "—" : `${detail.billableCount} 人次`}</td>
                              </>
                            ) : (
                              <td className="py-2 text-right">{fmtHours(detail.hours)} 小時</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              <button onClick={createInvoice} disabled={saving} className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? "產生中..." : "產生請款單並開啟 PDF"}
              </button>
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <h2 className="mb-3 text-lg font-bold text-slate-900">已產生請款單</h2>
        {invoices.length === 0 ? (
          <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">目前篩選月份尚未產生請款單。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">編號</th>
                  <th className="px-3 py-2 text-left">園所</th>
                  <th className="px-3 py-2 text-left">品牌</th>
                  <th className="px-3 py-2 text-left">月份</th>
                  <th className="px-3 py-2 text-left">狀態</th>
                  <th className="px-3 py-2 text-right">金額</th>
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-3 py-3 text-slate-500">#{invoice.id}</td>
                    <td className="px-3 py-3 font-semibold text-slate-800">{invoice.schoolName}</td>
                    <td className="px-3 py-3">{invoice.brandName}</td>
                    <td className="px-3 py-3">{invoicePeriodLabel(invoice.invoiceMonth)}</td>
                    <td className="px-3 py-3"><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{invoice.status}</span></td>
                    <td className="px-3 py-3 text-right font-bold">${money(invoice.totalAmount)}</td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-2">
                      <Link href={`/school-invoices/${invoice.id}/print`} target="_blank" className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700">
                        匯出 PDF
                      </Link>
                      <button onClick={() => deleteInvoice(invoice.id)} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100">
                        刪除
                      </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
