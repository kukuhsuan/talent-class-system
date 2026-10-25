import { del } from "@vercel/blob";

export function reportPhotoToken() {
  return process.env.REPORT_PHOTO_READ_WRITE_TOKEN?.trim()
    || process.env.BLOB_READ_WRITE_TOKEN?.trim()
    || process.env.VERCEL_BLOB_READ_WRITE_TOKEN?.trim()
    || "";
}

// Delete only an object already associated with this attendance. The Blob API
// additionally enforces store ownership using the server-held credential.
export async function deleteReportPhoto(stored: string) {
  let token = reportPhotoToken();
  let target: string;
  if (stored.startsWith("private:report-photos/")) {
    target = stored.slice("private:".length);
  } else {
    const url = new URL(stored);
    // Old manually pasted external images are not ours to delete. Fail explicitly
    // instead of claiming the actual image was removed.
    if (url.protocol !== "https:" || !url.hostname.endsWith(".public.blob.vercel-storage.com")
      || !url.pathname.startsWith("/report-photos/") || url.username || url.password) {
      throw new Error("External photo requires administrator removal");
    }
    target = url.toString();
    token = process.env.BLOB_READ_WRITE_TOKEN?.trim() || process.env.VERCEL_BLOB_READ_WRITE_TOKEN?.trim() || "";
  }
  if (!token) throw new Error("Photo storage is not configured");
  // Delete first: on failure retain the DB reference so the same request can be retried.
  await del(target, { token });
}
