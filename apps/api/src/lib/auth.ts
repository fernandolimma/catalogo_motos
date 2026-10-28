import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import type { UserRole } from "@prisma/client";
import { prisma } from "../db";

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.origin;
    const allowed = process.env.WEB_ORIGIN?.split(",").map((value) => value.trim()) ?? ["http://localhost:5173"];
    if (!origin || !allowed.includes(origin)) {
      return reply.code(403).send({ error: "forbidden", message: "Origem da solicitação não autorizada." });
    }
  }
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "unauthorized", message: "Autenticação necessária." });
  }
  const active = await prisma.user.findFirst({
    where: { id: request.user.sub, isActive: true },
    select: { id: true },
  });
  if (!active) {
    reply.clearCookie("catalogo_session", { path: "/" });
    return reply.code(401).send({ error: "unauthorized", message: "Sessão inválida." });
  }
}

export function allowRoles(...roles: UserRole[]): preHandlerHookHandler {
  return async (request, reply) => {
    const authError = await authenticate(request, reply);
    if (authError) return authError;
    if (!roles.includes(request.user.role as UserRole)) {
      return reply.code(403).send({ error: "forbidden", message: "Você não tem permissão para esta ação." });
    }
  };
}

export function setAuthCookie(reply: FastifyReply, token: string) {
  reply.setCookie("catalogo_session", token, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 60 * 60,
  });
}
