import { prisma } from "@/lib/prisma";
import { signTeacherResumeToken } from "@/lib/publicAccessToken";

export type TeacherResumeInput = {
  photoUrl?: string;
  education?: string;
  experience?: string;
  teachingStyle?: string;
  specialties?: string;
  intro?: string;
  certifications?: string;
  updatedBy?: string;
};

export type TeacherResumeRow = Required<TeacherResumeInput> & {
  id: number;
  teacherId: number;
  teacherName: string;
  teacherPhone: string;
  teacherEmail: string;
  status: string;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
};

type RawTeacherResumeRow = TeacherResumeRow;

let teacherResumeTablesReady = false;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://talent-class-system.vercel.app").replace(/\/$/, "");
}

function mapRow(row: RawTeacherResumeRow): TeacherResumeRow {
  return {
    ...row,
    id: Number(row.id ?? 0),
    teacherId: Number(row.teacherId),
    teacherName: row.teacherName || "",
    teacherPhone: row.teacherPhone || "",
    teacherEmail: row.teacherEmail || "",
    photoUrl: row.photoUrl || "",
    education: row.education || "",
    experience: row.experience || "",
    teachingStyle: row.teachingStyle || "",
    specialties: row.specialties || "",
    intro: row.intro || "",
    certifications: row.certifications || "",
    status: row.status || "未填寫",
    updatedBy: row.updatedBy || "",
    submittedAt: String(row.submittedAt ?? ""),
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  };
}

export async function ensureTeacherResumeTables() {
  if (teacherResumeTablesReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS TeacherResume (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacherId INTEGER NOT NULL UNIQUE,
      photoUrl TEXT NOT NULL DEFAULT '',
      education TEXT NOT NULL DEFAULT '',
      experience TEXT NOT NULL DEFAULT '',
      teachingStyle TEXT NOT NULL DEFAULT '',
      specialties TEXT NOT NULL DEFAULT '',
      intro TEXT NOT NULL DEFAULT '',
      certifications TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '未填寫',
      updatedBy TEXT NOT NULL DEFAULT '',
      submittedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS TeacherResume_teacherId_idx ON TeacherResume(teacherId)");
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS TeacherResume_status_idx ON TeacherResume(status)");
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS TeacherResume_updatedAt_idx ON TeacherResume(updatedAt)");
  teacherResumeTablesReady = true;
}

export async function listTeacherResumes() {
  await ensureTeacherResumeTables();
  const rows = await prisma.$queryRawUnsafe<RawTeacherResumeRow[]>(`
    SELECT
      COALESCE(r.id, 0) AS id,
      t.id AS teacherId,
      t.name AS teacherName,
      t.phone AS teacherPhone,
      t.email AS teacherEmail,
      COALESCE(r.photoUrl, '') AS photoUrl,
      COALESCE(r.education, '') AS education,
      COALESCE(r.experience, '') AS experience,
      COALESCE(r.teachingStyle, '') AS teachingStyle,
      COALESCE(r.specialties, '') AS specialties,
      COALESCE(r.intro, '') AS intro,
      COALESCE(r.certifications, '') AS certifications,
      COALESCE(r.status, '未填寫') AS status,
      COALESCE(r.updatedBy, '') AS updatedBy,
      COALESCE(r.submittedAt, '') AS submittedAt,
      COALESCE(r.createdAt, '') AS createdAt,
      COALESCE(r.updatedAt, '') AS updatedAt
    FROM Teacher t
    LEFT JOIN TeacherResume r ON r.teacherId = t.id
    ORDER BY t.name ASC
  `);
  return rows.map((row) => {
    const mapped = mapRow(row);
    return {
      ...mapped,
      collectUrl: `${appUrl()}/teacher-resume/${encodeURIComponent(signTeacherResumeToken(mapped.teacherId))}`,
      cardUrl: `${appUrl()}/teacher-card/${mapped.teacherId}`,
    };
  });
}

export async function getTeacherResume(teacherId: number) {
  await ensureTeacherResumeTables();
  const rows = await prisma.$queryRawUnsafe<RawTeacherResumeRow[]>(`
    SELECT
      COALESCE(r.id, 0) AS id,
      t.id AS teacherId,
      t.name AS teacherName,
      t.phone AS teacherPhone,
      t.email AS teacherEmail,
      COALESCE(r.photoUrl, '') AS photoUrl,
      COALESCE(r.education, '') AS education,
      COALESCE(r.experience, '') AS experience,
      COALESCE(r.teachingStyle, '') AS teachingStyle,
      COALESCE(r.specialties, '') AS specialties,
      COALESCE(r.intro, '') AS intro,
      COALESCE(r.certifications, '') AS certifications,
      COALESCE(r.status, '未填寫') AS status,
      COALESCE(r.updatedBy, '') AS updatedBy,
      COALESCE(r.submittedAt, '') AS submittedAt,
      COALESCE(r.createdAt, '') AS createdAt,
      COALESCE(r.updatedAt, '') AS updatedAt
    FROM Teacher t
    LEFT JOIN TeacherResume r ON r.teacherId = t.id
    WHERE t.id = ?
    LIMIT 1
  `, Number(teacherId));
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function upsertTeacherResume(teacherId: number, input: TeacherResumeInput, options: { submitted?: boolean } = {}) {
  await ensureTeacherResumeTables();
  const existing = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    "SELECT id FROM TeacherResume WHERE teacherId = ? LIMIT 1",
    Number(teacherId),
  );
  const status = options.submitted ? "已填寫" : "草稿";
  if (existing[0]) {
    await prisma.$executeRawUnsafe(
      `UPDATE TeacherResume
       SET photoUrl = ?, education = ?, experience = ?, teachingStyle = ?, specialties = ?, intro = ?, certifications = ?,
           status = ?, updatedBy = ?, updatedAt = CURRENT_TIMESTAMP,
           submittedAt = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE submittedAt END
       WHERE teacherId = ?`,
      clean(input.photoUrl),
      clean(input.education),
      clean(input.experience),
      clean(input.teachingStyle),
      clean(input.specialties),
      clean(input.intro),
      clean(input.certifications),
      status,
      clean(input.updatedBy),
      options.submitted ? 1 : 0,
      Number(teacherId),
    );
  } else {
    await prisma.$executeRawUnsafe(
      `INSERT INTO TeacherResume
       (teacherId, photoUrl, education, experience, teachingStyle, specialties, intro, certifications, status, updatedBy, submittedAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END, CURRENT_TIMESTAMP)`,
      Number(teacherId),
      clean(input.photoUrl),
      clean(input.education),
      clean(input.experience),
      clean(input.teachingStyle),
      clean(input.specialties),
      clean(input.intro),
      clean(input.certifications),
      status,
      clean(input.updatedBy),
      options.submitted ? 1 : 0,
    );
  }
  return getTeacherResume(teacherId);
}
