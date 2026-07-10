import { NextResponse } from "next/server";
import { listTeacherResumes } from "@/lib/teacherResume";
import { BACKOFFICE_ROLES, requireRole } from "@/lib/permissions";

export async function GET() {
  const auth = await requireRole(BACKOFFICE_ROLES);
  if (auth.response) return auth.response;
  return NextResponse.json(await listTeacherResumes());
}
