const tomanFormatter = new Intl.NumberFormat("fa-IR");

export function formatToman(amount: bigint | number | null | undefined): string {
  if (amount === null || amount === undefined) {
    return "تماس بگیرید";
  }
  const value = typeof amount === "bigint" ? Number(amount) : amount;
  if (!Number.isFinite(value)) {
    return "تماس بگیرید";
  }
  return `${tomanFormatter.format(value)} تومان`;
}

export function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!);
}

export function fromPersianDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/** Normalize Persian/Arabic text for search matching */
export function normalizePersianText(input: string): string {
  return input
    .normalize("NFC")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/أ|إ|آ/g, "ا")
    .replace(/[\u064B-\u065F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function slugifyPersian(input: string): string {
  return normalizePersianText(input)
    .replace(/[^\u0600-\u06FFa-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}
