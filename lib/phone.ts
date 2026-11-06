/**
 * Normalize Iranian mobile numbers to canonical form: 09XXXXXXXXX
 * Accepts: 09123456789, +989123456789, 989123456789, 9123456789
 */
export function normalizeIranianPhone(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, "").replace(/^\+/, "");

  let national = digits;
  if (national.startsWith("98")) {
    national = national.slice(2);
  }
  if (national.startsWith("0")) {
    national = national.slice(1);
  }

  if (!/^9\d{9}$/.test(national)) {
    return null;
  }

  return `0${national}`;
}

export function isValidIranianPhone(input: string): boolean {
  return normalizeIranianPhone(input) !== null;
}

export function formatPhoneForDisplay(phone: string): string {
  const normalized = normalizeIranianPhone(phone) ?? phone;
  if (normalized.length === 11) {
    return `${normalized.slice(0, 4)} ${normalized.slice(4, 7)} ${normalized.slice(7)}`;
  }
  return normalized;
}
