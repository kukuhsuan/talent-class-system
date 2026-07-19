import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { diffSummary, ensureUserAccountAuditColumns, writeAuditLog } from "@/lib/auditLog";
import { OWNER_ROLES, requireRole } from "@/lib/permissions";

const ROLES = new Set(["owner", "super_admin", "developer", "admin", "customer_service", "staff", "accountant", "viewer"]);
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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserManager();
  if (auth.response) return auth.response;
  await ensureUserAccountAuditColumns();
  const { id } = await params;
  const data = await req.json();
  const username = String(data.username ?? "").trim();
  const name = String(data.name ?? "").trim();
  const email = String(data.email ?? "").trim();
  const password = String(data.password ?? "");

  if (!username || !name) {
    return NextResponse.json({ error: "請填寫帳號與姓名" }, { status: 400 });
  }
  const before = await prisma.userAccount.findUnique({
    where: { id: Number(id) },
    select: { id: true, username: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
  });
  if (!before) return NextResponse.json({ error: "找不到帳號" }, { status: 404 });

  const updateData: {
    username: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    passwordHash?: string;
  } = {
    username,
    name,
    email,
    role: ROLES.has(String(data.role ?? "")) ? String(data.role) : before.role,
    isActive: Boolean(data.isActive),
  };

  if (password) {
    if (password.length < 8) return NextResponse.json({ error: "密碼至少 8 碼" }, { status: 400 });
    updateData.passwordHash = await hashPassword(password);
  }

  const user = await prisma.userAccount.update({
    where: { id: Number(id) },
    data: updateData,
    select: { id: true, username: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
  });
  await writeAuditLog(req, {
    action: password ? "reset_password" : "update",
    targetType: "UserAccount",
    targetId: user.id,
    targetLabel: user.name,
    beforeData: before,
    afterData: user,
    diffSummary: password
      ? `重設 ${user.name} 密碼`
      : diffSummary(before, user, { name: "姓名", username: "帳號", email: "Email", role: "角色", isActive: "啟用狀態" }) || `修改員工帳號：${user.name}`,
    sensitive: true,
  });

  return NextResponse.json(user);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserManager();
  if (auth.response) return auth.response;
  await ensureUserAccountAuditColumns();
  const { id } = await params;
  const before = await prisma.userAccount.findUnique({
    where: { id: Number(id) },
    select: { id: true, username: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
  });
  if (!before) return NextResponse.json({ error: "找不到帳號" }, { status: 404 });
  const user = await prisma.userAccount.update({
    where: { id: Number(id) },
    data: { isActive: false },
    select: { id: true, username: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
  });
  await writeAuditLog(req, {
    action: "soft_delete",
    targetType: "UserAccount",
    targetId: user.id,
    targetLabel: user.name,
    beforeData: before,
    afterData: user,
    diffSummary: `停用員工帳號：${user.name}`,
    sensitive: true,
  });
  return NextResponse.json({ ok: true });
}
