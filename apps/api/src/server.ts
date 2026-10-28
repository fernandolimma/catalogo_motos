import { buildApp } from "./app";
import { prisma } from "./db";

async function main() {
  const app = await buildApp();
  const port = Number(process.env.API_PORT ?? 3001);
  const host = process.env.API_HOST ?? "0.0.0.0";

  await prisma.$connect();
  await app.listen({ port, host });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void app.close().catch((error: unknown) => {
        app.log.error({ err: error }, "Failed to close API cleanly");
        process.exitCode = 1;
      });
    });
  }
}

main().catch(async (error: unknown) => {
  console.error("API startup failed", error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
