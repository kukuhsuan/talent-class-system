import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TEACHERS = [
  { name: "劉永謙", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "戴睿哲", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "蕭喬竛", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "黃湘庭", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "許育瑄", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "沈逸渼", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "邱璽霖", rateAfterSchool: 550, rateInSchool: 550, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "譚偉濠", rateAfterSchool: 550, rateInSchool: 550, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "謝宗佑", rateAfterSchool: 550, rateInSchool: 550, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "游子毅", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "孫顥仁", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "吳可磬", rateAfterSchool: 600, rateInSchool: 600, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "姜宓樂", rateAfterSchool: 600, rateInSchool: 600, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "詹前威", rateAfterSchool: 550, rateInSchool: 550, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "謝秉洋", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "范植偉", rateAfterSchool: 600, rateInSchool: 600, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "黃育倫", rateAfterSchool: 600, rateInSchool: 600, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "李亦謦", rateAfterSchool: 450, rateInSchool: 450, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "王歆婷", rateAfterSchool: 400, rateInSchool: 400, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "何佳燕", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "林季萱", rateAfterSchool: 600, rateInSchool: 600, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "陳妙華", rateAfterSchool: 600, rateInSchool: 600, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "許馳朋", rateAfterSchool: 600, rateInSchool: 600, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "黃筱淇", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "劉鎔瑄", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "黃廷宇", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "王群皓", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "邱喬瑀", rateAfterSchool: 450, rateInSchool: 450, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "屠崇羽", rateAfterSchool: 550, rateInSchool: 550, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "陳造杭", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "楊斯羽", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "鄭沛宗", rateAfterSchool: 550, rateInSchool: 550, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "徐儀晨", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "呂旻翰", rateAfterSchool: 550, rateInSchool: 550, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "黃靖怡", rateAfterSchool: 600, rateInSchool: 600, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "郭芷均", rateAfterSchool: 600, rateInSchool: 600, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "葉泓毅", rateAfterSchool: 550, rateInSchool: 550, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "周宣妤", rateAfterSchool: 550, rateInSchool: 550, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "陳伃琳", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "鍾譯鋒", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "王楚儀", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "黃小芹", rateAfterSchool: 600, rateInSchool: 600, rateDemo: 200, travelFee: 100, notes: "馬克車費100元" },
  { name: "周訓民", rateAfterSchool: 650, rateInSchool: 650, rateDemo: 200, travelFee: 150, notes: "寶山車費150元" },
  { name: "陳逸翔", rateAfterSchool: 700, rateInSchool: 700, rateDemo: 200, travelFee: 0, notes: "美術幫忙買材料" },
  { name: "石元希", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 100, notes: "好兒美車費100元" },
  { name: "紀璟琳", rateAfterSchool: 650, rateInSchool: 650, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "陳旻韋", rateAfterSchool: 550, rateInSchool: 550, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "曾姿縈", rateAfterSchool: 650, rateInSchool: 650, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "鄭翰鴻", rateAfterSchool: 550, rateInSchool: 550, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "陳瑄佳", rateAfterSchool: 550, rateInSchool: 550, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "林偉祥", rateAfterSchool: 550, rateInSchool: 550, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "蔣品伊", rateAfterSchool: 260, rateInSchool: 260, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "張睿宸", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "趙姿榕", rateAfterSchool: 600, rateInSchool: 600, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "邱建庭", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "鄭伃茵", rateAfterSchool: 650, rateInSchool: 650, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "林妤宸", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "江芃菱", rateAfterSchool: 550, rateInSchool: 550, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "胡凱傑", rateAfterSchool: 550, rateInSchool: 550, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "彭沛綺", rateAfterSchool: 550, rateInSchool: 550, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "唐子傑", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "鄧巧琳", rateAfterSchool: 550, rateInSchool: 550, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "黃瑀郡", rateAfterSchool: 600, rateInSchool: 600, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "曾美君", rateAfterSchool: 650, rateInSchool: 650, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "賴鈺慈", rateAfterSchool: 550, rateInSchool: 550, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "潘俊仁", rateAfterSchool: 550, rateInSchool: 550, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "陳筱汶", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "古育誠", rateAfterSchool: 550, rateInSchool: 550, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "石政傑", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "李安倫", rateAfterSchool: 260, rateInSchool: 260, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "藍翊瑄", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "" },
  { name: "陳旻韋-助", rateAfterSchool: 275, rateInSchool: 275, rateDemo: 200, travelFee: 0, notes: "助教" },
];

export async function POST() {
  const existing = await prisma.teacher.count();
  if (existing > 0) {
    return NextResponse.json({ message: "已有資料，跳過匯入" }, { status: 200 });
  }

  for (const t of TEACHERS) {
    await prisma.teacher.upsert({ where: { name: t.name }, create: t, update: {} });
  }

  const teachers = await prisma.teacher.findMany();
  const teacherMap = Object.fromEntries(teachers.map((t) => [t.name, t.id]));

  const COURSES = [
    { code: "C001", region: "台北", teacherName: "邱璽霖", school: "新何", courseType: "P", dayOfWeek: "星期一", time: "16:00-17:00", category: "課後", enrollCount: "17人幼小" },
    { code: "C002", region: "台北", teacherName: "江芃菱", school: "家田", courseType: "冰壺", dayOfWeek: "星期一", time: "16:30-17:30", category: "課後", enrollCount: "7人" },
    { code: "C003", region: "台北", teacherName: "許育瑄", school: "新何", courseType: "P", dayOfWeek: "星期二", time: "16:00-17:00", category: "課後", enrollCount: "17人幼小" },
    { code: "C004", region: "台北", teacherName: "許育瑄", school: "新何", courseType: "P", dayOfWeek: "星期二", time: "17:00-18:00", category: "課後", enrollCount: "10人中大" },
    { code: "C005", region: "台北", teacherName: "黃湘庭", school: "臨何", courseType: "D", dayOfWeek: "星期二", time: "16:15-17:15", category: "課後", enrollCount: "15人" },
    { code: "C006", region: "台北", teacherName: "張睿宸", school: "美蒂思", courseType: "FT", dayOfWeek: "星期三", time: "16:10-17:00", category: "課後", enrollCount: "13人" },
    { code: "C007", region: "台北", teacherName: "謝宗佑", school: "淡水何", courseType: "FT", dayOfWeek: "星期三", time: "16:00-16:40", category: "課後", enrollCount: "11人" },
    { code: "C008", region: "台北", teacherName: "謝宗佑", school: "淡水何", courseType: "FT", dayOfWeek: "星期三", time: "16:40-17:20", category: "課後", enrollCount: "11人" },
    { code: "C009", region: "台北", teacherName: "游子毅", school: "宜蘭何", courseType: "BK", dayOfWeek: "星期三", time: "16:30-17:30", category: "課後", enrollCount: "7人" },
    { code: "C010", region: "台北", teacherName: "邱璽霖", school: "臨何", courseType: "FT", dayOfWeek: "星期四", time: "16:15-17:15", category: "課後", enrollCount: "9人" },
    { code: "C011", region: "台北", teacherName: "許育瑄", school: "臨何", courseType: "D", dayOfWeek: "星期五", time: "16:15-17:15", category: "課後", enrollCount: "9人" },
    { code: "C012", region: "台北", teacherName: "劉永謙", school: "林千保", courseType: "FT", dayOfWeek: "星期五", time: "14:45-16:45", category: "課後", enrollCount: "25人" },
    { code: "C013", region: "新竹", teacherName: "周訓民", school: "寶山蒙特", courseType: "G", dayOfWeek: "星期二", time: "16:00-17:00", category: "課後", enrollCount: "8人" },
    { code: "C014", region: "新竹", teacherName: "陳筱汶", school: "輔仁", courseType: "P", dayOfWeek: "星期三", time: "15:50-16:50", category: "課後", enrollCount: "10人" },
    { code: "C015", region: "新竹", teacherName: "屠崇羽", school: "竹北華盛頓", courseType: "G", dayOfWeek: "星期四", time: "16:00-17:00", category: "課後", enrollCount: "6人" },
    { code: "C016", region: "新竹", teacherName: "詹前威", school: "竹科蔓", courseType: "冰壺", dayOfWeek: "星期四", time: "16:00-17:00", category: "課後", enrollCount: "12人" },
    { code: "C017", region: "台中", teacherName: "藍翊瑄", school: "大甲熊", courseType: "FT", dayOfWeek: "星期一", time: "15:20-16:20", category: "課後", enrollCount: "" },
    { code: "C018", region: "台中", teacherName: "藍翊瑄", school: "大甲熊", courseType: "FT", dayOfWeek: "星期一", time: "16:20-17:20", category: "課後", enrollCount: "" },
    { code: "C019", region: "台中", teacherName: "紀璟琳", school: "馬克", courseType: "FT", dayOfWeek: "星期一", time: "16:10-17:10", category: "課後", enrollCount: "5人" },
    { code: "C020", region: "台中", teacherName: "唐子傑", school: "葳格", courseType: "冰壺", dayOfWeek: "星期一", time: "16:20-17:20", category: "課後", enrollCount: "7人" },
    { code: "C021", region: "台中", teacherName: "藍翊瑄", school: "明典", courseType: "BK", dayOfWeek: "星期二", time: "15:40-16:40", category: "課後", enrollCount: "12人" },
    { code: "C022", region: "台中", teacherName: "譚偉濠", school: "葳格", courseType: "BK", dayOfWeek: "星期三", time: "16:20-17:20", category: "課後", enrollCount: "8人幼小" },
    { code: "C023", region: "台中", teacherName: "藍翊瑄", school: "大甲嘉", courseType: "FT", dayOfWeek: "星期三", time: "16:20-17:20", category: "課後", enrollCount: "10人" },
    { code: "C024", region: "台中", teacherName: "陳旻韋", school: "克麗斯", courseType: "G", dayOfWeek: "星期三", time: "17:00-18:00", category: "課後", enrollCount: "7人" },
    { code: "C025", region: "台中", teacherName: "紀璟琳", school: "夏洛特", courseType: "BK", dayOfWeek: "星期三", time: "16:00-17:00", category: "課後", enrollCount: "12人" },
    { code: "C026", region: "台中", teacherName: "藍翊瑄", school: "愛堡保", courseType: "B", dayOfWeek: "星期四", time: "16:10-17:00", category: "課後", enrollCount: "2人" },
    { code: "C027", region: "台中", teacherName: "黃育倫", school: "安心", courseType: "D", dayOfWeek: "星期四", time: "16:00-17:00", category: "課後", enrollCount: "13人" },
    { code: "C028", region: "台中", teacherName: "黃育倫", school: "安心", courseType: "D", dayOfWeek: "星期四", time: "17:00-18:00", category: "課後", enrollCount: "12人" },
    { code: "C029", region: "台中", teacherName: "藍翊瑄", school: "安心", courseType: "FT", dayOfWeek: "星期五", time: "16:00-17:00", category: "課後", enrollCount: "13人" },
    { code: "C030", region: "高雄", teacherName: "曾姿縈", school: "高美何嘉", courseType: "正音", dayOfWeek: "星期一", time: "16:30-17:30", category: "課後", enrollCount: "10人" },
    { code: "C031", region: "台南", teacherName: "鄭翰鴻", school: "仁仁森林", courseType: "G", dayOfWeek: "星期三", time: "16:00-17:00", category: "課後", enrollCount: "5人" },
    { code: "C032", region: "台南", teacherName: "鄭翰鴻", school: "東橋", courseType: "冰壺", dayOfWeek: "星期五", time: "16:30-17:30", category: "課後", enrollCount: "7人" },
  ];

  for (const c of COURSES) {
    const teacherId = teacherMap[c.teacherName];
    if (!teacherId) continue;
    await prisma.course.create({
      data: {
        code: c.code, region: c.region, teacherId,
        school: c.school, courseType: c.courseType,
        dayOfWeek: c.dayOfWeek, time: c.time,
        category: c.category, enrollCount: c.enrollCount,
      },
    });
  }

  return NextResponse.json({ message: "匯入完成", teachers: TEACHERS.length, courses: COURSES.length });
}
