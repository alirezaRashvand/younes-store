import { describe, expect, it } from "vitest";
import { formatToman } from "@/lib/format";
import { priceSchema, stockSchema } from "@/features/products/schema";

describe("formatToman", () => {
  it("returns the call-us label for null/undefined", () => {
    expect(formatToman(null)).toBe("تماس بگیرید");
    expect(formatToman(undefined)).toBe("تماس بگیرید");
  });

  it("returns the call-us label for non-finite numbers", () => {
    expect(formatToman(Number.NaN)).toBe("تماس بگیرید");
    expect(formatToman(Number.POSITIVE_INFINITY)).toBe("تماس بگیرید");
  });

  it("formats numbers and bigints with Persian digits and unit", () => {
    expect(formatToman(150000)).toBe("۱۵۰٬۰۰۰ تومان");
    expect(formatToman(BigInt(2500000))).toBe("۲٬۵۰۰٬۰۰۰ تومان");
  });

  it("treats zero as a real price, not as missing", () => {
    expect(formatToman(0)).toContain("تومان");
    expect(formatToman(BigInt(0))).toContain("تومان");
  });
});

describe("priceSchema", () => {
  it("allows null / empty string as 'no price'", () => {
    expect(priceSchema.parse(null)).toBeNull();
    expect(priceSchema.parse("")).toBeNull();
  });

  it("parses numbers, bigints and formatted strings into bigint", () => {
    expect(priceSchema.parse(1000)).toBe(BigInt(1000));
    expect(priceSchema.parse(BigInt(5))).toBe(BigInt(5));
    expect(priceSchema.parse("۱٬۲۵۰٬۰۰۰")).toBe(BigInt(1250000));
    expect(priceSchema.parse("1,250,000")).toBe(BigInt(1250000));
  });

  it("rejects negatives, decimals and garbage", () => {
    expect(priceSchema.safeParse(-1).success).toBe(false);
    expect(priceSchema.safeParse("-5").success).toBe(false);
    expect(priceSchema.safeParse(BigInt(-1)).success).toBe(false);
    expect(priceSchema.safeParse(10.5).success).toBe(false);
    expect(priceSchema.safeParse("abc").success).toBe(false);
  });
});

describe("stockSchema", () => {
  it("accepts non-negative integers", () => {
    expect(stockSchema.parse(0)).toBe(0);
    expect(stockSchema.parse("۱۲")).toBe(12);
  });

  it("rejects negatives and fractions", () => {
    expect(stockSchema.safeParse(-1).success).toBe(false);
    expect(stockSchema.safeParse(1.5).success).toBe(false);
  });
});
