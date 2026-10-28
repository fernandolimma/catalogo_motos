import dotenv from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
