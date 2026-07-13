export function isTransientDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /HTTP status 502|SERVER_ERROR|fetch failed|ECONNRESET|ETIMEDOUT/i.test(message);
}

export function databaseErrorMessage(error: unknown, fallback: string) {
  return isTransientDatabaseError(error) ? `${fallback}：資料庫暫時忙碌，請稍後再試` : (error instanceof Error ? error.message : String(error || fallback));
}

export async function withDatabaseRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientDatabaseError(error) || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw lastError;
}
