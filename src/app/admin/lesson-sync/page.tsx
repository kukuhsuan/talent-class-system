"use client";

import { useState } from "react";

export default function LessonSyncPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage("請先選擇 CSV 檔案");
      setIsSuccess(false);
      return;
    }

    setLoading(true);
    setMessage("");
    
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/lesson-sync", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "上傳失敗");
      }

      setIsSuccess(true);
      setMessage(`✅ 成功同步教案！共匯入 ${data.importedCount} 堂課。現在可以去「推播功能」查看最新教案囉！`);
      setFile(null); // clear file input
    } catch (err: any) {
      setIsSuccess(false);
      setMessage(`❌ 錯誤：${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-8 border-b border-slate-100 bg-slate-50">
          <h1 className="text-2xl font-black text-slate-800">教案資料庫同步中心</h1>
          <p className="mt-2 text-sm text-slate-500">
            請將 Google 試算表下載為 <strong>CSV 格式 (.csv)</strong> 後，在這裡上傳。<br/>
            系統會自動將資料轉換成「教案卡片格式」，供 LINE 推播系統使用。
          </p>
        </div>

        <div className="p-8">
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50 hover:bg-slate-100 transition-colors">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              id="csv-upload"
            />
            <label
              htmlFor="csv-upload"
              className="cursor-pointer flex flex-col items-center justify-center gap-3"
            >
              <svg className="w-10 h-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-sm font-medium text-blue-600 hover:text-blue-700">
                點擊選擇 CSV 檔案
              </span>
              {file && (
                <span className="text-xs text-slate-600 font-semibold bg-white px-3 py-1 rounded-full border border-slate-200">
                  已選取：{file.name}
                </span>
              )}
            </label>
          </div>

          {message && (
            <div className={`mt-6 p-4 rounded-lg text-sm ${isSuccess ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
              {message}
            </div>
          )}

          <div className="mt-8 flex justify-end">
            <button
              onClick={handleUpload}
              disabled={!file || loading}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  處理中...
                </>
              ) : (
                "開始同步教案"
              )}
            </button>
          </div>
        </div>
        
        <div className="bg-blue-50/50 p-6 border-t border-slate-100">
          <h3 className="text-sm font-bold text-slate-700 mb-2">💡 操作提示</h3>
          <ul className="text-xs text-slate-500 space-y-1.5 list-disc pl-4">
            <li>請到「教學資源平台」的 Google 試算表，點選 <strong>檔案 &gt; 下載 &gt; 逗號分隔值 (.csv)</strong>。</li>
            <li>每次上傳都會<strong>覆蓋並更新</strong>該課程的所有教案，確保推播時是最新版本。</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
