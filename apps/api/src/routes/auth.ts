import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db";
import { authenticate, setAuthCookie } from "../lib/auth";

const loginSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(200),
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/login", {
    config: { rateLimit: { max: 8, timeWindow: "15 minutes" } },
    schema: { tags: ["auth"], summary: "Entrar no painel" },
  }, async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive || (user.lockedUntil && user.lockedUntil > new Date())) {
      return reply.code(401).send({ error: "invalid_credentials", message: "E-mail ou senha inválidos." });
    }
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      const failures = await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      });
      if (failures.failedLoginCount >= 5) {
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
        });
      }
      return reply.code(401).send({ error: "invalid_credentials", message: "E-mail ou senha inválidos." });
    }

    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
    const token = await reply.jwtSign({ sub: user.id, email: user.email, role: user.role });
    setAuthCookie(reply, token);
    return reply.send({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  });

  app.post("/logout", { schema: { tags: ["auth"], summary: "Encerrar sessão" } }, async (_request, reply) => {
    reply.clearCookie("catalogo_session", { path: "/", sameSite: "strict", secure: process.env.COOKIE_SECURE === "true" });
    return reply.code(204).send();
  });

  app.get("/me", {
    preHandler: authenticate,
    schema: { tags: ["auth"], summary: "Consultar usuário autenticado", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    if (!user?.isActive) {
      reply.clearCookie("catalogo_session", { path: "/" });
      return reply.code(401).send({ error: "unauthorized", message: "Sessão inválida." });
    }
    return reply.send({ user });
  });
}
