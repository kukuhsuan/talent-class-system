import { NextRequest, NextResponse } from "next/server";
import { getTeacherResume } from "@/lib/teacherResume";
import { prisma } from "@/lib/prisma";
import { teacherTeachingProfiles } from "@/lib/teacherTeachingProfile";
import { verifyTeacherCardToken } from "@/lib/publicAccessToken";
import { currentSessionUser } from "@/lib/permissions";

type Params = { teacherId: string } | Promise<{ teacherId: string }>;

/**
 * 老師簡歷卡片。
 *
 * teacherId 是連號整數，這個端點原本完全沒有驗證且列在 proxy 的 PUBLIC_PREFIX 裡，
 * 等於任何人用迴圈跑 /1 /2 /3 就能把全公司師資名冊抓走。改成兩種來源才放行：
 *   1. 帶有效的 teacher_card 唯讀權杖，且權杖指向的就是這位老師（發給園所的連結）
 *   2. 已登入的後台帳號（行政自己點進去看）
 * 路徑仍留在 PUBLIC_PREFIX，因為園所沒有帳號、必須能免登入開啟；驗證改由本路由自己做。
 *
 * 用 teacher_card 而不是 teacher_resume：後者是發給老師本人填履歷的鑰匙，
 * 拿它可以打 /api/teacher-resumes/public/[token]，讀到未遮罩的電話 Email、甚至覆寫整份履歷。
 * 卡片連結會被轉貼到園所 LINE 群組，不能帶那種權限。
 */
export async function GET(req: NextRequest, { params }: { params: Params }) {
  const { teacherId } = await params;
  const id = Number(teacherId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "老師編號不正確" }, { status: 400 });
  }

  const token = req.nextUrl.searchParams.get("t")?.trim() ?? "";
  let allowed = false;
  if (token) {
    try {
      allowed = verifyTeacherCardToken(token).teacherId === id;
    } catch {
      allowed = false;
    }
  }
  if (!allowed) {
    const user = await currentSessionUser();
    allowed = Boolean(user?.userId);
  }
  if (!allowed) {
    return NextResponse.json({ error: "連結無效或已失效，請向承辦人索取新的連結" }, { status: 403 });
  }

  const resume = await getTeacherResume(id);
  if (!resume) return NextResponse.json({ error: "找不到老師簡歷" }, { status: 404 });
  const profiles = await teacherTeachingProfiles(prisma, [id]);
  // 卡片是給園所看的：不回傳老師電話/Email 等聯絡個資
  const { teacherPhone: _phone, teacherEmail: _email, ...publicResume } = resume;
  const photoQuery = token ? `?t=${encodeURIComponent(token)}` : "";
  return NextResponse.json({
    ...publicResume,
    // 不把 Blob 原始網址交給瀏覽器；由有權限檢查的同站端點代讀，
    // 同時避免跨來源圖片讓簡歷圖檔產生失敗。
    photoUrl: publicResume.photoUrl
      ? `/api/teacher-resumes/card/${id}/photo${photoQuery}`
      : "",
    teachingProfile: profiles.get(id) ?? null,
  });
}
