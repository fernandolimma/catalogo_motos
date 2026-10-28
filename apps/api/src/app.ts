import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import { ZodError } from "zod";
import { prisma } from "./db";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { crmRoutes } from "./routes/crm";
import { publicRoutes } from "./routes/public";

export async function buildApp() {
  if (process.env.NODE_ENV === "production" && (process.env.JWT_SECRET?.length ?? 0) < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters in production.");
  }
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "development" ? "debug" : "info",
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie", "req.body.password", "req.body.apiKey"],
        censor: "[REDACTED]",
      },
    },
    trustProxy: process.env.NODE_ENV === "production",
  });
  app.addHook("onClose", async () => prisma.$disconnect());
  app.setReplySerializer((payload) => JSON.stringify(payload, (_key, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value,
  ));

  await app.register(cors, {
    origin: process.env.WEB_ORIGIN?.split(",").map((value) => value.trim()) ?? ["http://localhost:5173"],
    credentials: true,
  });
  await app.register(helmet);
  await app.register(cookie);
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "development-secret-change-before-running",
    cookie: { cookieName: "catalogo_session", signed: false },
    sign: { expiresIn: "1h" },
  });
  await app.register(rateLimit, { global: true, max: 120, timeWindow: "1 minute" });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Catalogo_Motos API",
        description: "API de catálogo, autenticação e gestão de leads.",
        version: "1.0.0",
      },
      servers: [{ url: "/" }],
      components: {
        securitySchemes: {
          sessionCookie: {
            type: "apiKey",
            in: "cookie",
            name: "catalogo_session",
            description: "Cookie de sessão HttpOnly obtido pelo endpoint de login.",
          },
        },
      },
      tags: [
        { name: "auth", description: "Autenticação" },
        { name: "public", description: "Catálogo e captação de leads" },
        { name: "crm", description: "Gestão comercial" },
        { name: "inventory", description: "Estoque e vendedores" },
      ],
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "validation_error",
        message: "Confira os campos informados.",
        details: error.issues.map(({ path, message }) => ({ path: path.join("."), message })),
      });
    }
    request.log.error({ err: error }, "Request failed");
    return reply.code(500).send({ error: "internal_error", message: "Não foi possível concluir a solicitação." });
  });

  app.get("/health", async (_request, reply) => {
    await prisma.$queryRaw`SELECT 1`;
    return reply.send({ status: "ok" });
  });

  await app.register(async (api) => {
    await api.register(authRoutes, { prefix: "/auth" });
    await api.register(publicRoutes, { prefix: "/public" });
    await api.register(crmRoutes);
    await api.register(adminRoutes);
  }, { prefix: "/api/v1" });

  return app;
}
