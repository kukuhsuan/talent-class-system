import crypto from "node:crypto";
import { get, put } from "@vercel/blob";
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

export function validateSensitiveFile(file: File) {
  const ext = ALLOWED_TYPES.get(file.type.toLowerCase());
  if (!ext) return { ok: false as const, error: "只接受 PDF、JPG 或 PNG 檔案" };
  if (file.size <= 0) return { ok: false as const, error: "檔案是空的，請重新選擇" };
  if (file.size > SENSITIVE_MAX_BYTES) return { ok: false as const, error: "檔案請小於 10MB" };
  return { ok: true as const, ext };
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

export function documentDownloadName(docType: TeacherDocType, teacherName: string, fileName: string) {
  const ext = fileName.split(".").pop() || "pdf";
  return `${teacherName}-${TEACHER_DOC_LABELS[docType]}.${ext}`;
}
