import { prisma } from "@/lib/prisma";
import { attendanceScheduledTimeMap, effectiveAttendanceTime } from "@/lib/attendanceTime";
import { courseLabel } from "@/lib/courseMeta";
import { WEEKDAYS } from "@/lib/courseDates";
import {
  defaultInvoiceBrand,
  invoiceCompanyForBrand,
  normalizeInvoiceBrand,
  type SchoolInvoiceBrand,
} from "@/lib/schoolInvoiceConfig";

const MONTH_LABELS = ["", "一月份", "二月份", "三月份", "四月份", "五月份", "六月份", "七月份", "八月份", "九月份", "十月份", "十一月份", "十二月份"];
export const BILLING_TYPES = ["perClass", "perPerson"] as const;
export type SchoolInvoiceBillingType = (typeof BILLING_TYPES)[number];

export type SchoolInvoiceDetailSnapshot = {
  attendanceId: number | null;
  date: string;
  weekday: string;
  time: string;
  hours: number;
  studentCount: number | null;
  billableCount: number | null;
  note: string;
};

export type SchoolInvoiceItemSnapshot = {
  id?: number;
  courseType: string;
  courseName: string;
  periodLabel: string;
  billingType: SchoolInvoiceBillingType;
  unitPrice: number;
  minChargeCount: number;
  quantity: number;
  quantityLabel: string;
  classCount: number;
  totalStudentCount: number;
  billableCount: number;
  totalHours: number;
  subtotal: number;
  note: string;
  details: SchoolInvoiceDetailSnapshot[];
};

export type SchoolInvoiceSnapshot = {
  id?: number;
  schoolId: number;
  schoolName: string;
  brandName: SchoolInvoiceBrand;
  invoiceMonth: string;
  invoiceDate: string;
  status: string;
  totalAmount: number;
  taxType: string;
  notes: string;
  companyName: string;
  phone: string;
  fax: string;
  bankName: string;
  bankAccount: string;
  accountName: string;
  items: SchoolInvoiceItemSnapshot[];
};

type AttendanceForInvoice = {
  id: number;
  date: Date;
  studentCount: number | null;
  studentCountA: number | null;
  studentCountB: number | null;
  category: string;
  hours: number;
  notes: string;
  reportContent: string;
  reportSentAt: Date | null;
  isPayrollLocked: boolean;
  course: {
    id: number;
    school: string;
    courseType: string;
    department: string;
    category: string;
    time: string;
  };
};

type InvoiceRow = {
  id: number;
  schoolId: number;
  schoolName: string;
  brandName: SchoolInvoiceBrand;
  invoiceMonth: string;
  invoiceDate: string | Date;
  status: string;
  totalAmount: number;
  taxType: string;
  notes: string;
  companyName: string;
  phone: string;
  fax: string;
  bankName: string;
  bankAccount: string;
  accountName: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

type InvoiceItemRow = {
  id: number;
  invoiceId: number;
  courseType: string;
  courseName: string;
  periodLabel: string;
  billingType?: SchoolInvoiceBillingType;
  unitPrice: number;
  minChargeCount?: number;
  quantity: number;
  quantityLabel?: string;
  actualStudentCount?: number;
  billableCount?: number;
  subtotal: number;
  note: string;
};

type InvoiceDetailRow = {
  id: number;
  invoiceItemId: number;
  attendanceId: number | null;
  date: string | Date;
  weekday: string;
  time: string;
  hours?: number;
  studentCount: number | null;
  billableCount?: number | null;
  note: string;
};

export function invoiceMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseInvoiceMonth(month: string) {
  const [yearRaw, monthRaw] = month.split("-");
  return { year: Number(yearRaw), month: Number(monthRaw) };
}

function monthBounds(year: number, month: number) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

function isoDate(value: Date | string) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function isoDateTime(value: Date | string | null | undefined) {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : String(value);
}

function weekdayOfDate(value: Date | string) {
  const iso = isoDate(value);
  return WEEKDAYS[new Date(`${iso}T00:00:00.000Z`).getUTCDay()];
}

function monthLabel(year: number, month: number) {
  void year;
  return MONTH_LABELS[month] ?? `${month}月份`;
}

function countOf(row: AttendanceForInvoice) {
  if (row.studentCount !== null && row.studentCount !== undefined) return row.studentCount;
  if (row.studentCountA !== null && row.studentCountA !== undefined && row.studentCountB !== null && row.studentCountB !== undefined) {
    return row.studentCountA + row.studentCountB;
  }
  return row.studentCountA ?? row.studentCountB ?? null;
}

function normalizeBillingType(value: unknown): SchoolInvoiceBillingType {
  return value === "perPerson" ? "perPerson" : "perClass";
}

function defaultBillingType(category: string | null | undefined) {
  return String(category ?? "").includes("課內") ? "perClass" : "perPerson";
}

function normalizeBillingTypes(input: unknown) {
  if (!input || typeof input !== "object") return new Map<string, SchoolInvoiceBillingType>();
  return new Map(Object.entries(input as Record<string, unknown>).map(([key, value]) => [key, normalizeBillingType(value)]));
}

function normalizeMinChargeCounts(input: unknown) {
  if (!input || typeof input !== "object") return new Map<string, number>();
  const entries = Object.entries(input as Record<string, unknown>);
  return new Map(entries.map(([key, value]) => [key, Math.max(0, Math.round(Number(value) || 0))]));
}

function quantityLabel(type: SchoolInvoiceBillingType) {
  return type === "perPerson" ? "人次" : "堂";
}

function sumHours(details: SchoolInvoiceDetailSnapshot[]) {
  return Math.round(details.reduce((sum, detail) => sum + (Number(detail.hours) || 0), 0) * 100) / 100;
}

function sumPeople(details: SchoolInvoiceDetailSnapshot[]) {
  return details.reduce((sum, detail) => sum + (Number(detail.studentCount) || 0), 0);
}

function sumBillablePeople(details: SchoolInvoiceDetailSnapshot[]) {
  return details.reduce((sum, detail) => sum + (Number(detail.billableCount) || 0), 0);
}

function noteFor(unitPrice: number, quantity: number, label: string, options: { actualStudentCount?: number; minChargeCount?: number; billingType?: SchoolInvoiceBillingType } = {}) {
  const base = unitPrice > 0
    ? `${unitPrice.toLocaleString("zh-TW")} 元 × ${quantity.toLocaleString("zh-TW")} ${label}`
    : `${quantity.toLocaleString("zh-TW")} ${label}`;
  if (
    options.billingType === "perPerson" &&
    options.minChargeCount &&
    options.actualStudentCount !== undefined &&
    quantity > options.actualStudentCount
  ) {
    return `${base}（實到 ${options.actualStudentCount.toLocaleString("zh-TW")} 人次，最低 ${options.minChargeCount.toLocaleString("zh-TW")} 人/堂計）`;
  }
  return base;
}

function normalizeUnitPrices(input: unknown) {
  if (!input || typeof input !== "object") return new Map<string, number>();
  const entries = Object.entries(input as Record<string, unknown>);
  return new Map(entries.map(([key, value]) => [key, Math.max(0, Math.round(Number(value) || 0))]));
}

let schoolInvoiceTablesReady = false;

export async function ensureSchoolInvoiceTables() {
  if (schoolInvoiceTablesReady) return;
  const sql = [
    `CREATE TABLE IF NOT EXISTS "SchoolInvoice" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "schoolId" INTEGER NOT NULL,
      "schoolName" TEXT NOT NULL,
      "brandName" TEXT NOT NULL,
      "invoiceMonth" TEXT NOT NULL,
      "invoiceDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "status" TEXT NOT NULL DEFAULT '已產生',
      "totalAmount" INTEGER NOT NULL DEFAULT 0,
      "taxType" TEXT NOT NULL DEFAULT '未稅',
      "notes" TEXT NOT NULL DEFAULT '',
      "companyName" TEXT NOT NULL DEFAULT '威斯博國際股份有限公司',
      "phone" TEXT NOT NULL DEFAULT '',
      "fax" TEXT NOT NULL DEFAULT '',
      "bankName" TEXT NOT NULL DEFAULT '',
      "bankAccount" TEXT NOT NULL DEFAULT '',
      "accountName" TEXT NOT NULL DEFAULT '威斯博國際股份有限公司',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "SchoolInvoiceItem" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "invoiceId" INTEGER NOT NULL,
      "courseType" TEXT NOT NULL,
      "courseName" TEXT NOT NULL,
      "periodLabel" TEXT NOT NULL,
      "billingType" TEXT NOT NULL DEFAULT 'perClass',
      "unitPrice" INTEGER NOT NULL DEFAULT 0,
      "minChargeCount" INTEGER NOT NULL DEFAULT 0,
      "quantity" INTEGER NOT NULL DEFAULT 0,
      "quantityLabel" TEXT NOT NULL DEFAULT '堂',
      "actualStudentCount" INTEGER NOT NULL DEFAULT 0,
      "billableCount" INTEGER NOT NULL DEFAULT 0,
      "subtotal" INTEGER NOT NULL DEFAULT 0,
      "note" TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS "SchoolInvoiceDetail" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "invoiceItemId" INTEGER NOT NULL,
      "attendanceId" INTEGER,
      "date" DATETIME NOT NULL,
      "weekday" TEXT NOT NULL,
      "time" TEXT NOT NULL DEFAULT '',
      "hours" REAL NOT NULL DEFAULT 0,
      "studentCount" INTEGER,
      "billableCount" INTEGER,
      "note" TEXT NOT NULL DEFAULT ''
    )`,
    'ALTER TABLE "SchoolInvoiceItem" ADD COLUMN "billingType" TEXT NOT NULL DEFAULT \'perClass\'',
    'ALTER TABLE "SchoolInvoiceItem" ADD COLUMN "quantityLabel" TEXT NOT NULL DEFAULT \'堂\'',
    'ALTER TABLE "SchoolInvoiceItem" ADD COLUMN "minChargeCount" INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE "SchoolInvoiceItem" ADD COLUMN "actualStudentCount" INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE "SchoolInvoiceItem" ADD COLUMN "billableCount" INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE "SchoolInvoiceDetail" ADD COLUMN "hours" REAL NOT NULL DEFAULT 0',
    'ALTER TABLE "SchoolInvoiceDetail" ADD COLUMN "billableCount" INTEGER',
    'CREATE INDEX IF NOT EXISTS "SchoolInvoice_schoolId_invoiceMonth_idx" ON "SchoolInvoice"("schoolId", "invoiceMonth")',
    'CREATE INDEX IF NOT EXISTS "SchoolInvoice_invoiceMonth_idx" ON "SchoolInvoice"("invoiceMonth")',
    'CREATE INDEX IF NOT EXISTS "SchoolInvoice_status_idx" ON "SchoolInvoice"("status")',
    'CREATE INDEX IF NOT EXISTS "SchoolInvoiceItem_invoiceId_idx" ON "SchoolInvoiceItem"("invoiceId")',
    'CREATE INDEX IF NOT EXISTS "SchoolInvoiceDetail_invoiceItemId_idx" ON "SchoolInvoiceDetail"("invoiceItemId")',
    'CREATE INDEX IF NOT EXISTS "SchoolInvoiceDetail_attendanceId_idx" ON "SchoolInvoiceDetail"("attendanceId")',
  ];
  for (const statement of sql) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/duplicate column|already exists/i.test(message)) throw error;
    }
  }
  schoolInvoiceTablesReady = true;
}

export async function buildSchoolInvoicePreview(input: {
  schoolId: number;
  year: number;
  month: number;
  brandName?: string;
  unitPrices?: unknown;
  billingTypes?: unknown;
  minChargeCounts?: unknown;
  notes?: string;
  taxType?: string;
}) {
  const school = await prisma.school.findUnique({ where: { id: input.schoolId } });
  if (!school) throw new Error("找不到園所");

  const { start, end } = monthBounds(input.year, input.month);
  const rows = await prisma.attendance.findMany({
    where: {
      date: { gte: start, lt: end },
      cancelled: false,
      course: {
        OR: [
          { schoolId: input.schoolId },
          { school: school.name },
        ],
      },
    },
    include: {
      course: { select: { id: true, school: true, courseType: true, department: true, category: true, time: true } },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  }) as unknown as AttendanceForInvoice[];

  const scheduledTimeMap = await attendanceScheduledTimeMap(rows.map((row) => row.id));
  const unitPrices = normalizeUnitPrices(input.unitPrices);
  const billingTypes = normalizeBillingTypes(input.billingTypes);
  const minChargeCounts = normalizeMinChargeCounts(input.minChargeCounts);
  const groups = new Map<string, SchoolInvoiceItemSnapshot>();
  const periodLabel = monthLabel(input.year, input.month);

  for (const row of rows) {
    const key = row.course.courseType || "未分類";
    const courseName = courseLabel(row.course.courseType) || key;
    const scheduledTime = effectiveAttendanceTime({
      scheduledTime: scheduledTimeMap.get(row.id),
      courseTime: row.course.time,
      attendanceHours: row.hours,
      isPayrollLocked: row.isPayrollLocked,
      reportContent: row.reportContent,
      reportSentAt: row.reportSentAt,
      studentCount: row.studentCount,
      studentCountA: row.studentCountA,
      studentCountB: row.studentCountB,
    });
    if (!groups.has(key)) {
      groups.set(key, {
        courseType: key,
        courseName,
        periodLabel,
        billingType: billingTypes.get(key) ?? defaultBillingType(row.category || row.course.category),
        unitPrice: unitPrices.get(key) ?? 0,
        minChargeCount: minChargeCounts.get(key) ?? 0,
        quantity: 0,
        quantityLabel: "堂",
        classCount: 0,
        totalStudentCount: 0,
        billableCount: 0,
        totalHours: 0,
        subtotal: 0,
        note: "",
        details: [],
      });
    }
    const group = groups.get(key)!;
    const actualCount = countOf(row);
    group.details.push({
      attendanceId: row.id,
      date: isoDate(row.date),
      weekday: weekdayOfDate(row.date),
      time: scheduledTime,
      hours: Number(row.hours) || 0,
      studentCount: actualCount,
      billableCount: actualCount,
      note: row.notes ?? "",
    });
  }

  const items = [...groups.values()].map((item) => {
    const classCount = item.details.length;
    const totalStudentCount = sumPeople(item.details);
    const totalHours = sumHours(item.details);
    const billingType = billingTypes.get(item.courseType) ?? item.billingType;
    const minChargeCount = minChargeCounts.get(item.courseType) ?? item.minChargeCount ?? 0;
    const details = item.details.map((detail) => ({
      ...detail,
      billableCount: billingType === "perPerson"
        ? Math.max(Number(detail.studentCount) || 0, minChargeCount)
        : detail.studentCount,
    }));
    const billableCount = sumBillablePeople(details);
    const label = quantityLabel(billingType);
    const quantity = billingType === "perPerson" ? billableCount : classCount;
    const subtotal = item.unitPrice * quantity;
    return {
      ...item,
      billingType,
      minChargeCount,
      quantity,
      quantityLabel: label,
      classCount,
      totalStudentCount,
      billableCount,
      totalHours,
      subtotal,
      note: noteFor(item.unitPrice, quantity, label, { actualStudentCount: totalStudentCount, minChargeCount, billingType }),
      details,
    };
  });

  const brand = normalizeInvoiceBrand(input.brandName) || defaultInvoiceBrand(rows.map((row) => row.course.department), school.type);
  const company = invoiceCompanyForBrand(brand);
  const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

  return {
    schoolId: school.id,
    schoolName: school.name,
    brandName: brand,
    invoiceMonth: invoiceMonthKey(input.year, input.month),
    invoiceDate: new Date().toISOString(),
    status: "草稿",
    totalAmount,
    taxType: input.taxType || "未稅",
    notes: String(input.notes ?? ""),
    ...company,
    items,
  } satisfies SchoolInvoiceSnapshot;
}

export async function createSchoolInvoice(input: {
  schoolId: number;
  year: number;
  month: number;
  brandName?: string;
  unitPrices?: unknown;
  billingTypes?: unknown;
  minChargeCounts?: unknown;
  notes?: string;
  taxType?: string;
  status?: string;
}) {
  await ensureSchoolInvoiceTables();
  const preview = await buildSchoolInvoicePreview(input);
  const status = input.status === "草稿" ? "草稿" : "已產生";
  const invoiceDate = new Date().toISOString();

  return await prisma.$transaction(async (tx) => {
    const invoiceRows = await tx.$queryRawUnsafe<Array<{ id: number }>>(
      `INSERT INTO "SchoolInvoice"
        ("schoolId", "schoolName", "brandName", "invoiceMonth", "invoiceDate", "status", "totalAmount", "taxType", "notes", "companyName", "phone", "fax", "bankName", "bankAccount", "accountName", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING "id"`,
      preview.schoolId,
      preview.schoolName,
      preview.brandName,
      preview.invoiceMonth,
      invoiceDate,
      status,
      preview.totalAmount,
      preview.taxType,
      preview.notes,
      preview.companyName,
      preview.phone,
      preview.fax,
      preview.bankName,
      preview.bankAccount,
      preview.accountName,
    );
    const invoiceId = Number(invoiceRows[0]?.id);
    if (!invoiceId) throw new Error("請款單建立失敗");

    for (const item of preview.items) {
      const itemRows = await tx.$queryRawUnsafe<Array<{ id: number }>>(
        `INSERT INTO "SchoolInvoiceItem"
          ("invoiceId", "courseType", "courseName", "periodLabel", "billingType", "unitPrice", "minChargeCount", "quantity", "quantityLabel", "actualStudentCount", "billableCount", "subtotal", "note")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING "id"`,
        invoiceId,
        item.courseType,
        item.courseName,
        item.periodLabel,
        item.billingType,
        item.unitPrice,
        item.minChargeCount,
        item.quantity,
        item.quantityLabel,
        item.totalStudentCount,
        item.billableCount,
        item.subtotal,
        item.note,
      );
      const itemId = Number(itemRows[0]?.id);
      for (const detail of item.details) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "SchoolInvoiceDetail"
            ("invoiceItemId", "attendanceId", "date", "weekday", "time", "hours", "studentCount", "billableCount", "note")
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          itemId,
          detail.attendanceId,
          `${detail.date}T00:00:00.000Z`,
          detail.weekday,
          detail.time,
          detail.hours,
          detail.studentCount,
          detail.billableCount,
          detail.note,
        );
      }
    }

    return await readSchoolInvoice(invoiceId, tx, false);
  });
}

export async function listSchoolInvoices(options: { year?: number; month?: number; schoolId?: number } = {}) {
  await ensureSchoolInvoiceTables();
  const where: string[] = [];
  const args: unknown[] = [];
  if (options.year && options.month) {
    where.push('"invoiceMonth" = ?');
    args.push(invoiceMonthKey(options.year, options.month));
  }
  if (options.schoolId) {
    where.push('"schoolId" = ?');
    args.push(options.schoolId);
  }
  const rows = await prisma.$queryRawUnsafe<InvoiceRow[]>(
    `SELECT * FROM "SchoolInvoice"${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY "createdAt" DESC, "id" DESC LIMIT 100`,
    ...args,
  );
  return rows.map((row) => ({
    ...row,
    invoiceDate: isoDateTime(row.invoiceDate),
    createdAt: isoDateTime(row.createdAt),
    updatedAt: isoDateTime(row.updatedAt),
  }));
}

export async function readSchoolInvoice(id: number, client: Pick<typeof prisma, "$queryRawUnsafe"> = prisma, ensureTables = true) {
  if (ensureTables) await ensureSchoolInvoiceTables();
  const invoiceRows = await client.$queryRawUnsafe<InvoiceRow[]>(
    'SELECT * FROM "SchoolInvoice" WHERE "id" = ? LIMIT 1',
    id,
  );
  const invoice = invoiceRows[0];
  if (!invoice) return null;

  const itemRows = await client.$queryRawUnsafe<InvoiceItemRow[]>(
    'SELECT * FROM "SchoolInvoiceItem" WHERE "invoiceId" = ? ORDER BY "id" ASC',
    id,
  );
  const detailRows = itemRows.length
    ? await client.$queryRawUnsafe<InvoiceDetailRow[]>(
        `SELECT * FROM "SchoolInvoiceDetail" WHERE "invoiceItemId" IN (${itemRows.map(() => "?").join(",")}) ORDER BY "date" ASC, "id" ASC`,
        ...itemRows.map((item) => item.id),
      )
    : [];
  const detailsByItem = new Map<number, InvoiceDetailRow[]>();
  for (const detail of detailRows) {
    detailsByItem.set(detail.invoiceItemId, [...(detailsByItem.get(detail.invoiceItemId) ?? []), detail]);
  }

  return {
    ...invoice,
    companyName: invoice.companyName || invoiceCompanyForBrand(invoice.brandName).companyName,
    phone: invoice.phone || invoiceCompanyForBrand(invoice.brandName).phone,
    fax: invoice.fax || invoiceCompanyForBrand(invoice.brandName).fax,
    bankName: invoice.bankName || invoiceCompanyForBrand(invoice.brandName).bankName,
    bankAccount: invoice.bankAccount || invoiceCompanyForBrand(invoice.brandName).bankAccount,
    accountName: invoice.accountName || invoiceCompanyForBrand(invoice.brandName).accountName,
    invoiceDate: isoDateTime(invoice.invoiceDate),
    items: itemRows.map((item) => {
      const details = (detailsByItem.get(item.id) ?? []).map((detail) => ({
        attendanceId: detail.attendanceId,
        date: isoDate(detail.date),
        weekday: detail.weekday,
        time: detail.time,
        hours: Number(detail.hours) || 0,
        studentCount: detail.studentCount,
        billableCount: detail.billableCount ?? detail.studentCount,
        note: detail.note,
      }));
      const billingType = normalizeBillingType(item.billingType);
      const classCount = details.length;
      const totalStudentCount = sumPeople(details);
      const storedActualStudentCount = Number(item.actualStudentCount) || 0;
      const storedBillableCount = Number(item.billableCount) || 0;
      const billableCount = billingType === "perPerson"
        ? storedBillableCount || sumBillablePeople(details)
        : storedBillableCount || Number(item.quantity) || 0;
      const totalHours = sumHours(details);
      return {
        ...item,
        billingType,
        minChargeCount: item.minChargeCount ?? 0,
        quantityLabel: item.quantityLabel || quantityLabel(billingType),
        classCount,
        totalStudentCount: storedActualStudentCount || totalStudentCount,
        billableCount,
        totalHours,
        details,
      };
    }),
  } satisfies SchoolInvoiceSnapshot & { id: number };
}

export async function deleteSchoolInvoice(id: number) {
  await ensureSchoolInvoiceTables();
  const existing = await readSchoolInvoice(id);
  if (!existing) return null;
  await prisma.$transaction(async (tx) => {
    const itemRows = await tx.$queryRawUnsafe<Array<{ id: number }>>(
      'SELECT "id" FROM "SchoolInvoiceItem" WHERE "invoiceId" = ?',
      id,
    );
    if (itemRows.length) {
      await tx.$executeRawUnsafe(
        `DELETE FROM "SchoolInvoiceDetail" WHERE "invoiceItemId" IN (${itemRows.map(() => "?").join(",")})`,
        ...itemRows.map((item) => item.id),
      );
    }
    await tx.$executeRawUnsafe('DELETE FROM "SchoolInvoiceItem" WHERE "invoiceId" = ?', id);
    await tx.$executeRawUnsafe('DELETE FROM "SchoolInvoice" WHERE "id" = ?', id);
  });
  return existing;
}

export async function updateSchoolInvoiceStatus(id: number, status: string) {
  await ensureSchoolInvoiceTables();
  const allowed = new Set(["草稿", "已產生", "已寄出", "已收款", "已作廢"]);
  const next = allowed.has(status) ? status : "已產生";
  await prisma.$executeRawUnsafe(
    'UPDATE "SchoolInvoice" SET "status" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?',
    next,
    id,
  );
  return readSchoolInvoice(id);
}

export function parseInvoiceRequest(body: Record<string, unknown>) {
  const schoolId = Number(body.schoolId);
  const year = Number(body.year);
  const month = Number(body.month);
  if (!Number.isFinite(schoolId) || schoolId <= 0) throw new Error("請選擇園所");
  if (!Number.isFinite(year) || year < 2024 || year > 2100) throw new Error("請選擇年份");
  if (!Number.isFinite(month) || month < 1 || month > 12) throw new Error("請選擇月份");
  return {
    schoolId,
    year,
    month,
    brandName: String(body.brandName ?? ""),
    unitPrices: body.unitPrices,
    billingTypes: body.billingTypes,
    minChargeCounts: body.minChargeCounts,
    notes: String(body.notes ?? ""),
    taxType: String(body.taxType ?? "未稅"),
    status: String(body.status ?? "已產生"),
  };
}

export function invoicePeriodLabel(invoiceMonth: string) {
  const { year, month } = parseInvoiceMonth(invoiceMonth);
  return `${year} 年 ${month} 月`;
}
