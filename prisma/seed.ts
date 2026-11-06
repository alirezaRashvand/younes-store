import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserRole } from "../generated/prisma/client";
import { normalizeIranianPhone } from "../lib/phone";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required for seeding");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function seedStoreSettings() {
  await prisma.storeSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      storeName: "یونس",
      additionalDescription:
        "فروشگاه تجهیزات گرمایشی، سرمایشی، پکیج، کولر گازی و ابزارآلات برودتی",
    },
    update: {},
  });
}

/**
 * Idempotent root admin seed.
 * - Creates ADMIN if phone is unused.
 * - Does NOT silently promote an existing CUSTOMER.
 * - Does NOT demote or overwrite an existing ADMIN with a different phone.
 */
async function seedRootAdmin() {
  const raw = process.env.ROOT_ADMIN_PHONE;
  if (!raw) {
    console.warn("ROOT_ADMIN_PHONE is not set; skipping admin seed.");
    return;
  }

  const phone = normalizeIranianPhone(raw);
  if (!phone) {
    throw new Error(`ROOT_ADMIN_PHONE is invalid: ${raw}`);
  }

  const existingAdmin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN },
  });

  if (existingAdmin) {
    if (existingAdmin.phoneNumber === phone) {
      console.log(`Root admin already present: ${phone}`);
      return;
    }
    console.warn(
      `An ADMIN already exists (${existingAdmin.phoneNumber}). ` +
        `Refusing to create/promote another admin for ${phone}.`,
    );
    return;
  }

  const existingUser = await prisma.user.findUnique({
    where: { phoneNumber: phone },
  });

  if (existingUser) {
    if (existingUser.role === UserRole.CUSTOMER) {
      throw new Error(
        `Phone ${phone} belongs to a CUSTOMER. ` +
          `Promote explicitly via a controlled admin promotion process — seed will not change roles silently.`,
      );
    }
    return;
  }

  await prisma.user.create({
    data: {
      phoneNumber: phone,
      name: "مدیر فروشگاه",
      role: UserRole.ADMIN,
    },
  });

  console.log(`Root admin created for ${phone}`);
}

async function main() {
  await seedStoreSettings();
  await seedRootAdmin();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
