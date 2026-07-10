import { NextRequest, NextResponse } from "next/server";
import { getTeacherResume } from "@/lib/teacherResume";
import { prisma } from "@/lib/prisma";
import { teacherTeachingProfiles } from "@/lib/teacherTeachingProfile";

type Params = { teacherId: string } | Promise<{ teacherId: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { teacherId } = await params;
  const id = Number(teacherId);
  const resume = await getTeacherResume(id);
  if (!resume) return NextResponse.json({ error: "找不到老師簡歷" }, { status: 404 });
  const profiles = await teacherTeachingProfiles(prisma, [id]);
  // 此端點為免登入的公開簡歷卡片：不可回傳老師電話/Email 等個資
  const { teacherPhone: _phone, teacherEmail: _email, ...publicResume } = resume;
  return NextResponse.json({ ...publicResume, teachingProfile: profiles.get(id) ?? null });
}
