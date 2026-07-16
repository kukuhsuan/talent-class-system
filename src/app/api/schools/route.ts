import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeDepartment, normalizeRegion } from "@/lib/courseMeta";
import {
  courseConfirmationMapBySchoolIds,
  courseConfirmationSummary,
  ensureCourseConfirmationColumn,
  currentConfirmationTerm,
  parseCourseConfirmation,
  parseConfirmationTerm,
  termLabel,
  upsertSchoolStartConfirmation,
} from "@/lib/courseConfirmation";
import { writeAuditLog } from "@/lib/auditLog";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const minimal = searchParams.get("minimal") === "1";
  const term = parseConfirmationTerm({
    academicYear: searchParams.get("academicYear"),
    semester: searchParams.get("semester"),
  });
  const page = Math.max(1, Number(searchParams.get("page") ?? "0") || 0);
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "0") || 0;
  const pageSize = pageSizeRaw ? Math.min(50, Math.max(20, pageSizeRaw)) : 0;
  const search = (searchParams.get("search") ?? "").trim();
  const region = normalizeRegion(searchParams.get("region") ?? "");
  const rawType = (searchParams.get("type") ?? "").trim();
  const type = rawType ? normalizeDepartment(rawType) : "";
  const where: Record<string, unknown> = {};
  if (region) where.region = region;
  // 「未分類」代表篩選尚未設定類別的園所（type 為空字串）
  if (rawType) where.type = rawType === "未分類" ? "" : type;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { address: { contains: search } },
      { contact: { contains: search } },
      { phone: { contains: search } },
    ];
  }
  const query = { where, orderBy: [{ region: "asc" as const }, { name: "asc" as const }] };
  if (minimal) {
    const [schools, total] = await Promise.all([
      prisma.school.findMany({
        ...query,
        ...(pageSize ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
        select: { id: true, name: true, type: true, region: true, address: true, lineUserId: true, lineBindCode: true },
      }),
      pageSize ? prisma.school.count({ where }) : Promise.resolve(0),
    ]);
    if (pageSize) return NextResponse.json({ items: schools, total, page, pageSize });
    return NextResponse.json(schools);
  }

  await ensureCourseConfirmationColumn();
  const [schools, total] = await Promise.all([
    prisma.school.findMany({ ...query, ...(pageSize ? { skip: (page - 1) * pageSize, take: pageSize } : {}) }),
    pageSize ? prisma.school.count({ where }) : Promise.resolve(0),
  ]);
  const ids = schools.map((school) => school.id);
  const confirmationMap = await courseConfirmationMapBySchoolIds(ids, term);
  const items = schools.map((school) => {
    const courseConfirmation = confirmationMap.get(school.id) ?? parseCourseConfirmation({});
    return {
      ...school,
      courseConfirmation,
      courseConfirmationSummary: courseConfirmationSummary(courseConfirmation, { includeTerm: true, multiline: true }),
      confirmationTerm: { ...term, label: termLabel(term) },
    };
  });
  if (pageSize) return NextResponse.json({ items, total, page, pageSize });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  await ensureCourseConfirmationColumn();
  const data = await req.json();
  const term = parseConfirmationTerm(data.confirmationTerm ?? currentConfirmationTerm());
  const school = await prisma.school.create({
    data: {
      name: data.name,
      type: data.type ? normalizeDepartment(data.type) : "",
      region: normalizeRegion(data.region),
      address: data.address ?? "",
      phone: data.phone ?? "",
      contact: data.contact ?? "",
      notes: data.notes ?? "",
      lineUserId: typeof data.lineUserId === "string" ? data.lineUserId.trim() || null : undefined,
      lineBindCode: data.lineBindCode ?? undefined,
    },
  });
  let courseConfirmation = parseCourseConfirmation(data.courseConfirmation);
  if (data.courseConfirmation) {
    courseConfirmation = await upsertSchoolStartConfirmation(school.id, term, data.courseConfirmation, { submit: false });
  }
  await writeAuditLog(req, {
    action: "create",
    targetType: "School",
    targetId: school.id,
    targetLabel: `園所：${school.name}`,
    afterData: { ...school, courseConfirmation },
    diffSummary: `新增園所：${school.name}`,
  });
  return NextResponse.json({
    ...school,
    courseConfirmation,
    courseConfirmationSummary: courseConfirmationSummary(courseConfirmation, { includeTerm: true, multiline: true }),
    confirmationTerm: { ...term, label: termLabel(term) },
  });
}
