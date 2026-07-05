"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { type CSSProperties, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Invoice = {
  id: number;
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
    id?: number;
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

function money(value: number) {
  return `${value.toLocaleString("zh-TW")} 元`;
}

function shortDate(date: string) {
  const d = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
}

function invoiceDate(date: string) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date.slice(0, 10);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

function periodLabel(invoiceMonth: string) {
  const [year, month] = invoiceMonth.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

function billingTypeLabel(type: "perClass" | "perPerson") {
  return type === "perPerson" ? "按人次計費" : "按堂計費";
}

function fmtHours(value: number) {
  return value.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
}

function brandVisual(brandName: string) {
  if (brandName === "優比熊") {
    return {
      logo: "/images/invoices/upbear-logo.jpg",
      primary: "#A96514",
      dark: "#111827",
      soft: "#F7F7F7",
      line: "#555555",
      accent: "#A96514",
    };
  }

  return {
    logo: "/images/invoices/sports-leader-logo.png",
    primary: "#243C7C",
    dark: "#111827",
    soft: "#F7F7F7",
    line: "#555555",
    accent: "#243C7C",
  };
}

export default function SchoolInvoicePrintPage() {
  const params = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/school-invoices/${params.id}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "請款單讀取失敗");
        return data;
      })
      .then(setInvoice)
      .catch((e) => setError((e as Error).message || "請款單讀取失敗"));
  }, [params.id]);

  if (error) return <div className="mx-auto max-w-3xl p-8 text-red-600">{error}</div>;
  if (!invoice) return <div className="mx-auto max-w-3xl p-8 text-slate-500">載入請款單中...</div>;

  const visual = brandVisual(invoice.brandName);
  const invoiceStyle = {
    "--invoice-primary": visual.primary,
    "--invoice-dark": visual.dark,
    "--invoice-soft": visual.soft,
    "--invoice-line": visual.line,
    "--invoice-accent": visual.accent,
  } as CSSProperties;

  return (
    <div className="bg-slate-100 py-6 text-slate-950 print:bg-white print:py-0">
      <style jsx global>{`
        @page { size: A4 portrait; margin: 16mm; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media print {
          header:not(.invoice-document-header), footer, .no-print { display: none !important; }
          body { background: #fff !important; }
          .invoice-sheet { box-shadow: none !important; margin: 0 !important; width: 100% !important; min-height: auto !important; padding: 0 !important; }
          .invoice-content { position: relative !important; z-index: 1 !important; }
          .avoid-break { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-3">
        <Link href="/school-invoices" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600">返回請款單</Link>
        <button onClick={() => window.print()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
          列印 / 另存 PDF
        </button>
      </div>

      <article style={invoiceStyle} className="invoice-sheet relative mx-auto min-h-[297mm] w-[210mm] overflow-hidden bg-white p-[16mm] shadow-sm">
        <div className="invoice-content relative z-10">
        <header className="invoice-document-header mb-7 text-center">
          <div className="mb-3 flex items-center justify-center gap-5">
            <img src={visual.logo} alt={invoice.brandName} className="h-20 w-20 object-contain" />
            <h1 className="inline-block border-b border-slate-700 px-2 text-2xl font-bold tracking-wide text-slate-950">{invoice.companyName}</h1>
          </div>
          <div>
            <span className="inline-block border-b-2 border-[var(--invoice-primary)] px-3 pb-1 text-xl font-bold text-slate-950">{invoice.brandName} 請款單</span>
          </div>
        </header>

        <section className="mb-5 text-sm">
          <div className="mb-4 grid grid-cols-[1fr_auto] items-end gap-8">
            <div className="border-b border-slate-700 pb-1 text-base text-slate-950">
              {invoice.schoolName}　台照
            </div>
            <div className="space-y-1 text-right font-semibold text-slate-950">
              <div>TEL：{invoice.phone || ""}</div>
              <div>FAX：{invoice.fax || ""}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 border-y border-slate-300 py-3">
            <div>請款日期：{invoiceDate(invoice.invoiceDate)}</div>
            <div>請款月份：{periodLabel(invoice.invoiceMonth)}</div>
            <div>請款抬頭：{invoice.schoolName} 台照</div>
          </div>
        </section>

        <section className="mb-8">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-950">
                <th className="border border-slate-600 px-3 py-2 text-left">項目</th>
                <th className="border border-slate-600 px-3 py-2 text-left">期間</th>
                <th className="border border-slate-600 px-3 py-2 text-left">收費方式</th>
                <th className="border border-slate-600 px-3 py-2 text-right">單價</th>
                <th className="border border-slate-600 px-3 py-2 text-right">數量</th>
                <th className="border border-slate-600 px-3 py-2 text-right">金額</th>
                <th className="border border-slate-600 px-3 py-2 text-left">備註</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id ?? item.courseType}>
                  <td className="border border-slate-600 bg-white/70 px-3 py-2 font-semibold">{item.courseName}才藝</td>
                  <td className="border border-slate-600 bg-white/70 px-3 py-2">{item.periodLabel}</td>
                  <td className="border border-slate-600 bg-white/70 px-3 py-2">{billingTypeLabel(item.billingType)}</td>
                  <td className="border border-slate-600 bg-white/70 px-3 py-2 text-right">{money(item.unitPrice)}</td>
                  <td className="border border-slate-600 bg-white/70 px-3 py-2 text-right">{item.quantity.toLocaleString("zh-TW")} {item.quantityLabel}</td>
                  <td className="border border-slate-600 bg-white/70 px-3 py-2 text-right font-bold text-slate-950">{money(item.subtotal)}</td>
                  <td className="border border-slate-600 bg-white/70 px-3 py-2">{item.note}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-bold text-slate-950">
                <td className="border border-slate-600 px-3 py-2">合計</td>
                <td className="border border-slate-600 px-3 py-2"></td>
                <td className="border border-slate-600 px-3 py-2"></td>
                <td className="border border-slate-600 px-3 py-2"></td>
                <td className="border border-slate-600 px-3 py-2"></td>
                <td className="border border-slate-600 px-3 py-2 text-right">{money(invoice.totalAmount)}（{invoice.taxType}）</td>
                <td className="border border-slate-600 px-3 py-2"></td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="space-y-7">
          {invoice.items.map((item) => (
            <div key={`${item.id ?? item.courseType}-details`} className="avoid-break">
              <h2 className="mb-2 border-b-2 border-[var(--invoice-primary)] pb-1 text-base font-bold text-slate-950">{item.courseName}課程細目</h2>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-950">
                    <th className="border border-slate-600 px-3 py-2 text-left">日期</th>
                    <th className="border border-slate-600 px-3 py-2 text-left">星期</th>
                    <th className="border border-slate-600 px-3 py-2 text-left">時間</th>
                    {item.billingType === "perPerson" ? (
                      <>
                        <th className="border border-slate-600 px-3 py-2 text-right">實到人數</th>
                        <th className="border border-slate-600 px-3 py-2 text-right">計費人數</th>
                      </>
                    ) : (
                      <th className="border border-slate-600 px-3 py-2 text-right">時數</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {item.details.map((detail) => (
                    <tr key={`${item.id ?? item.courseType}-${detail.attendanceId}-${detail.date}`}>
                      <td className="border border-slate-600 bg-white/70 px-3 py-2">{shortDate(detail.date)}</td>
                      <td className="border border-slate-600 bg-white/70 px-3 py-2">{detail.weekday}</td>
                      <td className="border border-slate-600 bg-white/70 px-3 py-2">{detail.time || ""}</td>
                      {item.billingType === "perPerson" ? (
                        <>
                          <td className="border border-slate-600 bg-white/70 px-3 py-2 text-right">{detail.studentCount == null ? "" : `${detail.studentCount} 人次`}</td>
                          <td className="border border-slate-600 bg-white/70 px-3 py-2 text-right">{detail.billableCount == null ? "" : `${detail.billableCount} 人次`}</td>
                        </>
                      ) : (
                        <td className="border border-slate-600 bg-white/70 px-3 py-2 text-right">{fmtHours(detail.hours)} 小時</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 bg-slate-50 px-3 py-2 text-right text-sm font-bold text-slate-950 ring-1 ring-slate-300">
                {item.billingType === "perPerson"
                  ? `總實到人次：${item.totalStudentCount.toLocaleString("zh-TW")} 人次｜總計費人次：${item.billableCount.toLocaleString("zh-TW")} 人次`
                  : `總堂數：${item.classCount} 堂｜總時數：${fmtHours(item.totalHours)} 小時`}
              </div>
            </div>
          ))}
        </section>

        <section className="avoid-break mt-10 border-t border-slate-500 pt-5 text-sm">
          <div className="mb-2 font-bold text-slate-950">匯款帳戶資訊</div>
          <div className="grid grid-cols-2 gap-y-1 text-slate-950">
            <div>銀行：{invoice.bankName}</div>
            <div>帳號：{invoice.bankAccount}</div>
            <div className="col-span-2">戶名：{invoice.accountName}</div>
          </div>
          {invoice.notes && <div className="mt-4">備註：{invoice.notes}</div>}
        </section>
        </div>
      </article>
    </div>
  );
}
