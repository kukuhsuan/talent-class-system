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

export async function readSpreadsheetSheetNames(spreadsheetId: string) {
  const body = await sheetsRequest(`/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(sheetId,title,hidden)`);
  return ((body as { sheets?: Array<{ properties?: { sheetId?: number; title?: string; hidden?: boolean } }> }).sheets ?? [])
    .map((sheet) => sheet.properties)
    .filter((properties): properties is { sheetId: number; title: string; hidden?: boolean } => typeof properties?.sheetId === "number" && Boolean(properties.title));
}

function columnIndexFromLetters(letters: string) {
  return letters.toUpperCase().split("").reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

export async function writeHighlightedSheetValue(spreadsheetId: string, sheetName: string, cell: string, value: number) {
  const match = cell.match(/^([A-Z]+)(\d+)$/i);
  if (!match) throw new Error(`無效的 Google Sheet 儲存格：${cell}`);
  const sheets = await readSpreadsheetSheetNames(spreadsheetId);
  const sheet = sheets.find((item) => item.title === sheetName);
  if (!sheet) throw new Error(`找不到 Google Sheet 分頁：${sheetName}`);
  const columnIndex = columnIndexFromLetters(match[1]);
  const rowIndex = Number(match[2]) - 1;
  await sheetsRequest(`/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [{
        updateCells: {
          range: {
            sheetId: sheet.sheetId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1,
          },
          rows: [{
            values: [{
              userEnteredValue: { numberValue: value },
              userEnteredFormat: {
                textFormat: {
                  bold: true,
                  foregroundColorStyle: { rgbColor: { red: 0.85, green: 0.19, blue: 0.15 } },
                },
              },
            }],
          }],
          fields: "userEnteredValue,userEnteredFormat.textFormat(bold,foregroundColorStyle)",
        },
      }],
    }),
  });
}
