import crypto from "node:crypto";
import { del, get, put } from "@vercel/blob";
import { TEACHER_DOC_LABELS, type TeacherDocType } from "@/lib/teacherDocument";

// 存摺封面與委任書一律存 private blob。
// 教師大頭照那支（teacher-resumes/.../photo）用的是 access: "public"，
// 代表只要拿到網址誰都看得到——敏感文件絕對不能沿用那個寫法。
export const SENSITIVE_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
]);

export function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN ?? process.env.VERCEL_BLOB_READ_WRITE_TOKEN ?? "";
}

// 副檔名與 Content-Type 都是上傳端說了算，不能只信這兩個。
// 這裡再讀檔頭的魔術位元組，確認內容真的是 PDF／JPG／PNG。
const MAGIC: Array<[ext: string, bytes: number[]]> = [
  ["pdf", [0x25, 0x50, 0x44, 0x46]], // %PDF
  ["jpg", [0xff, 0xd8, 0xff]],
  ["png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
];

function sniffExt(head: Uint8Array) {
  for (const [ext, bytes] of MAGIC) {
    if (bytes.every((byte, index) => head[index] === byte)) return ext;
  }
  return "";
}

export async function validateSensitiveFile(file: File) {
  const declared = ALLOWED_TYPES.get(file.type.toLowerCase());
  if (!declared) return { ok: false as const, error: "只接受 PDF、JPG 或 PNG 檔案" };
  if (file.size <= 0) return { ok: false as const, error: "檔案是空的，請重新選擇" };
  if (file.size > SENSITIVE_MAX_BYTES) return { ok: false as const, error: "檔案請小於 10MB" };

  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const actual = sniffExt(head);
  if (!actual) return { ok: false as const, error: "檔案內容不是有效的 PDF／JPG／PNG，請重新選擇" };
  // 宣稱與實際不符（例如把 .exe 改名成 .pdf）一律擋掉，並以實際內容為準
  if (actual !== declared) return { ok: false as const, error: "檔案內容與副檔名不符，請重新選擇" };
  return { ok: true as const, ext: actual };
}

export async function putSensitiveDocument(input: {
  teacherId: number;
  docType: TeacherDocType;
  file: File;
  ext: string;
}) {
  const token = blobToken();
  if (!token) throw new Error("尚未設定檔案儲存空間，請聯繫系統管理員設定 BLOB_READ_WRITE_TOKEN。");
  // 路徑帶隨機值，避免有人靠 teacherId 猜出 pathname
  const pathname = `teacher-documents/${input.docType}/${input.teacherId}-${crypto.randomUUID()}.${input.ext}`;
  const blob = await put(pathname, input.file, {
    access: "private",
    addRandomSuffix: true,
    token,
  });
  return { pathname: blob.pathname, contentType: input.file.type };
}

export async function readSensitiveDocument(pathname: string) {
  const token = blobToken();
  if (!token) throw new Error("尚未設定檔案儲存空間");
  // useCache: false — 私有檔案不要留在 CDN 快取
  return get(pathname, { access: "private", token, useCache: false });
}

// 重新上傳或到期清除時把舊檔真的刪掉，避免 blob 裡留下沒人管的孤兒存摺。
// 刪不掉不該讓整個上傳失敗，所以只回成功與否讓呼叫端記錄。
export async function deleteSensitiveDocument(pathname: string) {
  const token = blobToken();
  if (!token || !pathname) return false;
  try {
    await del(pathname, { token });
    return true;
  } catch (error) {
    console.warn("blob delete failed", pathname, (error as Error).message);
    return false;
  }
}

export function documentDownloadName(docType: TeacherDocType, teacherName: string, fileName: string) {
  const ext = fileName.split(".").pop() || "pdf";
  return `${teacherName}-${TEACHER_DOC_LABELS[docType]}.${ext}`;
}
