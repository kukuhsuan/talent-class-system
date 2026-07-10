import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auditLog";
import { getLineConfig, normalizeLineRegion, pushMessage } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { signTeacherResumeToken } from "@/lib/publicAccessToken";
import { ADMIN_ROLES, requireRole } from "@/lib/permissions";

type Params = { teacherId: string } | Promise<{ teacherId: string }>;

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://talent-class-system.vercel.app").replace(/\/$/, "");
}

function buildTeacherResumeRequestMessage(teacherName: string, url: string) {
  return {
    type: "flex",
    altText: "老師簡歷資料填寫",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "老師簡歷資料填寫", weight: "bold", size: "xl", color: "#1F3A5F", wrap: true },
          {
            type: "text",
            text: `${teacherName} 老師您好，想請您協助填寫公版簡歷資料，包含照片、學歷、教學經歷、專長與教學風格。填寫完成後，公司會整理成提供給園所參考的老師簡歷。`,
            size: "sm",
            color: "#334155",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "button", style: "primary", color: "#2563EB", action: { type: "uri", label: "填寫老師簡歷", uri: url } },
        ],
      },
    },
  };
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const auth = await requireRole(ADMIN_ROLES);
  if (auth.response) return auth.response;

  const { teacherId } = await params;
  const teacher = await prisma.teacher.findUnique({
    where: { id: Number(teacherId) },
    select: { id: true, name: true, lineUserId: true, lineRegion: true },
  });
  if (!teacher) return NextResponse.json({ error: "找不到老師" }, { status: 404 });
  if (!teacher.lineUserId) return NextResponse.json({ error: "老師尚未綁定 LINE" }, { status: 400 });

  const region = normalizeLineRegion(teacher.lineRegion || "north");
  const cfg = getLineConfig(region);
  if (!cfg.token) return NextResponse.json({ error: "LINE token 未設定" }, { status: 500 });

  const url = `${appUrl()}/teacher-resume/${encodeURIComponent(signTeacherResumeToken(teacher.id))}`;
  await pushMessage(teacher.lineUserId, [buildTeacherResumeRequestMessage(teacher.name, url)], cfg.token);
  await writeAuditLog(req, {
    action: "send_line",
    targetType: "TeacherResume",
    targetId: teacher.id,
    targetLabel: `老師簡歷：${teacher.name}`,
    afterData: { url, teacher: teacher.name },
    diffSummary: `發送老師簡歷填寫連結給 ${teacher.name}`,
  });

  return NextResponse.json({ ok: true, url });
}
