import { NextRequest, NextResponse } from "next/server";
import { dryRunSummerCampImport, importSummerCamp } from "@/lib/summerCampImport";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const year = Number(form.get("year") ?? new Date().getFullYear()) || new Date().getFullYear();
    const mode = String(form.get("mode") ?? "dry-run");
    const importMode = form.get("importMode") === "overwrite" ? "overwrite" : "skip";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "請上傳 Excel 檔案" }, { status: 400 });
    }
    if (!file.name.match(/\.xlsx$/i)) {
      return NextResponse.json({ error: "目前只支援 .xlsx Excel 檔" }, { status: 400 });
    }

    const result = mode === "import"
      ? await importSummerCamp(file, year, importMode)
      : await dryRunSummerCampImport(file, year, importMode);

    return NextResponse.json(result, { status: mode === "import" && result.ok ? 201 : 200 });
  } catch (error) {
    console.error("summer camp import failed", error);
    return NextResponse.json({ error: `安親班暑期課程匯入失敗：${(error as Error).message}` }, { status: 500 });
  }
}
