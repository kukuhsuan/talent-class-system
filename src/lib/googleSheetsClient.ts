import { SignJWT, importPKCS8 } from "jose";

let cachedToken: { value: string; expiresAt: number } | null = null;

function credentials() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ?? "";
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) throw new Error("Google Sheets 服務帳戶尚未設定");
  return { clientEmail, privateKey };
}

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const { clientEmail, privateKey } = credentials();
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(privateKey, "RS256");
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/spreadsheets",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setSubject(clientEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const body = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !body.access_token) throw new Error(body.error_description || "Google OAuth 驗證失敗");
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

async function sheetsRequest(path: string, init?: RequestInit) {
  const token = await accessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || `Google Sheets API ${response.status}`);
  return body;
}

export async function readSheetValues(spreadsheetId: string, range: string) {
  const body = await sheetsRequest(`/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`);
  return (body as { values?: unknown[][] }).values ?? [];
}

export async function writeSheetValue(spreadsheetId: string, range: string, value: number) {
  await sheetsRequest(`/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ range, majorDimension: "ROWS", values: [[value]] }),
  });
}
