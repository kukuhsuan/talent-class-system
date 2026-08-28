import { NextRequest, NextResponse } from "next/server";
import { OWNER_ROLES, requireRole, sameOriginOk } from "@/lib/permissions";
import { APP_SETTING_KEYS, APP_SETTING_LABELS, DEFAULT_BANKBOOK_RETENTION_DAYS, DEFAULT_RETENTION_DAYS, listAppSettings, setAppSetting } from "@/lib/appSetting";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// AppSetting 的維護入口。這幾個值原本只能靠手改資料庫，
// 等於「委任書連結永遠是空的、保留天數永遠退回預設」——功能寫了卻沒人能開。
const ALLOWED_KEYS = new Set<string>(Object.values(APP_SETTING_KEYS));

export async function GET() {
  const { response } = await requireRole(OWNER_ROLES);
  if (response) return response;
  const settings = await listAppSettings();
  return NextResponse.json({
    settings,
    defaults: { retentionDays: DEFAULT_RETENTION_DAYS, bankbookRetentionDays: DEFAULT_BANKBOOK_RETENTION_DAYS },
  });
}

export async function PUT(req: NextRequest) {
  const { user, response } = await requireRole(OWNER_ROLES);
  if (response) return response;
  if (!sameOriginOk(req)) return NextResponse.json({ error: "來源不合法" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const updates = body?.settings;
  if (!updates || typeof updates !== "object") {
    return NextResponse.json({ error: "請提供要更新的設定" }, { status: 400 });
  }

  // 白名單比對：避免有人塞進沒定義的 key，讓設定表變成任意鍵值儲存區
  const keys = Object.keys(updates).filter((key) => ALLOWED_KEYS.has(key));
  if (keys.length === 0) return NextResponse.json({ error: "沒有可更新的設定項目" }, { status: 400 });

  const before = new Map<string, string>((await listAppSettings()).map((row) => [row.key, row.value]));
  const actor = user?.name || user?.username || "";
  const changed: string[] = [];

  for (const key of keys) {
    let stored: string;
    try {
      stored = await setAppSetting(key, String(updates[key] ?? ""), actor);
    } catch (error) {
      // 驗證失敗（非 https 連結、天數超出範圍）要指名是哪一項，否則使用者只看到一句「失敗」
      return NextResponse.json(
        { error: `${APP_SETTING_LABELS[key] ?? key}：${(error as Error).message}` },
        { status: 400 },
      );
    }
    if (stored !== (before.get(key) ?? "")) {
      changed.push(`${APP_SETTING_LABELS[key] ?? key}「${before.get(key) || "（空）"}」→「${stored || "（空）"}」`);
    }
  }

  if (changed.length > 0) {
    // 保留天數會直接決定原檔什麼時候被刪掉，改動一定要留紀錄
    await writeAuditLog(req, {
      action: "update",
      targetType: "AppSetting",
      targetLabel: "系統設定",
      diffSummary: changed.join("；"),
      sensitive: true,
    });
  }

  return NextResponse.json({ ok: true, changedCount: changed.length, settings: await listAppSettings() });
}
