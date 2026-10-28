import dotenv from "dotenv";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error("Set ADMIN_EMAIL and an ADMIN_PASSWORD with at least 12 characters before seeding.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    create: {
      name: process.env.ADMIN_NAME?.trim() || "Administrador",
      email,
      passwordHash,
      role: "ADMIN",
    },
    update: { name: process.env.ADMIN_NAME?.trim() || "Administrador", passwordHash, role: "ADMIN", isActive: true },
  });

  if (process.env.SEED_DEMO_DATA === "true") {
    await prisma.motorcycle.upsert({
      where: { slug: "demo-honda-cg-160-2024" },
      create: {
        slug: "demo-honda-cg-160-2024",
        brand: "DEMO",
        model: "Motocicleta de demonstração",
        year: 2024,
        priceCents: 0n,
        description: "Registro demonstrativo de desenvolvimento. Substitua pelos dados reais da loja.",
        isPublished: false,
        status: "UNAVAILABLE",
      },
      update: {},
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
