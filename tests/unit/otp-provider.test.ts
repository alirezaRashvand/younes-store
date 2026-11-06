import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
  id: string;
  phoneNumber: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
  createdAt: Date;
}

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  devEnabled: true,
  counter: 0,
}));

type Where = {
  id?: string;
  phoneNumber?: string;
  consumedAt?: null;
  expiresAt?: { gt: Date };
  createdAt?: { gt: Date };
  attempts?: { lt: number };
};

function rows(): Row[] {
  return state.rows as Row[];
}

function matches(row: Row, where: Where): boolean {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.phoneNumber !== undefined && row.phoneNumber !== where.phoneNumber) return false;
  if (where.consumedAt === null && row.consumedAt !== null) return false;
  if (where.expiresAt && !(row.expiresAt > where.expiresAt.gt)) return false;
  if (where.createdAt && !(row.createdAt > where.createdAt.gt)) return false;
  if (where.attempts && !(row.attempts < where.attempts.lt)) return false;
  return true;
}

vi.mock("@/lib/db", () => {
  const db = {
    otpChallenge: {
      async findFirst({ where }: { where: Where }) {
        const found = rows()
          .filter((r) => matches(r, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return found[0] ? { ...found[0] } : null;
      },
      async create({ data }: { data: Pick<Row, "phoneNumber" | "codeHash" | "expiresAt"> }) {
        const row: Row = {
          id: `c${++state.counter}`,
          attempts: 0,
          consumedAt: null,
          createdAt: new Date(),
          ...data,
        };
        rows().push(row);
        return { id: row.id };
      },
      async updateMany({
        where,
        data,
      }: {
        where: Where;
        data: { attempts?: { increment: number }; consumedAt?: Date };
      }) {
        let count = 0;
        for (const row of rows()) {
          if (!matches(row, where)) continue;
          if (data.attempts) row.attempts += data.attempts.increment;
          if (data.consumedAt) row.consumedAt = data.consumedAt;
          count++;
        }
        return { count };
      },
    },
    // pg_advisory_xact_lock(...) returns void, so the service must use $executeRaw
    // ($queryRaw fails to deserialize it; covered by tests/integration/auth.test.ts).
    async $executeRaw() {
      return 0;
    },
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      return fn(db);
    },
  };
  return { prisma: db };
});

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ SESSION_SECRET: "test-secret-test-secret-test-secret-123" }),
  isDevelopmentOtpEnabled: () => state.devEnabled,
}));

import {
  DEVELOPMENT_FIXED_OTP,
  DevelopmentOtpProvider,
  OTP_MAX_ATTEMPTS,
  OTP_THROTTLE_MS,
  OTP_TTL_MS,
  ProductionOtpProvider,
  getOtpProvider,
  type SmsSender,
} from "@/features/auth/otp-provider";

const PHONE = "09123456789";

beforeEach(() => {
  state.rows = [];
  state.devEnabled = true;
  state.counter = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DevelopmentOtpProvider", () => {
  it("is selected by getOtpProvider() only when development OTP is enabled", () => {
    expect(getOtpProvider()).toBeInstanceOf(DevelopmentOtpProvider);
    state.devEnabled = false;
    expect(getOtpProvider()).toBeInstanceOf(ProductionOtpProvider);
  });

  it("cannot be constructed when development OTP is disabled", () => {
    state.devEnabled = false;
    expect(() => new DevelopmentOtpProvider()).toThrow();
  });

  it("creates a hashed challenge and accepts the fixed code once", async () => {
    const provider = new DevelopmentOtpProvider();
    const requested = await provider.requestOtp(PHONE);
    expect(requested).toEqual({ success: true });
    expect(rows()).toHaveLength(1);
    // Stored as a hash, never plaintext
    expect(rows()[0]!.codeHash).not.toContain(DEVELOPMENT_FIXED_OTP);
    expect(rows()[0]!.codeHash).toMatch(/^[a-f0-9]{64}$/);

    expect(await provider.verifyOtp(PHONE, DEVELOPMENT_FIXED_OTP)).toEqual({ success: true });
    // Single use
    expect((await provider.verifyOtp(PHONE, DEVELOPMENT_FIXED_OTP)).success).toBe(false);
  });

  it("rejects wrong codes", async () => {
    const provider = new DevelopmentOtpProvider();
    await provider.requestOtp(PHONE);
    expect((await provider.verifyOtp(PHONE, "000000")).success).toBe(false);
  });

  it("fails verification when no challenge was requested", async () => {
    const provider = new DevelopmentOtpProvider();
    expect((await provider.verifyOtp(PHONE, DEVELOPMENT_FIXED_OTP)).success).toBe(false);
  });

  it("throttles to one request per 60 seconds per phone", async () => {
    const provider = new DevelopmentOtpProvider();
    expect((await provider.requestOtp(PHONE)).success).toBe(true);
    expect((await provider.requestOtp(PHONE)).success).toBe(false);
    // Other phones are unaffected
    expect((await provider.requestOtp("09350000000")).success).toBe(true);

    vi.setSystemTime(Date.now() + OTP_THROTTLE_MS + 1000);
    expect((await provider.requestOtp(PHONE)).success).toBe(true);
  });

  it(`locks the challenge after ${OTP_MAX_ATTEMPTS} wrong attempts, even for the fixed code`, async () => {
    const provider = new DevelopmentOtpProvider();
    await provider.requestOtp(PHONE);
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      expect((await provider.verifyOtp(PHONE, "111111")).success).toBe(false);
    }
    expect(rows()[0]!.attempts).toBe(OTP_MAX_ATTEMPTS);
    expect((await provider.verifyOtp(PHONE, DEVELOPMENT_FIXED_OTP)).success).toBe(false);
  });

  it("expires challenges after 5 minutes", async () => {
    const provider = new DevelopmentOtpProvider();
    await provider.requestOtp(PHONE);
    vi.setSystemTime(Date.now() + OTP_TTL_MS + 1000);
    expect((await provider.verifyOtp(PHONE, DEVELOPMENT_FIXED_OTP)).success).toBe(false);
  });
});

describe("ProductionOtpProvider", () => {
  it("fails closed without an SMS sender and creates no challenge", async () => {
    const provider = new ProductionOtpProvider(null);
    const result = await provider.requestOtp(PHONE);
    expect(result.success).toBe(false);
    expect(rows()).toHaveLength(0);
  });

  it("rejects the fixed development code (no challenge, no bypass)", async () => {
    const provider = new ProductionOtpProvider(null);
    expect((await provider.verifyOtp(PHONE, DEVELOPMENT_FIXED_OTP)).success).toBe(false);
  });

  it("rejects the fixed code even when a real challenge exists, and accepts only the sent code", async () => {
    let sentCode = "";
    const sender: SmsSender = {
      async sendOtp(_phone, code) {
        sentCode = code;
        return true;
      },
    };
    const provider = new ProductionOtpProvider(sender);

    const requested = await provider.requestOtp(PHONE);
    // Response must never carry the OTP
    expect(requested).toEqual({ success: true });
    expect(JSON.stringify(requested)).not.toContain(sentCode);
    expect(sentCode).toMatch(/^\d{6}$/);

    const wrong = sentCode === DEVELOPMENT_FIXED_OTP ? "654321" : DEVELOPMENT_FIXED_OTP;
    expect((await provider.verifyOtp(PHONE, wrong)).success).toBe(false);
    expect(await provider.verifyOtp(PHONE, sentCode)).toEqual({ success: true });
  });

  it("invalidates the challenge when SMS delivery fails", async () => {
    const sender: SmsSender = { sendOtp: async () => false };
    const provider = new ProductionOtpProvider(sender);
    expect((await provider.requestOtp(PHONE)).success).toBe(false);
    expect(rows().every((r) => r.consumedAt !== null)).toBe(true);
  });
});
