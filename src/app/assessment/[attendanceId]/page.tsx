"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ASSESSMENT_GROUPS, emptyScores } from "@/lib/kindergartenAssessment";

type Info = {
  attendanceId: number;
  date: string;
  school: string;
  department: string;
  courseName: string;
  teacherName: string;
  semester: string;
  isFinalCourse: boolean;
  assessmentCount: number;
};

export default function KindergartenAssessmentForm() {
  const params = useParams<{ attendanceId: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [childName, setChildName] = useState("");
  const [semester, setSemester] = useState("");
  const [scores, setScores] = useState(emptyScores());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ id: number; comment: string; title: string } | null>(null);

  useEffect(() => {
    fetch(`/api/assessment/${params.attendanceId}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "讀取評量表失敗");
        return data;
      })
      .then((data: Info) => {
        setInfo(data);
        setSemester(data.semester);
      })
      .catch((e) => setError((e as Error).message || "讀取評量表失敗"))
      .finally(() => setLoading(false));
  }, [params.attendanceId]);

  function setScore(item: string, value: number) {
    setScores((current) => ({ ...current, [item]: value }));
  }

  async function submit() {
    if (!childName.trim()) {
      setError("請填寫孩子姓名");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/assessment/${params.attendanceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childName, semester, scores }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "儲存評量失敗");
      setResult(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message || "儲存評量失敗");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-md py-16 text-center text-slate-500">載入學期評量中...</div>;
  if (!info) return <div className="mx-auto max-w-md py-16 text-center text-red-500">{error || "找不到評量表"}</div>;

  return (
    <div className="mx-auto max-w-md pb-10">
      <div className="mb-4 rounded-b-[28px] bg-gradient-to-br from-[#F5EBDD] via-[#F9F6EF] to-[#DCE8DD] px-5 pb-6 pt-5 shadow-sm">
        <div className="text-xs font-semibold tracking-[0.2em] text-[#7B9E87]">UPBEAR GROWTH ASSESSMENT</div>
        <h1 className="mt-2 text-2xl font-bold text-[#2E2B27]">幼兒運動評量</h1>
        <div className="mt-4 rounded-2xl bg-white/75 p-4 text-sm text-slate-700 shadow-sm">
          <div className="font-semibold text-slate-900">{info.school}</div>
          <div className="mt-1">{info.date}｜{info.courseName}</div>
          <div className="mt-1 text-xs text-slate-500">學期：{semester}｜老師：{info.teacherName}</div>
        </div>
      </div>

      {result && (
        <div className="mb-4 rounded-2xl border border-green-100 bg-green-50 p-4 text-sm text-green-700">
          <div className="font-bold">評量完成：{result.title}</div>
          <p className="mt-2 leading-6">{result.comment}</p>
          <a href={`/assessments/${result.id}/certificate`} className="mt-3 block rounded-xl bg-[#3F6B55] px-4 py-3 text-center font-bold text-white">
            查看成果證書
          </a>
        </div>
      )}
      {error && <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">{error}</div>}
      {!info.isFinalCourse && (
        <div className="mb-4 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-700">
          這筆課程目前不是最後一堂，系統不需要進行學期末評量。
        </div>
      )}

      <div className="space-y-4">
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <label className="text-sm font-semibold text-slate-800">孩子姓名</label>
          <input value={childName} onChange={(e) => setChildName(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-lg font-semibold outline-none focus:border-[#7B9E87]"
            placeholder="請輸入孩子姓名" />
          <label className="mt-4 block text-sm font-semibold text-slate-800">學期名稱</label>
          <input value={semester} onChange={(e) => setSemester(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#7B9E87]" />
        </section>

        <section className="rounded-2xl bg-white p-4 text-xs leading-6 text-slate-600 shadow-sm">
          <div className="font-semibold text-slate-800">評分說明</div>
          <div>5分：表現優秀，明顯高於同齡</div>
          <div>3分：符合年齡發展</div>
          <div>1分：仍需較多引導</div>
        </section>

        {ASSESSMENT_GROUPS.map((group) => (
          <section key={group.title} className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-[#3F6B55]">{group.title}</h2>
            <div className="mt-3 space-y-4">
              {group.items.map((item) => (
                <div key={item}>
                  <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
                    <span>{item}</span>
                    <span className="text-[#B68A4C]">{scores[item]} 分</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button key={value} type="button" onClick={() => setScore(item, value)}
                        className={`rounded-xl border py-3 text-sm font-bold ${scores[item] === value ? "border-[#B68A4C] bg-[#F3E7D0] text-[#6E4C1E]" : "border-slate-200 bg-white text-slate-500"}`}>
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        <button onClick={submit} disabled={saving || !info.isFinalCourse}
          className="sticky bottom-4 w-full rounded-2xl bg-[#3F6B55] px-5 py-4 text-base font-bold text-white shadow-lg shadow-green-900/15 disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? "產生評量中..." : "完成評量並產生證書"}
        </button>
      </div>
    </div>
  );
}
