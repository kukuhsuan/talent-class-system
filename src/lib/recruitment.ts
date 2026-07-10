import { prisma } from "@/lib/prisma";
import { getLineConfig, normalizeLineRegion, pushMessage } from "@/lib/line";
import { signRecruitmentToken } from "@/lib/publicAccessToken";

export type RecruitmentCampaignInput = {
  title?: string;
  regions?: string;
  courses?: string;
  timeSlots?: string;
  description?: string;
  updatedBy?: string;
};

export type RecruitmentCampaign = Required<RecruitmentCampaignInput> & {
  id: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RecruitmentReferralInput = {
  campaignId: number;
  referrerTeacherId: number;
  candidateName?: string;
  candidatePhone?: string;
  notes?: string;
};

export type RecruitmentReferral = {
  id: number;
  campaignId: number;
  campaignTitle: string;
  referrerTeacherId: number;
  referrerName: string;
  candidateName: string;
  candidatePhone: string;
  notes: string;
  createdAt: string;
};

type RawCampaign = Omit<RecruitmentCampaign, "isActive"> & { isActive: boolean | number };
type RawReferral = RecruitmentReferral;

let recruitmentTablesReady = false;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function mapCampaign(row: RawCampaign): RecruitmentCampaign {
  return {
    ...row,
    id: Number(row.id),
    isActive: row.isActive === true || row.isActive === 1,
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  };
}

export async function ensureRecruitmentTables() {
  if (recruitmentTablesReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS RecruitmentCampaign (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '',
      regions TEXT NOT NULL DEFAULT '',
      courses TEXT NOT NULL DEFAULT '',
      timeSlots TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      updatedBy TEXT NOT NULL DEFAULT '',
      isActive BOOLEAN NOT NULL DEFAULT 1,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe("ALTER TABLE RecruitmentCampaign ADD COLUMN isActive BOOLEAN NOT NULL DEFAULT 1").catch(() => {});
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS RecruitmentReferral (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaignId INTEGER NOT NULL,
      referrerTeacherId INTEGER NOT NULL,
      candidateName TEXT NOT NULL DEFAULT '',
      candidatePhone TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS RecruitmentCampaign_createdAt_idx ON RecruitmentCampaign(createdAt)");
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS RecruitmentCampaign_isActive_idx ON RecruitmentCampaign(isActive)");
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS RecruitmentReferral_campaignId_idx ON RecruitmentReferral(campaignId)");
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS RecruitmentReferral_referrerTeacherId_idx ON RecruitmentReferral(referrerTeacherId)");
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS RecruitmentReferral_createdAt_idx ON RecruitmentReferral(createdAt)");
  recruitmentTablesReady = true;
}

export async function listRecruitmentCampaigns() {
  await ensureRecruitmentTables();
  const rows = await prisma.$queryRawUnsafe<RawCampaign[]>(
    "SELECT * FROM RecruitmentCampaign WHERE isActive = 1 ORDER BY id DESC LIMIT 100",
  );
  return rows.map(mapCampaign);
}

export async function getRecruitmentCampaign(id: number) {
  await ensureRecruitmentTables();
  const rows = await prisma.$queryRawUnsafe<RawCampaign[]>(
    "SELECT * FROM RecruitmentCampaign WHERE id = ? LIMIT 1",
    id,
  );
  return rows[0] ? mapCampaign(rows[0]) : null;
}

export async function deleteRecruitmentCampaign(id: number, updatedBy = "") {
  await ensureRecruitmentTables();
  await prisma.$executeRawUnsafe(
    "UPDATE RecruitmentCampaign SET isActive = 0, updatedBy = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
    clean(updatedBy),
    Number(id),
  );
  return getRecruitmentCampaign(id);
}

export async function createRecruitmentCampaign(input: RecruitmentCampaignInput) {
  await ensureRecruitmentTables();
  await prisma.$executeRawUnsafe(
    `INSERT INTO RecruitmentCampaign (title, regions, courses, timeSlots, description, updatedBy, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    clean(input.title),
    clean(input.regions),
    clean(input.courses),
    clean(input.timeSlots),
    clean(input.description),
    clean(input.updatedBy),
  );
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    "SELECT id FROM RecruitmentCampaign ORDER BY id DESC LIMIT 1",
  );
  return getRecruitmentCampaign(Number(rows[0]?.id ?? 0));
}

export async function listRecruitmentReferrals(filters: { campaign?: string; referrer?: string; date?: string } = {}) {
  await ensureRecruitmentTables();
  const where = ["1 = 1"];
  const args: unknown[] = [];
  if (filters.campaign?.trim()) {
    where.push("c.title LIKE ?");
    args.push(`%${filters.campaign.trim()}%`);
  }
  if (filters.referrer?.trim()) {
    where.push("t.name LIKE ?");
    args.push(`%${filters.referrer.trim()}%`);
  }
  if (filters.date?.trim()) {
    where.push("substr(r.createdAt, 1, 10) = ?");
    args.push(filters.date.slice(0, 10));
  }
  const rows = await prisma.$queryRawUnsafe<RawReferral[]>(
    `SELECT r.id, r.campaignId, c.title AS campaignTitle, r.referrerTeacherId, t.name AS referrerName,
            r.candidateName, r.candidatePhone, r.notes, r.createdAt
     FROM RecruitmentReferral r
     LEFT JOIN RecruitmentCampaign c ON c.id = r.campaignId
     LEFT JOIN Teacher t ON t.id = r.referrerTeacherId
     WHERE ${where.join(" AND ")}
     ORDER BY r.createdAt DESC, r.id DESC
     LIMIT 500`,
    ...args,
  );
  return rows.map((row) => ({
    ...row,
    id: Number(row.id),
    campaignId: Number(row.campaignId),
    referrerTeacherId: Number(row.referrerTeacherId),
    campaignTitle: row.campaignTitle || "",
    referrerName: row.referrerName || "",
    createdAt: String(row.createdAt ?? ""),
  }));
}

export async function createRecruitmentReferral(input: RecruitmentReferralInput) {
  await ensureRecruitmentTables();
  await prisma.$executeRawUnsafe(
    `INSERT INTO RecruitmentReferral (campaignId, referrerTeacherId, candidateName, candidatePhone, notes)
     VALUES (?, ?, ?, ?, ?)`,
    Number(input.campaignId),
    Number(input.referrerTeacherId),
    clean(input.candidateName),
    clean(input.candidatePhone),
    clean(input.notes),
  );
}

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://talent-class-system.vercel.app").replace(/\/$/, "");
}

export function buildRecruitmentLineMessage(campaign: RecruitmentCampaign, referralUrl: string) {
  const contents = [
    "各位老師好，目前我們正在招募新老師，想請大家協助推薦身邊適合的人選。",
    "",
    `需求地區：${campaign.regions || "未指定"}`,
    `需求課程：${campaign.courses || "未指定"}`,
    `需求時段：${campaign.timeSlots || "未指定"}`,
    `說明：${campaign.description || "歡迎推薦適合的老師。"}`,
    "",
    "如果身邊有適合的朋友，麻煩點選下方「我要推薦老師」，填寫姓名和電話即可，後續我們會再主動聯絡。",
    "",
    "謝謝老師們協助！",
  ].join("\n");

  return {
    type: "flex",
    altText: `全民招募：${campaign.title}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: campaign.title || "全民招募", weight: "bold", size: "xl", color: "#1F3A5F", wrap: true },
          { type: "text", text: contents, size: "sm", color: "#334155", wrap: true },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "button", style: "primary", color: "#2563EB", action: { type: "uri", label: "我要推薦老師", uri: referralUrl } },
        ],
      },
    },
  };
}

export async function sendRecruitmentCampaign(campaign: RecruitmentCampaign, options: { teacherId?: number; teacherName?: string } = {}) {
  const where: Record<string, unknown> = { lineUserId: { not: null } };
  if (options.teacherId) where.id = Number(options.teacherId);
  if (options.teacherName?.trim()) where.name = { contains: options.teacherName.trim() };
  const teachers = await prisma.teacher.findMany({
    where,
    select: { id: true, name: true, lineUserId: true, lineRegion: true },
    orderBy: { id: "asc" },
  });
  let sent = 0;
  const errors: string[] = [];
  if ((options.teacherId || options.teacherName) && teachers.length === 0) {
    return { sent: 0, failed: 1, errors: [`找不到已綁定 LINE 的老師：${options.teacherName || options.teacherId}`] };
  }
  for (const teacher of teachers) {
    if (!teacher.lineUserId) continue;
    const region = normalizeLineRegion(teacher.lineRegion || "north");
    const cfg = getLineConfig(region);
    if (!cfg.token) {
      errors.push(`${teacher.name}: LINE token 未設定`);
      continue;
    }
    const token = signRecruitmentToken(campaign.id, teacher.id);
    const url = `${appUrl()}/recruitment/${encodeURIComponent(token)}`;
    try {
      await pushMessage(teacher.lineUserId, [buildRecruitmentLineMessage(campaign, url)], cfg.token);
      sent += 1;
    } catch (error) {
      errors.push(`${teacher.name}: ${(error as Error).message}`);
    }
  }
  return { sent, failed: errors.length, errors };
}
