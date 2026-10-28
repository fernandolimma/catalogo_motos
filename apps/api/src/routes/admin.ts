import { MotorcycleStatus, Prisma, UserRole } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db";
import { allowRoles } from "../lib/auth";

const webUrl = z.string().url().max(1000).refine((value) => ["http:", "https:"].includes(new URL(value).protocol));

const motorcycleInput = z.object({
  brand: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(100),
  version: z.string().trim().max(100).optional(),
  year: z.number().int().min(1900).max(2100),
  modelYear: z.number().int().min(1900).max(2100).optional(),
  displacementCc: z.number().int().positive().max(3000).optional(),
  category: z.string().trim().max(80).optional(),
  color: z.string().trim().max(60).optional(),
  mileageKm: z.number().int().nonnegative().optional(),
  fuelType: z.string().trim().max(60).optional(),
  transmission: z.string().trim().max(60).optional(),
  priceCents: z.string().regex(/^\d+$/),
  promotionalCents: z.string().regex(/^\d+$/).optional(),
  description: z.string().max(5000).optional(),
  specifications: z.record(z.unknown()).optional(),
  imageUrl: webUrl.optional(),
  internalCode: z.string().trim().max(80).optional(),
  isPublished: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  status: z.nativeEnum(MotorcycleStatus).optional(),
  primarySellerId: z.string().uuid().optional(),
});

function toSlug(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function adminRoutes(app: FastifyInstance) {
  app.get("/motorcycles", {
    preHandler: allowRoles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER),
    schema: { tags: ["inventory"], summary: "Listar estoque", security: [{ sessionCookie: [] }] },
  }, async (_request, reply) => {
    const motorcycles = await prisma.motorcycle.findMany({
      orderBy: { updatedAt: "desc" },
      include: { primarySeller: { select: { id: true, name: true } } },
    });
    return reply.send({
      items: motorcycles.map((motorcycle) => ({
        ...motorcycle,
        priceCents: motorcycle.priceCents.toString(),
        promotionalCents: motorcycle.promotionalCents?.toString() ?? null,
      })),
    });
  });

  app.post("/motorcycles", {
    preHandler: allowRoles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER),
    schema: { tags: ["inventory"], summary: "Cadastrar motocicleta", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const body = motorcycleInput.parse(request.body);
    const baseSlug = toSlug([body.brand, body.model, body.year, body.version].filter(Boolean).join(" "));
    const slug = `${baseSlug}-${randomUUID().slice(0, 8)}`;
    const motorcycle = await prisma.motorcycle.create({
      data: {
        ...body,
        slug,
        priceCents: BigInt(body.priceCents),
        promotionalCents: body.promotionalCents ? BigInt(body.promotionalCents) : null,
        specifications: (body.specifications ?? {}) as Prisma.InputJsonValue,
      },
    });
    await prisma.auditLog.create({
      data: { userId: request.user.sub, action: "motorcycle.created", entity: "Motorcycle", entityId: motorcycle.id },
    });
    return reply.code(201).send({
      motorcycle: { ...motorcycle, priceCents: motorcycle.priceCents.toString(), promotionalCents: motorcycle.promotionalCents?.toString() ?? null },
    });
  });

  app.patch("/motorcycles/:id", {
    preHandler: allowRoles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER),
    schema: { tags: ["inventory"], summary: "Atualizar motocicleta", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = motorcycleInput.partial().parse(request.body);
    const { primarySellerId, priceCents, promotionalCents, specifications, ...fields } = body;
    const data: Prisma.MotorcycleUpdateInput = {
      ...fields,
      ...(priceCents !== undefined ? { priceCents: BigInt(priceCents) } : {}),
      ...(promotionalCents !== undefined ? { promotionalCents: BigInt(promotionalCents) } : {}),
      ...(specifications ? { specifications: specifications as Prisma.InputJsonValue } : {}),
      ...(primarySellerId ? { primarySeller: { connect: { id: primarySellerId } } } : {}),
    };
    const motorcycle = await prisma.motorcycle.update({ where: { id }, data });
    await prisma.auditLog.create({
      data: { userId: request.user.sub, action: "motorcycle.updated", entity: "Motorcycle", entityId: id },
    });
    return reply.send({
      motorcycle: { ...motorcycle, priceCents: motorcycle.priceCents.toString(), promotionalCents: motorcycle.promotionalCents?.toString() ?? null },
    });
  });

  app.get("/sellers", {
    preHandler: allowRoles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER),
    schema: { tags: ["inventory"], summary: "Listar vendedores", security: [{ sessionCookie: [] }] },
  }, async (_request, reply) => {
    const items = await prisma.seller.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { leads: true, motorcycles: true } } },
    });
    return reply.send({ items });
  });

  app.post("/sellers", {
    preHandler: allowRoles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER),
    schema: { tags: ["inventory"], summary: "Cadastrar vendedor", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const body = z.object({
      name: z.string().trim().min(2).max(120),
      email: z.string().email().max(254).optional(),
      phone: z.string().trim().max(30).optional(),
      whatsapp: z.string().trim().max(30).optional(),
      photoUrl: webUrl.optional(),
      bio: z.string().max(1000).optional(),
    }).parse(request.body);
    const slug = `${toSlug(body.name)}-${randomUUID().slice(0, 6)}`;
    const seller = await prisma.seller.create({ data: { ...body, slug } });
    await prisma.auditLog.create({
      data: { userId: request.user.sub, action: "seller.created", entity: "Seller", entityId: seller.id },
    });
    return reply.code(201).send({ seller });
  });
}
