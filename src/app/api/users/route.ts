import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { ensureUserAccountAuditColumns, writeAuditLog } from "@/lib/auditLog";
import { OWNER_ROLES, requireRole } from "@/lib/permissions";

const ROLES = new Set(["owner", "super_admin", "developer", "admin", "staff", "accountant", "viewer"]);
const BOOTSTRAP_MANAGER_ROLES = [...OWNER_ROLES, "admin"];

async function hasActiveOwner() {
  await ensureUserAccountAuditColumns();
  return (await prisma.userAccount.count({
    where: { role: { in: [...OWNER_ROLES] }, isActive: true },
  })) > 0;
}

async function requireUserManager() {
  const auth = await requireRole(BOOTSTRAP_MANAGER_ROLES);
  if (auth.response) return auth;
  if (auth.user && (OWNER_ROLES as readonly string[]).includes(auth.user.role)) return auth;
  if (!(await hasActiveOwner())) return auth;
  return {
    ...auth,
    response: NextResponse.json({ error: "只有最高權限可以管理員工帳號" }, { status: 403 }),
  };
}

export async function GET() {
  const auth = await requireUserManager();
  if (auth.response) return auth.response;
  await ensureUserAccountAuditColumns();
  const users = await prisma.userAccount.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const auth = await requireUserManager();
  if (auth.response) return auth.response;
  await ensureUserAccountAuditColumns();
  const data = await req.json();
  const username = String(data.username ?? "").trim();
  const name = String(data.name ?? "").trim();
  const email = String(data.email ?? "").trim();
  const password = String(data.password ?? "");
  const role = ROLES.has(String(data.role ?? "")) ? String(data.role) : "staff";

  if (!username || !name || password.length < 8) {
    return NextResponse.json({ error: "請填寫帳號、姓名，密碼至少 8 碼" }, { status: 400 });
  }

  const user = await prisma.userAccount.create({
    data: {
      username,
      name,
      email,
      passwordHash: await hashPassword(password),
      role,
      isActive: data.isActive ?? true,
    },
    select: { id: true, username: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
  });
  await writeAuditLog(req, {
    action: "create",
    targetType: "UserAccount",
    targetId: user.id,
    targetLabel: user.name,
    afterData: user,
    diffSummary: `新增員工帳號：${user.name}（${user.role}）`,
    sensitive: true,
  });

  return NextResponse.json(user, { status: 201 });
}
