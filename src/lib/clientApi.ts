export async function readApiError(res: Response, fallback: string) {
  if (res.status === 401 || res.status === 403 || res.redirected || res.url.includes("/login")) {
    return "登入狀態已失效，請重新登入後再試";
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const data = await res.json().catch(() => ({}));
    return data.error ?? fallback;
  }

  const text = await res.text().catch(() => "");
  if (text.trim()) return `${fallback}（HTTP ${res.status}：${text.trim().slice(0, 120)}）`;
  return `${fallback}（HTTP ${res.status}）`;
}

export async function ensureOk(res: Response, fallback: string) {
  if (res.ok) return;
  throw new Error(await readApiError(res, fallback));
}
