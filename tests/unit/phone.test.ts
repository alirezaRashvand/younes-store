import { describe, expect, it } from "vitest";
import { isValidIranianPhone, normalizeIranianPhone } from "@/lib/phone";
import { phoneSchema, otpCodeSchema } from "@/features/auth/phone-schema";

describe("normalizeIranianPhone", () => {
  it.each([
    ["09123456789", "09123456789"],
    ["+989123456789", "09123456789"],
    ["989123456789", "09123456789"],
    ["9123456789", "09123456789"],
    ["0912 345 6789", "09123456789"],
    ["0912-345-6789", "09123456789"],
    ["(0912) 3456789", "09123456789"],
  ])("normalizes %s -> %s", (input, expected) => {
    expect(normalizeIranianPhone(input)).toBe(expected);
  });

  it.each(["", "abc", "0812345678", "0912345678", "091234567890", "02112345678", "+19123456789"])(
    "rejects %j",
    (input) => {
      expect(normalizeIranianPhone(input)).toBeNull();
      expect(isValidIranianPhone(input)).toBe(false);
    },
  );
});

describe("phoneSchema", () => {
  it("accepts Persian and Arabic digits and outputs canonical form", () => {
    expect(phoneSchema.parse("۰۹۱۲۳۴۵۶۷۸۹")).toBe("09123456789");
    expect(phoneSchema.parse("٠٩١٢٣٤٥٦٧٨٩")).toBe("09123456789");
    expect(phoneSchema.parse("  +989123456789 ")).toBe("09123456789");
  });

  it("rejects invalid numbers with a Persian message", () => {
    const result = phoneSchema.safeParse("12345");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("معتبر");
    }
  });
});

describe("otpCodeSchema", () => {
  it("accepts 6 digits (including Persian digits)", () => {
    expect(otpCodeSchema.parse("123456")).toBe("123456");
    expect(otpCodeSchema.parse("۱۲۳۴۵۶")).toBe("123456");
  });

  it.each(["12345", "1234567", "abcdef", ""])("rejects %j", (code) => {
    expect(otpCodeSchema.safeParse(code).success).toBe(false);
  });
});
