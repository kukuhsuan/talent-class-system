// 🔧 改進版計費邏輯 - 添加驗證和日誌

export async function buildSchoolInvoicePreview(input: {
  schoolId: number;
  year: number;
  month: number;
  months?: number[];
  brandName?: string;
  unitPrices?: unknown;
  billingTypes?: unknown;
  minChargeCounts?: unknown;
  notes?: string;
  taxType?: string;
}) {
  const school = await prisma.school.findUnique({ where: { id: input.schoolId } });
  if (!school) throw new Error("找不到園所");

  const months = normalizeInvoiceMonths(input.month, input.months);
  const monthRanges = months.map((month) => monthBounds(input.year, month));
  
  // 🔍 改進 1：分開查詢已計費和被排除的課程
  const rawRows = await prisma.attendance.findMany({
    where: {
      OR: monthRanges.map(({ start, end }) => ({ date: { gte: start, lt: end } })),
      cancelled: false,
      actualTeacher: { name: { not: WAITING_TEACHER_NAME } },
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

  // 🔍 改進 2：記錄被排除的課程（用於除錯）
  const allAttendance = await prisma.attendance.findMany({
    where: {
      OR: monthRanges.map(({ start, end }) => ({ date: { gte: start, lt: end } })),
      course: {
        OR: [
          { schoolId: input.schoolId },
          { school: school.name },
        ],
      },
    },
    include: {
      course: { select: { id: true, code: true, school: true } },
      actualTeacher: { select: { name: true } },
    },
  });

  const excludedReasons: Record<number, string> = {};
  
  for (const att of allAttendance) {
    if (!rawRows.find(r => r.id === att.id)) {
      // 找出被排除的原因
      if (att.cancelled) {
        excludedReasons[att.id] = "停課";
      } else if (att.actualTeacher?.name === WAITING_TEACHER_NAME) {
        excludedReasons[att.id] = "待排老師";
      } else {
        excludedReasons[att.id] = "其他";
      }
      
      // ⚠️ 警告日誌：如果排除的是「完成」課程，要特別注意
      if (!att.cancelled && att.actualTeacher?.name !== WAITING_TEACHER_NAME) {
        console.warn(`⚠️ 出勤被排除但不應該: ${att.course.code} ${att.date.toISOString()} 原因未知`);
      }
    }
  }

  // Demo 是公司推廣成本
  const rows = rawRows.filter((row) => normalizeCategory(row.category || row.course.category) !== "Demo");

  // 🔍 改進 3：驗證計費前的數據完整性
  console.log(`📊 計費統計 [${input.schoolId}]:`, {
    totalAttendance: allAttendance.length,
    billableAttendance: rows.length,
    excludedCount: allAttendance.length - rows.length,
    excludedReasons: Object.values(excludedReasons).reduce((acc, reason) => {
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  });

  // 🔍 改進 4：如果計費課程為 0，發出警告
  if (rows.length === 0 && allAttendance.length > 0) {
    console.error(`🚨 警告：月份 ${input.year}/${input.month} 有 ${allAttendance.length} 堂課但 0 堂計費！`);
    console.error("被排除的課程:", excludedReasons);
  }

  // 繼續原有邏輯...
  const scheduledTimeMap = await attendanceScheduledTimeMap(rows.map((row) => row.id));
  const unitPrices = normalizeUnitPrices(input.unitPrices);
  const billingTypes = normalizeBillingTypes(input.billingTypes);
  const minChargeCounts = normalizeMinChargeCounts(input.minChargeCounts);
  const groups = new Map<string, SchoolInvoiceItemSnapshot>();
  const periodLabel = months.map((month) => monthLabel(input.year, month)).join("、");

  for (const row of rows) {
    const key = row.course.courseType || "未分類";
    const courseName = courseLabel(row.course.courseType) || key;
    const scheduledTime = effectiveAttendanceTime({
      // ... 原有邏輯
    });
    // ... 繼續原有代碼
  }

  // 返回結果時附加除錯信息
  return {
    // ... 原有返回值
    _debug: {
      excludedCount: allAttendance.length - rows.length,
      excludedReasons,
      billableCount: rows.length,
    },
  };
}
