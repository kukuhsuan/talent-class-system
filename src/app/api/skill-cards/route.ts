import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_SKILLS = [
  { name: "反應力", icon: "⚡", imageUrl: "/skill-cards/reaction.png", description: "提升反應速度" },
  { name: "專注力", icon: "🎯", imageUrl: "/skill-cards/focus.png", description: "培養專注觀察" },
  { name: "手眼協調", icon: "👀", imageUrl: "/skill-cards/focus.png", description: "提升反應與動作配合" },
  { name: "肢體協調", icon: "🏃", imageUrl: "/skill-cards/body-coordination.png", description: "提升動作流暢" },
  { name: "肌肉發展", icon: "💪", imageUrl: "/skill-cards/muscle.png", description: "強化基礎肌力" },
  { name: "規則理解", icon: "📘", imageUrl: "/skill-cards/rules.png", description: "理解課堂規則" },
  { name: "情緒控制", icon: "😊", imageUrl: "/skill-cards/confidence.png", description: "練習穩定參與" },
  { name: "團隊合作", icon: "🤝", imageUrl: "/skill-cards/teamwork.png", description: "練習合作互動" },
  { name: "團隊互動", icon: "🤝", imageUrl: "/skill-cards/teamwork.png", description: "練習合作互動" },
  { name: "自信心建立", icon: "💗", imageUrl: "/skill-cards/confidence.png", description: "建立自信表現" },
  { name: "自信表現", icon: "💗", imageUrl: "/skill-cards/confidence.png", description: "建立自信表現" },
];

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
  const name = String(data.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "請填寫能力名稱" }, { status: 400 });

  const row = await prisma.skillCard.upsert({
    where: { name },
    update: {
      icon: String(data.icon ?? "").trim(),
      imageUrl: String(data.imageUrl ?? "").trim(),
      description: String(data.description ?? "").trim(),
      isActive: data.isActive !== false,
    },
    create: {
      name,
      icon: String(data.icon ?? "").trim(),
      imageUrl: String(data.imageUrl ?? "").trim(),
      description: String(data.description ?? "").trim(),
      isActive: data.isActive !== false,
    },
  });
  return NextResponse.json(row, { status: 201 });
}
