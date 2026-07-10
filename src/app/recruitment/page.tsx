"use client";

import { useEffect, useMemo, useState } from "react";
import { SaveButton } from "@/components/SaveButton";
import { Toast } from "@/components/Toast";
import { ensureOk } from "@/lib/clientApi";
import { useToast } from "@/lib/useToast";

type Campaign = {
  id: number;
  title: string;
  regions: string;
  courses: string;
  timeSlots: string;
  description: string;
  isActive?: boolean;
  createdAt: string;
};

type Referral = {
  id: number;
  campaignTitle: string;
  referrerName: string;
  candidateName: string;
  candidatePhone: string;
  notes: string;
  createdAt: string;
};

const empty = { title: "", regions: "", courses: "", timeSlots: "", description: "" };

export default function RecruitmentPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [form, setForm] = useState(empty);
  const [filters, setFilters] = useState({ campaign: "", referrer: "", date: "" });
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const { toast, showToast } = useToast();

  const referralQuery = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value.trim()) params.set(key, value.trim());
    });
    return params.toString();
  }, [filters]);

  async function loadCampaigns() {
    const res = await fetch("/api/recruitment", { cache: "no-store" });
    await ensureOk(res, "讀取招募訊息失敗");
    setCampaigns(await res.json());
  }

  async function loadReferrals() {
    const res = await fetch(`/api/recruitment/referrals${referralQuery ? `?${referralQuery}` : ""}`, { cache: "no-store" });
    await ensureOk(res, "讀取推薦名單失敗");
    setReferrals(await res.json());
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadCampaigns()).catch((error) => showToast("error", (error as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadReferrals()).catch((error) => showToast("error", (error as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referralQuery]);

  async function saveCampaign() {
    setSaving(true);
    try {
      const res = await fetch("/api/recruitment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      await ensureOk(res, "建立招募訊息失敗");
      setForm(empty);
      showToast("success", "招募訊息已建立");
      await loadCampaigns();
    } catch (error) {
      showToast("error", (error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function sendCampaign(campaign: Campaign) {
    if (!confirm(`確定一鍵發送「${campaign.title}」給已綁定 LINE 的老師？`)) return;
    setSending(campaign.id);
    try {
      const res = await fetch(`/api/recruitment/${campaign.id}/send`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "一鍵發送失敗");
      showToast(data.failed ? "error" : "success", `發送完成：成功 ${data.sent} 位，失敗 ${data.failed} 位`);
    } catch (error) {
      showToast("error", (error as Error).message);
    } finally {
      setSending(null);
    }
  }

  async function deleteCampaign(campaign: Campaign) {
    if (!confirm(`確定刪除「${campaign.title}」？\n\n已收到的推薦名單會保留，這個招募會從列表隱藏。`)) return;
    setDeleting(campaign.id);
    try {
      const res = await fetch(`/api/recruitment/${campaign.id}`, { method: "DELETE" });
      await ensureOk(res, "刪除招募訊息失敗");
      showToast("success", "招募訊息已刪除");
      await loadCampaigns();
    } catch (error) {
      showToast("error", (error as Error).message);
    } finally {
      setDeleting(null);
    }
  }

  const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 text-slate-800">
      <Toast toast={toast} />
      <div>
        <h1 className="text-2xl font-bold text-slate-900">全民招募</h1>
        <p className="mt-1 text-sm text-slate-500">發送招募需求給現有老師，收集老師推薦的人選。</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm font-semibold text-slate-600">
            招募標題
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={input} placeholder="例如：台北區運動老師招募" />
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-600">
            需求地區
            <input value={form.regions} onChange={(e) => setForm({ ...form, regions: e.target.value })} className={input} placeholder="可填多個：台北、桃園、新竹" />
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-600">
            需求課程
            <input value={form.courses} onChange={(e) => setForm({ ...form, courses: e.target.value })} className={input} placeholder="可填多個：足球、體能、舞蹈" />
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-600">
            需求時段
            <input value={form.timeSlots} onChange={(e) => setForm({ ...form, timeSlots: e.target.value })} className={input} placeholder="例如：平日下午、週六上午" />
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-600 md:col-span-2">
            簡單說明
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${input} min-h-24`} placeholder="補充條件、合作方式或希望老師推薦的對象" />
          </label>
        </div>
        <div className="mt-4">
          <SaveButton saving={saving} onClick={saveCampaign} idleText="建立招募訊息" />
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3 font-bold text-slate-900">招募訊息</div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
              <tr>
                <th className="px-4 py-3">標題</th>
                <th className="px-4 py-3">地區</th>
                <th className="px-4 py-3">課程</th>
                <th className="px-4 py-3">時段</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td className="px-4 py-3 font-semibold">{campaign.title}</td>
                  <td className="px-4 py-3">{campaign.regions || "-"}</td>
                  <td className="px-4 py-3">{campaign.courses || "-"}</td>
                  <td className="px-4 py-3">{campaign.timeSlots || "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => sendCampaign(campaign)}
                      disabled={sending === campaign.id}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                    >
                      {sending === campaign.id ? "發送中..." : "一鍵發送"}
                    </button>
                    <button
                      onClick={() => deleteCampaign(campaign)}
                      disabled={deleting === campaign.id}
                      className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                    >
                      {deleting === campaign.id ? "刪除中..." : "刪除"}
                    </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!campaigns.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">尚無招募訊息。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 font-bold text-slate-900">推薦名單</div>
        <div className="mb-3 grid gap-3 md:grid-cols-3">
          <input value={filters.campaign} onChange={(e) => setFilters({ ...filters, campaign: e.target.value })} className={input} placeholder="招募標題" />
          <input value={filters.referrer} onChange={(e) => setFilters({ ...filters, referrer: e.target.value })} className={input} placeholder="推薦人" />
          <input type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} className={input} />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
              <tr>
                <th className="px-4 py-3">招募標題</th>
                <th className="px-4 py-3">推薦人</th>
                <th className="px-4 py-3">被推薦老師</th>
                <th className="px-4 py-3">電話</th>
                <th className="px-4 py-3">備註</th>
                <th className="px-4 py-3">建立時間</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {referrals.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">{row.campaignTitle}</td>
                  <td className="px-4 py-3">{row.referrerName}</td>
                  <td className="px-4 py-3 font-semibold">{row.candidateName}</td>
                  <td className="px-4 py-3">{row.candidatePhone}</td>
                  <td className="px-4 py-3">{row.notes || "-"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{row.createdAt}</td>
                </tr>
              ))}
              {!referrals.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">尚無推薦資料。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
