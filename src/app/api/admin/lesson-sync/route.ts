import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parse } from "csv-parse/sync";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    const csvContent = await file.text();
    const records = parse(csvContent, { columns: true, skip_empty_lines: true });

    // 依 category 分組，決定 lesson number
    const courseTypeMap = new Map<string, any[]>();
    for (const row of records) {
      const category = (row.category || "").trim();
      if (!category) continue;
      const titleRaw = (row.H || row.title || row.Title || row["標題"] || "").trim();
      const title = titleRaw.replace(/^【.*?】/, "").trim(); // 移除【教案】等前綴
      
      let focus = "";
      let equipStr = "";
      let stepsStr = "";
      const ageGroup = (row["適合年齡"] || "").trim();

      try {
        if (row.content) {
          const parsed = JSON.parse(row.content);
          focus = parsed.goal || "";
          equipStr = parsed.equip || "";
          if (Array.isArray(parsed.steps)) {
            stepsStr = parsed.steps.map((s: any) => `${s.t}\n${s.d}`).join("\n\n");
          }
        }
      } catch (e) {
        console.error("JSON parse error for row:", title, e);
      }

      const skillsArr = [];
      if (ageGroup) skillsArr.push(`適齡:${ageGroup}`);
      if (equipStr) skillsArr.push(...equipStr.split(/[、,，]/).map(s => s.trim()).filter(Boolean));
      const skills = skillsArr.join("、");

      if (!courseTypeMap.has(category)) {
        courseTypeMap.set(category, []);
      }
      courseTypeMap.get(category)!.push({
        courseType: category,
        title,
        focus,
        skills,
        activityDirection: stepsStr,
        aiStyle: "",
      });
    }

    let totalImported = 0;

    for (const [courseType, lessons] of courseTypeMap.entries()) {
      // 依序分配 lesson 1, 2, 3...
      const dataToUpsert = lessons.map((item, idx) => ({
        ...item,
        lesson: idx + 1,
      }));

      // 為了避免舊資料殘留，我們先刪除該 courseType 下所有 lesson
      // （或是只 Upsert，並刪除超出範圍的 lesson）
      const lastLesson = dataToUpsert.length;
      await prisma.$executeRawUnsafe(
        "DELETE FROM LessonTemplate WHERE courseType = ? AND lesson > ?",
        courseType,
        lastLesson
      );

      for (const row of dataToUpsert) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO LessonTemplate (courseType, lesson, title, focus, skills, activityDirection, aiStyle, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, '', CURRENT_TIMESTAMP)
           ON CONFLICT(courseType, lesson) DO UPDATE SET
             title = excluded.title,
             focus = excluded.focus,
             skills = excluded.skills,
             activityDirection = excluded.activityDirection,
             updatedAt = CURRENT_TIMESTAMP`,
          row.courseType,
          row.lesson,
          row.title,
          row.focus,
          row.skills,
          row.activityDirection
        );
      }
      totalImported += dataToUpsert.length;
    }

    return NextResponse.json({ ok: true, importedCount: totalImported });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
