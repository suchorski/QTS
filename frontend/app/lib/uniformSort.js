export function buildUniformSortKey(uniformName) {
  const normalized = String(uniformName || "").trim().toUpperCase();
  const match = normalized.match(/^(\d+)(.*)$/);

  if (!match) {
    return normalized;
  }

  const numericPart = match[1].padStart(3, "0");
  const suffixPart = String(match[2] || "").trim();
  return `${numericPart} ${suffixPart}`.trim();
}
