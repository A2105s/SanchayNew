/**
 * CNR (Case Number Record) is the only identifier eCourts exposes for a case:
 * 4-letter court code + 6-digit case number + 4-digit filing year, 16 characters total.
 * Kept free of server-only imports so the rule can be unit-tested directly.
 */
export const CNR_PATTERN = /^[A-Z]{4}\d{12}$/u;

/** Normalises operator input into a CNR, or null when it cannot possibly be one. */
export function normaliseCnr(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toUpperCase().replace(/\s+/gu, '');
  return CNR_PATTERN.test(value) ? value : null;
}
