import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAttendancesForUniqueDays } from "@/lib/attendanceBatch";
import { pruneFutureUnreportedAttendanceDates, stampAttendanceTime, syncFutureUnreportedAttendanceAssistant, syncFutureUnreportedAttendanceCategory, syncFutureUnreportedAttendanceHours, syncFutureUnreportedAttendanceTeacher, syncFutureUnreportedAttendanceTime, syncUnreportedWaitingTeacherAttendance } from "@/lib/attendanceTime";
import { expandIsoDateRange, expandWeeklyDates, parseCourseDateInput, weekdayOfIso } from "@/lib/courseDates";
import { normalizeCategory, normalizeDepartment, normalizeRegion } from "@/lib/courseMeta";
import { coursePayrollHoursForAttendance, coursePayrollHoursMap, parsePayrollHours, setCoursePayrollHours } from "@/lib/payrollHours";
import { recurrenceFields } from "@/lib/courseRecurrence";
import { diffSummary, writeAuditLog } from "@/lib/auditLog";
import { courseTermOverride, notesWithCourseTerm } from "@/lib/courseTerm";
import { invalidVersionResponse, isRecordNotFound, parseExpectedVersion, versionConflictResponse, versionWhere } from "@/lib/optimisticLock";
import { courseScheduleConflictMessage, findCourseScheduleConflict } from "@/lib/courseScheduleConflict";

// GET /api/courses/[id] — returns single course with scheduledDates (for edit form)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const course = await prisma.course.findUnique({
    where: { id: Number(id) },
    include: {
      teacher: true,
      assistantTeacher: true,
      schoolRel: true,
      attendances: { select: { date: true }, orderBy: { date: "asc" } },
    },
  });
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { coursePayrollHoursMap } = await import("@/lib/payrollHours");
  const payrollMap = await coursePayrollHoursMap([course.id]);

  return NextResponse.json({
    ...course,
    academicTermOverride: courseTermOverride(course.notes),
    payrollHours: payrollMap.get(course.id) ?? null,
    scheduledDates: [...new Set(course.attendances.map((a) => a.date.toISOString().slice(0, 10)))],
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { schoolRel, teacher, assistantTeacher, scheduledDates, ...data } = await req.json();
    void schoolRel; void teacher; void assistantTeacher;
    const courseId = Number(id);
    const code = String(data.code ?? "").trim();
    const schoolId = Number(data.schoolId);
    if (!Number.isInteger(schoolId) || schoolId <= 0) {
      return NextResponse.json({ error: "請從園所清單選擇正式園所後再儲存，避免請款資料遺漏" }, { status: 400 });
    }
    const selectedSchool = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, region: true, type: true, address: true },
    });
    if (!selectedSchool) {
      return NextResponse.json({ error: "選擇的園所不存在或已被移除，請重新選擇" }, { status: 400 });
    }

    const [existing, currentCourse] = await Promise.all([
      code
        ? prisma.course.findFirst({
            where: { code },
            include: { teacher: { select: { name: true } } },
          })
        : null,
      prisma.course.findUnique({
        where: { id: courseId },
        include: {
          teacher: { select: { id: true, name: true } },
          assistantTeacher: { select: { id: true, name: true } },
          attendances: { select: { date: true }, orderBy: { date: "asc" } },
        },
      }),
    ]);
    if (existing && existing.id !== courseId) {
      return NextResponse.json(
        {
          error: `課程編號「${code}」已被其他課程使用（${existing.school}｜${existing.teacher.name}）。請改用新的課程編號。`,
        },
        { status: 409 },
      );
    }
    // 先確認課程真的存在，下面才能把更新時的 P2025 一律解讀成「版本過期」
    if (!currentCourse) return NextResponse.json({ error: "找不到課程" }, { status: 404 });

    const scheduled: string[] = Array.isArray(scheduledDates)
      ? [...new Set((scheduledDates as string[]).map((d) => String(d).trim().slice(0, 10)).filter(Boolean))]
      : [];
    const parsed = typeof data.scheduledDateText === "string"
      ? parseCourseDateInput(data.scheduledDateText, Number(data.scheduledDateYear) || new Date().getFullYear()).dates
      : [];
    const range = data.dateMode === "range" ? expandIsoDateRange(data.rangeStart ?? "", data.rangeEnd ?? "") : [];
    const weekly = data.dateMode === "weekly" ? expandWeeklyDates(data.recurringStart ?? "", data.recurringEnd ?? "", Array.isArray(data.recurringDays) ? data.recurringDays : []) : [];
    const allScheduled = [...new Set([...scheduled, ...parsed, ...range, ...weekly])].sort();
    const dayOfWeek = allScheduled[0] ? weekdayOfIso(allScheduled[0]) : (data.dayOfWeek ?? "");
    const newTime = String(data.time ?? "");
    const payrollHours = parsePayrollHours(data.payrollHours);
    const recurrence = recurrenceFields(data, allScheduled);
    const oldPayrollMap = await coursePayrollHoursMap([courseId]);
    const oldPayrollHours = oldPayrollMap.get(courseId) ?? null;
    const currentDates = [...new Set((currentCourse?.attendances ?? []).map((attendance) => attendance.date.toISOString().slice(0, 10)))].sort();
    const teacherId = Number(data.teacherId);
    const assistantTeacherId = data.assistantTeacherId ? Number(data.assistantTeacherId) : null;
    if (assistantTeacherId && assistantTeacherId === teacherId) {
      return NextResponse.json({ error: "同一位老師不能同時擔任這堂課的主教與助教" }, { status: 409 });
    }
    if (data.isActive ?? true) {
      const conflict = await findCourseScheduleConflict({
        dates: allScheduled.length > 0 ? allScheduled : currentDates,
        time: newTime,
        teacherId,
        assistantTeacherId,
        excludeCourseId: courseId,
      });
      if (conflict) {
        return NextResponse.json({ error: courseScheduleConflictMessage(conflict), conflict }, { status: 409 });
      }
    }
    const datesChanged = allScheduled.length > 0 && (
      allScheduled.length !== currentDates.length
      || allScheduled.some((date, index) => date !== currentDates[index])
    );
    const teacherChanged = currentCourse?.teacherId !== teacherId;
    const assistantChanged = (currentCourse?.assistantTeacherId ?? null) !== assistantTeacherId;
    const categoryChanged = normalizeCategory(currentCourse?.category ?? "") !== normalizeCategory(data.category);
    const timeChanged = String(currentCourse?.time ?? "") !== newTime;
    const payrollChanged = (oldPayrollHours ?? null) !== (payrollHours ?? null);

    // 樂觀鎖：課程一存下去會連帶重排出勤、同步主教助教、刪掉多餘日期。
    // 兩個人拿著不同版本的排課表各存一次，後者不只覆蓋欄位，還會照著自己的日期清單
    // 把對方剛建好的堂次砍掉——那些堂次的回報與代課紀錄都會跟著消失。
    const expectedVersion = parseExpectedVersion(data.version);
    if (expectedVersion === null) return invalidVersionResponse();
    const course = await prisma.course.update({
      where: versionWhere({ id: courseId }, expectedVersion),
      data: {
        code,
        region: normalizeRegion(selectedSchool.region || data.region),
        teacherId,
        assistantTeacherId,
        school: selectedSchool.name,
        schoolId: selectedSchool.id,
        courseType: data.courseType ?? "",
        address: data.address || selectedSchool.address || "",
        dayOfWeek,
        ...recurrence,
        time: newTime,
        category: normalizeCategory(data.category),
        department: normalizeDepartment(data.department),
        enrollCount: data.enrollCount ?? "",
        isActive: data.isActive ?? true,
        notes: notesWithCourseTerm(data.notes, data.academicTermOverride),
      },
      include: { teacher: true, assistantTeacher: true },
      // 只有這一行的 P2025 才代表版本過期。原本靠外層 catch 判斷，但底下的
      // writeAuditLog、重排出勤、清理多餘日期若丟出同樣的錯，會被誤報成「請重新載入」，
      // 而課程其實已經存檔了——使用者照著提示重載再存一次，出勤就會被重排第二次。
    }).catch((error: unknown) => {
      if (isRecordNotFound(error)) return null;
      throw error;
    });
    if (!course) return versionConflictResponse("這門課剛被其他人修改過");
    await setCoursePayrollHours(course.id, payrollHours);
    await writeAuditLog(req, {
      action: "update",
      targetType: "Course",
      targetId: course.id,
      targetLabel: `${course.code} ${course.school} ${course.courseType}`,
      beforeData: currentCourse,
      afterData: { ...course, payrollHours },
      diffSummary: diffSummary(currentCourse as unknown as Record<string, unknown>, { ...course, payrollHours } as unknown as Record<string, unknown>, {
        teacherId: "主教",
        assistantTeacherId: "助教",
        time: "上課時間",
        school: "園所",
        courseType: "課程",
        payrollHours: "計薪時數",
      }) || `修改課程：${course.code}`,
    });

    const warnings: string[] = [];
    if (teacherChanged) {
      try {
        await syncUnreportedWaitingTeacherAttendance(course.id, course.teacherId);
      } catch (syncError) {
        const message = (syncError as Error).message || "待排老師同步失敗";
        console.warn("course waiting teacher attendance sync skipped", { courseId: course.id, message });
        warnings.push(`待排老師同步略過：${message}`);
      }
    }
    try {
      // 每次儲存都順手修正未來、尚未回報且沒有正式代課紀錄的堂次。
      // 可處理舊版曾留下「課程主檔已換老師、出勤仍是舊老師」的資料錯位。
      await syncFutureUnreportedAttendanceTeacher(course.id, course.teacherId);
    } catch (syncError) {
      const message = (syncError as Error).message || "未來主教同步失敗";
      console.warn("course attendance teacher sync skipped", { courseId: course.id, message });
      warnings.push(`主教同步略過：${message}`);
    }
    if (assistantChanged) {
      try {
        await syncFutureUnreportedAttendanceAssistant(
          course.id,
          course.assistantTeacherId ?? null,
          undefined,
          course.department,
          currentCourse?.assistantTeacherId ?? null,
        );
      } catch (syncError) {
        const message = (syncError as Error).message || "未來助教同步失敗";
        console.warn("course attendance assistant sync skipped", { courseId: course.id, message });
        warnings.push(`助教同步略過：${message}`);
      }
    }
    if (categoryChanged) {
      try {
        await syncFutureUnreportedAttendanceCategory(course.id, course.category, undefined, course.department);
      } catch (syncError) {
        const message = (syncError as Error).message || "未來課程類別同步失敗";
        console.warn("course attendance category sync skipped", { courseId: course.id, message });
        warnings.push(`課程類別同步略過：${message}`);
      }
    }
    if (payrollChanged && !timeChanged) {
      try {
        await syncFutureUnreportedAttendanceHours(course.id, newTime, payrollHours);
      } catch (syncError) {
        const message = (syncError as Error).message || "未來計薪時數同步失敗";
        console.warn("course attendance hours sync skipped", { courseId: course.id, message });
        warnings.push(`計薪時數同步略過：${message}`);
      }
    }
    if (timeChanged || payrollChanged) {
      try {
        await syncFutureUnreportedAttendanceTime(course.id, newTime, payrollHours, undefined, course.department);
      } catch (syncError) {
        const message = (syncError as Error).message || "未來出勤時間同步失敗";
        console.warn("course attendance time sync skipped", { courseId: course.id, message });
        warnings.push(`出勤時間同步略過：${message}`);
      }
    }

    if (allScheduled.length > 0 && datesChanged) {
      const calculatedHours = coursePayrollHoursForAttendance(payrollHours, newTime);
      await createAttendancesForUniqueDays(allScheduled, {
        courseId: course.id,
        actualTeacherId: course.teacherId,
        assistantTeacherId: course.assistantTeacherId ?? null,
        category: normalizeCategory(course.category),
        hours: calculatedHours.hours,
        notes: calculatedHours.needsReview ? `上課時間需人工確認：${calculatedHours.reason}` : "",
        cancelled: false,
        studentCount: null,
      });
      try {
        await stampAttendanceTime(course.id, allScheduled, newTime);
      } catch (stampError) {
        const message = (stampError as Error).message || "新出勤時間標記失敗";
        console.warn("course attendance time stamp skipped", { courseId: course.id, message });
        warnings.push(`新出勤時間標記略過：${message}`);
      }
      try {
        await pruneFutureUnreportedAttendanceDates(course.id, allScheduled);
      } catch (pruneError) {
        const message = (pruneError as Error).message || "多餘未來日期移除失敗";
        console.warn("course extra future attendance prune skipped", { courseId: course.id, message });
        warnings.push(`多餘未來日期移除略過：${message}`);
      }
    }
    return NextResponse.json({ ...course, payrollHours, warnings });
  } catch (e) {
    console.error("course update failed", e);
    return NextResponse.json({ error: `課程儲存失敗：${(e as Error).message}` }, { status: 500 });
  }
}

// PATCH /api/courses/[id] — 還原（取消封存）已封存課程，重新設為進行中。
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const courseId = Number(id);
    const body = await req.json().catch(() => ({}));
    if (body?.action !== "restore") {
      return NextResponse.json({ error: "不支援的操作" }, { status: 400 });
    }
    const before = await prisma.course.findUnique({
      where: { id: courseId },
      include: { teacher: { select: { id: true, name: true } }, assistantTeacher: { select: { id: true, name: true } } },
    });
    if (!before) return NextResponse.json({ error: "找不到課程" }, { status: 404 });
    if (before.isActive) return NextResponse.json({ ok: true, restored: false, alreadyActive: true });
    await prisma.course.update({ where: { id: courseId }, data: { isActive: true } });
    await writeAuditLog(req, {
      action: "restore",
      targetType: "Course",
      targetId: courseId,
      targetLabel: `${before.code} ${before.school} ${before.courseType}`,
      beforeData: before,
      afterData: { ...before, isActive: true },
      diffSummary: `還原課程：${before.code} ${before.school} ${before.courseType}（重新設為進行中）`,
      sensitive: true,
    });
    return NextResponse.json({ ok: true, restored: true });
  } catch (e) {
    console.error("course restore failed", e);
    return NextResponse.json({ error: `課程還原失敗：${(e as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const courseId = Number(id);
    const before = await prisma.course.findUnique({
      where: { id: courseId },
      include: { teacher: { select: { id: true, name: true } }, assistantTeacher: { select: { id: true, name: true } } },
    });
    if (!before) return NextResponse.json({ error: "找不到課程" }, { status: 404 });
    await prisma.course.update({ where: { id: courseId }, data: { isActive: false } });
    await writeAuditLog(req, {
      action: "archive",
      targetType: "Course",
      targetId: courseId,
      targetLabel: `${before.code} ${before.school} ${before.courseType}`,
      beforeData: before,
      afterData: { ...before, isActive: false },
      diffSummary: `封存課程：${before.code} ${before.school} ${before.courseType}（保留出勤、薪資、請款與回報紀錄）`,
      sensitive: true,
    });
    return NextResponse.json({ ok: true, archived: true });
  } catch (e) {
    console.error("course archive failed", e);
    return NextResponse.json({ error: `課程封存失敗：${(e as Error).message}` }, { status: 500 });
  }
}
