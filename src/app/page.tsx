"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function Home() {
  const [seeded, setSeeded] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [stats, setStats] = useState({ teachers: 0, courses: 0, attendance: 0, substitutes: 0 });

  useEffect(() => {
    Promise.all([
      fetch("/api/teachers").then((r) => r.json()),
      fetch("/api/courses").then((r) => r.json()),
      fetch("/api/attendance").then((r) => r.json()),
      fetch("/api/substitutes").then((r) => r.json()),
    ]).then(([t, c, a, s]) => {
      setStats({ teachers: t.length, courses: c.length, attendance: a.length, substitutes: s.length });
      setSeeded(t.length > 0);
    });
  }, [seeded]);

  const handleSeed = async () => {
    setSeeding(true);
    await fetch("/api/seed", { method: "POST" });
    setSeeded(true);
    setSeeding(false);
  };

  const CARDS = [
    { href: "/teachers", icon: "👩‍🏫", label: "老師管理", desc: "設定老師時薪、車費", count: stats.teachers, unit: "位老師", color: "blue" },
    { href: "/courses", icon: "📚", label: "課程排班", desc: "管理固定排班課程", count: stats.courses, unit: "門課程", color: "green" },
    { href: "/attendance", icon: "✏️", label: "上課紀錄", desc: "每週填寫出席人數", count: stats.attendance, unit: "筆紀錄", color: "orange" },
    { href: "/substitutes", icon: "🔄", label: "代課紀錄", desc: "記錄請假與代課", count: stats.substitutes, unit: "筆代課", color: "red" },
    { href: "/salary", icon: "💰", label: "薪資計算", desc: "月薪資自動彙整", count: null, unit: "", color: "purple" },
  ];

  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 border-blue-200 hover:bg-blue-100",
    green: "bg-green-50 border-green-200 hover:bg-green-100",
    orange: "bg-orange-50 border-orange-200 hover:bg-orange-100",
    red: "bg-red-50 border-red-200 hover:bg-red-100",
    purple: "bg-purple-50 border-purple-200 hover:bg-purple-100",
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">才藝課管理系統</h1>
        <p className="text-slate-500">幼兒園才藝課程、老師上課與薪資管理</p>
      </div>

      {!seeded && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6 flex items-center justify-between">
          <div>
            <p className="font-semibold text-amber-800">首次使用 — 匯入現有資料</p>
            <p className="text-sm text-amber-600 mt-1">點選右方按鈕，將 Excel 表格中的老師和課程資料匯入系統</p>
          </div>
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="bg-amber-500 hover:bg-amber-600 text-white font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap ml-4"
          >
            {seeding ? "匯入中..." : "匯入資料"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className={`rounded-xl border p-5 transition-colors ${colorMap[c.color]}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-2xl">{c.icon}</span>
                <h2 className="text-lg font-semibold text-slate-800 mt-2">{c.label}</h2>
                <p className="text-sm text-slate-500 mt-0.5">{c.desc}</p>
              </div>
              {c.count !== null && (
                <div className="text-right">
                  <span className="text-2xl font-bold text-slate-700">{c.count}</span>
                  <p className="text-xs text-slate-500">{c.unit}</p>
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-700 mb-3">操作流程</h2>
        <ol className="space-y-2 text-sm text-slate-600">
          <li className="flex gap-3"><span className="bg-blue-100 text-blue-700 font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">1</span><span>在「老師管理」確認或新增老師時薪設定</span></li>
          <li className="flex gap-3"><span className="bg-blue-100 text-blue-700 font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">2</span><span>在「課程排班」設定本學期所有固定課程</span></li>
          <li className="flex gap-3"><span className="bg-blue-100 text-blue-700 font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">3</span><span>每週上課後在「上課紀錄」填入出席人數（代課時可修改上課老師）</span></li>
          <li className="flex gap-3"><span className="bg-blue-100 text-blue-700 font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">4</span><span>若有請假，在「代課紀錄」補充記錄</span></li>
          <li className="flex gap-3"><span className="bg-blue-100 text-blue-700 font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">5</span><span>月底在「薪資計算」選擇年月，自動產生所有老師薪資報表</span></li>
        </ol>
      </div>
    </div>
  );
}
