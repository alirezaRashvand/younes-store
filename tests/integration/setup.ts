/**
 * Integration test setup.
 *
 *  1. Points the app at an isolated `*_test` database BEFORE lib/db is imported.
 *  2. Hard-refuses to run against anything that is not a `*_test` database.
 *  3. Provides in-memory replacements for `next/headers`, `next/cache` and the AWS SDK.
 *  4. Truncates every table (RESTART IDENTITY CASCADE) before each test.
 */
import { afterAll, beforeEach, vi } from "vitest";

// ── 1 + 2: database selection and safety guard (runs before any app import) ──────

const DEFAULT_TEST_DATABASE_URL = "postgresql://alirezarashvand@localhost:5432/younes_store_test";
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;

function databaseNameOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}

const databaseName = databaseNameOf(testDatabaseUrl);
if (!databaseName.endsWith("_test")) {
  throw new Error(
    `Refusing to run integration tests: database "${databaseName || "<unparseable>"}" does not end in "_test".`,
  );
}

process.env.DATABASE_URL = testDatabaseUrl;
// getEnv() needs these; the .env file is not loaded by vitest.
process.env.SESSION_SECRET = "integration-test-session-secret-0123456789abcdef";
process.env.OTP_MODE = "development";
process.env.S3_ENDPOINT = "https://s3.test.invalid";
process.env.S3_REGION = "us-east-1";
process.env.S3_BUCKET = "test-bucket";
process.env.S3_ACCESS_KEY_ID = "test-access-key";
process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
process.env.S3_PUBLIC_BASE_URL = "";
process.env.S3_FORCE_PATH_STYLE = "true";

// ── 3: module mocks ─────────────────────────────────────────────────────────────

vi.mock("next/headers", async () => {
  const { cookieJar, headerJar } = await import("./helpers/cookie-jar");
  return {
    cookies: async () => cookieJar,
    headers: async () => ({
      get: (name: string) => headerJar.get(name.toLowerCase()) ?? null,
    }),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  updateTag: () => undefined,
  refresh: () => undefined,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@aws-sdk/client-s3", async () => {
  const { s3State, FakeS3Error } = await import("./helpers/s3-mock");

  class Command {
    constructor(readonly input: { Key?: string } & Record<string, unknown>) {}
  }
  class HeadObjectCommand extends Command {}
  class PutObjectCommand extends Command {}
  class DeleteObjectCommand extends Command {}

  class S3Client {
    async send(command: Command): Promise<unknown> {
      const key = String(command.input.Key);
      if (command instanceof HeadObjectCommand) {
        s3State.headCalls.push(key);
        const object = s3State.objects.get(key);
        if (!object) throw new FakeS3Error("NotFound", 404);
        return { ContentLength: object.size, ContentType: object.contentType ?? undefined };
      }
      if (command instanceof DeleteObjectCommand) {
        if (s3State.failDelete) throw new FakeS3Error("InternalError", 500);
        s3State.deletedKeys.push(key);
        s3State.objects.delete(key);
        return {};
      }
      throw new Error(`Unexpected S3 command: ${command.constructor.name}`);
    }
  }

  return { S3Client, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand };
});

vi.mock("@aws-sdk/s3-request-presigner", async () => {
  const { s3State } = await import("./helpers/s3-mock");
  return {
    getSignedUrl: async (_client: unknown, command: { input: Record<string, unknown> }) => {
      s3State.presignedCommands.push(command.input);
      return `https://s3.test.invalid/test-bucket/${String(command.input.Key)}?signature=fake`;
    },
  };
});

// ── 4: per-test database reset ──────────────────────────────────────────────────

const { prisma } = await import("@/lib/db");
const { cookieJar, headerJar } = await import("./helpers/cookie-jar");
const { s3State } = await import("./helpers/s3-mock");

async function truncateAllTables(): Promise<void> {
  // Second line of defence: ask the server which database we are really connected to.
  const [{ current_database }] = await prisma.$queryRaw<Array<{ current_database: string }>>`
    SELECT current_database()
  `;
  if (!current_database.endsWith("_test")) {
    throw new Error(`Refusing to TRUNCATE: connected to "${current_database}", not a *_test database.`);
  }

  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

beforeEach(async () => {
  cookieJar.clear();
  headerJar.clear();
  s3State.reset();
  await truncateAllTables();
});

afterAll(async () => {
  await prisma.$disconnect();
});
