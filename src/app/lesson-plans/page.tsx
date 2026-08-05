import { listLessonTemplates } from "@/lib/lessonTemplates";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LessonPlansIndexPage() {
  // 抓取所有的教案
  const templates = await listLessonTemplates();

  // 取得所有不重複的課程名稱
  const courseTypes = Array.from(new Set(templates.map(t => t.courseType))).sort();

  return (
    <div className="max-w-5xl mx-auto py-12 px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-800">📚 幼兒園教案總覽</h1>
        <p className="mt-2 text-slate-500">點擊下方課程類別，查看各科目的完整教案與能力培養目標，並可一鍵推播給老師。</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {courseTypes.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
            目前還沒有教案資料，請先前往「系統管理 &gt; 教案庫同步」上傳 CSV 檔案。
          </div>
        ) : (
          courseTypes.map(course => (
            <Link 
              key={course}
              href={`/lesson-plan/${encodeURIComponent(course)}`}
              className="group block"
            >
              <div className="h-full bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer relative overflow-hidden">
                {/* 裝飾圖形 */}
                <div className="absolute right-0 top-0 w-24 h-24 bg-blue-50 rounded-bl-full -mr-4 -mt-4 group-hover:bg-blue-100 transition-colors"></div>
                
                <div className="relative">
                  <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                    {getCourseIcon(course)}
                  </div>
                  
                  <h3 className="text-xl font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                    {course} 教案
                  </h3>
                  
                  <div className="mt-3 text-sm text-slate-500 flex justify-between items-center">
                    <span>共 {templates.filter(t => t.courseType === course).length} 堂課</span>
                    <span className="text-blue-500 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                      查看詳情
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

// 簡單的 ICON 對應小幫手
function getCourseIcon(courseName: string) {
  if (courseName.includes("足球")) return "⚽️";
  if (courseName.includes("籃球")) return "🏀";
  if (courseName.includes("科學")) return "🔬";
  if (courseName.includes("體能")) return "🏃‍♂️";
  if (courseName.includes("美術") || courseName.includes("畫")) return "🎨";
  if (courseName.includes("音樂") || courseName.includes("琴")) return "🎵";
  if (courseName.includes("英文") || courseName.includes("美語")) return "🔤";
  if (courseName.includes("程式") || courseName.includes("積木")) return "🧩";
  if (courseName.includes("直排輪")) return "🛼";
  if (courseName.includes("桌遊")) return "🎲";
  if (courseName.includes("舞蹈") || courseName.includes("律動")) return "💃";
  return "📖";
}
