// 銀行帳號遮罩：一般畫面顯示 822-******1234，只有 SENSITIVE_FINANCE_ROLES 能解遮罩看明碼。
// 全站共用同一支，避免各頁面各自實作導致有的地方漏遮。

export function normalizeBankAccount(value: string | null | undefined) {
  return String(value ?? "").replace(/[\s-]/g, "");
}

export function maskBankAccount(bankCode: string | null | undefined, accountNumber: string | null | undefined) {
  const account = normalizeBankAccount(accountNumber);
  if (!account) return "";
  const tail = account.slice(-4);
  // 帳號短於 4 碼時全部遮掉，不要反而把整組露出來
  const masked = account.length <= 4 ? "*".repeat(account.length) : `******${tail}`;
  const code = String(bankCode ?? "").trim();
  return code ? `${code}-${masked}` : masked;
}

// 匯出／畫面用的完整帳號格式（含銀行代碼），僅限有權限時使用
export function fullBankAccount(bankCode: string | null | undefined, accountNumber: string | null | undefined) {
  const account = normalizeBankAccount(accountNumber);
  if (!account) return "";
  const code = String(bankCode ?? "").trim();
  return code ? `${code}-${account}` : account;
}
