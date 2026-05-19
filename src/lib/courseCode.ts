export function nextCourseCode(existingCodes: string[]) {
  const max = existingCodes.reduce((currentMax, code) => {
    const match = code.trim().match(/^C(\d+)$/i);
    if (!match) return currentMax;
    return Math.max(currentMax, Number(match[1]));
  }, 0);

  return `C${String(max + 1).padStart(3, "0")}`;
}
