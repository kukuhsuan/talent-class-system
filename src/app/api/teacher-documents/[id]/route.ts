import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HR_DOCUMENT_ROLES, SENSITIVE_FINANCE_ROLES, hasRole, requireRole, sameOriginOk } from "@/lib/permissions";
import {
  DOC_STATUS,
  TEACHER_DOC_LABELS,
  getTeacherDocumentWithUrl,
  reviewTeacherDocument,
} from "@/lib/teacherDocument";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";

type Params = { id: string } | Promise<{ id: string }>;

// 存摺：待審核 →（已完成／需補件）
// 委任書：待審核 → 行政已確認 →（已完成／需補件）
const ALLOWED_TARGETS: Record<string, string[]> = {
  bankbook: [DOC_STATUS.done, DOC_STATUS.reject],
  mandate: [DOC_STATUS.adminOk, DOC_STATUS.done, DOC_STATUS.reject],
};

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { user, response } = await requireRole(HR_DOCUMENT_ROLES);
  if (response) return response;
  if (!sameOriginOk(req)) return NextResponse.json({ error: "來源不合法" }, { status: 403 });

  const { id } = await params;
  const document = await getTeacherDocumentWithUrl(Number(id));
  if (!document) return NextResponse.json({ error: "找不到文件" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const reviewStatus = String(body?.reviewStatus ?? "").trim();
  const notes = String(body?.notes ?? "").trim();

  const allowed = ALLOWED_TARGETS[document.docType] ?? [];
  if (!allowed.includes(reviewStatus)) {
    return NextResponse.json({ error: "審核狀態不正確" }, { status: 400 });
  }
  if (document.reviewStatus === DOC_STATUS.none) {
    return NextResponse.json({ error: "尚未上傳檔案，無法審核" }, { status: 400 });
  }
  // 需補件一定要寫原因，否則老師收到通知也不知道要補什麼
  if (reviewStatus === DOC_STATUS.reject && !notes) {
    return NextResponse.json({ error: "請填寫需補件原因" }, { status: 400 });
  }
  // 委任書要先經行政確認才輪到會計複審，不能一步跳到已完成
  if (document.docType === "mandate" && reviewStatus === DOC_STATUS.done && document.reviewStatus !== DOC_STATUS.adminOk) {
    return NextResponse.json({ error: "委任書需先由行政確認，再由會計複審" }, { status: 400 });
  }
  // 「已完成」是放行匯款的最後一關，只有看得到原檔的角色可以按
  if (reviewStatus === DOC_STATUS.done && !hasRole(user?.role, SENSITIVE_FINANCE_ROLES)) {
    return NextResponse.json({ error: "只有會計或管理者可標記已完成" }, { status: 403 });
  }

  const reviewedBy = user?.name || user?.username || "";
  const row = await reviewTeacherDocument(document.id, reviewStatus, reviewedBy, notes);

  const teacher = await prisma.teacher.findUnique({
    where: { id: document.teacherId },
    select: { name: true },
  });
  await writeAuditLog(req, {
    action: "update",
    targetType: "TeacherDocument",
    targetId: document.id,
    targetLabel: `${teacher?.name ?? document.teacherId}－${TEACHER_DOC_LABELS[document.docType]}`,
    diffSummary: `${TEACHER_DOC_LABELS[document.docType]}審核：${document.reviewStatus} → ${reviewStatus}${notes ? `（${notes}）` : ""}`,
    sensitive: true,
  });

  if (!row) return NextResponse.json({ error: "更新失敗" }, { status: 500 });
  return NextResponse.json(row);
}
