import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTeacherResume, upsertTeacherResume } from "@/lib/teacherResume";
import { verifyTeacherResumeToken } from "@/lib/publicAccessToken";

type Params = { token: string } | Promise<{ token: string }>;

async function context(token: string) {
  const { teacherId } = verifyTeacherResumeToken(decodeURIComponent(token));
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { id: true, name: true },
  });
  if (!teacher) throw new Error("找不到老師資料");
  const resume = await getTeacherResume(teacher.id);
  return { teacher, resume };
}

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  try {
    const { token } = await params;
    return NextResponse.json(await context(token));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "簡歷填寫連結無效" }, { status: 401 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Params }) {
  try {
    const { token } = await params;
    const { teacher } = await context(token);
    const body = await req.json().catch(() => ({}));
    const updated = await upsertTeacherResume(
      teacher.id,
      {
        photoUrl: body.photoUrl,
        education: body.education,
        experience: body.experience,
        teachingStyle: body.teachingStyle,
        specialties: body.specialties,
        intro: body.intro,
        certifications: body.certifications,
        updatedBy: teacher.name,
      },
      { submitted: true },
    );
    return NextResponse.json({ ok: true, resume: updated });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "簡歷資料送出失敗" }, { status: 400 });
  }
}
