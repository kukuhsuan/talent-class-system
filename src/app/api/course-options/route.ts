import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { COURSE_OPTIONS, courseLabel } from "@/lib/courseMeta";

type RawCourseOption = { code: string; label: string; isActive?: boolean | number };
type RawCourseType = { courseType: string | null };

async function ensureCourseOptionTable() {
  await prisma.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS CourseOption (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, label TEXT NOT NULL, isActive BOOLEAN NOT NULL DEFAULT true, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  );
}

function cleanValue(value: unknown) {
  return String(value ?? "").trim();
}

function optionKey(label: string) {
  return label.trim().toLocaleLowerCase("zh-Hant");
}

function addOption(map: Map<string, { code: string; label: string }>, code: string, label?: string) {
  const cleanCode = cleanValue(code);
  if (!cleanCode) return;
  const cleanLabel = cleanValue(label) || courseLabel(cleanCode) || cleanCode;
  const key = optionKey(cleanLabel);
  if (!map.has(key)) map.set(key, { code: cleanCode, label: cleanLabel });
}

export async function GET() {
  await ensureCourseOptionTable();

  const optionRows = await prisma.$queryRawUnsafe<RawCourseOption[]>(
    "SELECT code, label, isActive FROM CourseOption WHERE isActive = true ORDER BY label ASC",
  );
  const courseRows = await prisma.$queryRawUnsafe<RawCourseType[]>(
    "SELECT DISTINCT courseType FROM Course WHERE courseType IS NOT NULL AND TRIM(courseType) != ''",
  );
  const progressRows = await prisma.$queryRawUnsafe<RawCourseType[]>(
    "SELECT DISTINCT courseType FROM CourseProgress WHERE courseType IS NOT NULL AND TRIM(courseType) != ''",
  );

  const options = new Map<string, { code: string; label: string }>();
  COURSE_OPTIONS.forEach((option) => addOption(options, option.code, option.label));
  optionRows.forEach((option) => addOption(options, option.code, option.label));
  courseRows.forEach((row) => addOption(options, row.courseType ?? ""));
  progressRows.forEach((row) => addOption(options, row.courseType ?? ""));

  return NextResponse.json(
    [...options.values()].sort((a, b) => a.label.localeCompare(b.label, "zh-Hant")),
  );
}

export async function POST(req: NextRequest) {
  await ensureCourseOptionTable();
  const data = await req.json();
  const label = cleanValue(data.label);
  const code = cleanValue(data.code) || label;

  if (!label) {
    return NextResponse.json({ error: "請輸入課程名稱" }, { status: 400 });
  }

  const existingDefaults = COURSE_OPTIONS.find((option) => optionKey(option.label) === optionKey(label));
  if (existingDefaults) {
    return NextResponse.json(existingDefaults, { status: 200 });
  }

  await prisma.$executeRawUnsafe(
    "INSERT INTO CourseOption (code, label, isActive) VALUES (?, ?, true) ON CONFLICT(code) DO UPDATE SET label = excluded.label, isActive = true",
    code,
    label,
  );

  return NextResponse.json({ code, label }, { status: 201 });
}
