import { NextRequest, NextResponse } from "next/server";
import { ABILITY_ICON_MAP, CORE_ABILITIES, normalizeAbility } from "@/lib/abilityMap";
import { prisma } from "@/lib/prisma";

const DEFAULT_SKILLS = CORE_ABILITIES.map((name) => ({
  name,
  icon: "",
  imageUrl: ABILITY_ICON_MAP[name],
  description: "",
}));

async function ensureSkillCardTable() {
  await prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS SkillCard (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, icon TEXT NOT NULL DEFAULT "", imageUrl TEXT NOT NULL DEFAULT "", description TEXT NOT NULL DEFAULT "", isActive BOOLEAN NOT NULL DEFAULT true, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)');
}

async function ensureDefaults() {
  await ensureSkillCardTable();
  for (const skill of DEFAULT_SKILLS) {
    await prisma.skillCard.upsert({
      where: { name: skill.name },
      update: {
        icon: skill.icon,
        imageUrl: skill.imageUrl,
        description: skill.description,
      },
      create: skill,
    });
  }
  await prisma.skillCard.updateMany({
    where: { name: { notIn: [...CORE_ABILITIES] } },
    data: { isActive: false },
  });
}

export async function GET() {
  await ensureDefaults();
  const rows = await prisma.skillCard.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  await ensureSkillCardTable();
  const data = await req.json();
  const name = normalizeAbility(String(data.name ?? ""));
  if (!name) return NextResponse.json({ error: "能力名稱只允許固定 8 種核心能力" }, { status: 400 });

  const row = await prisma.skillCard.upsert({
    where: { name },
    update: {
      icon: "",
      imageUrl: ABILITY_ICON_MAP[name],
      description: String(data.description ?? "").trim(),
      isActive: data.isActive !== false,
    },
    create: {
      name,
      icon: "",
      imageUrl: ABILITY_ICON_MAP[name],
      description: String(data.description ?? "").trim(),
      isActive: data.isActive !== false,
    },
  });
  return NextResponse.json(row, { status: 201 });
}
