import bcrypt from "bcryptjs";
import { MotorcycleOptionType, MotorcycleStatus, Prisma, UserRole } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db";
import { allowRoles } from "../lib/auth";

const webUrl = z.string().url().max(1000).refine((value) => ["http:", "https:"].includes(new URL(value).protocol));
const motorcycleYear = z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9][A-Za-z0-9 /.-]*$/, "Informe um ano válido, como 26/27.");

const motorcycleInput = z.object({
  brand: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(100),
  version: z.string().trim().max(100).optional(),
  year: motorcycleYear,
  modelYear: z.number().int().min(1900).max(2100).optional(),
  displacementCc: z.number().int().positive().max(3000).optional(),
  group: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).optional(),
  color: z.string().trim().max(60).optional(),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
    .max(12)
    .refine((colors) => new Set(colors).size === colors.length, "As cores não podem se repetir.")
    .optional(),
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
  availableToAllSellers: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  status: z.nativeEnum(MotorcycleStatus).optional(),
  primarySellerId: z.string().uuid().optional(),
});

const sellerInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().max(254).optional(),
  phone: z.string().trim().max(30).optional(),
  whatsapp: z.string().trim().max(30).optional(),
  photoUrl: webUrl.optional(),
  bio: z.string().max(1000).optional(),
});

function toSlug(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function adminRoutes(app: FastifyInstance) {
  app.get("/lead-sources", {
    preHandler: allowRoles(UserRole.ADMIN, UserRole.SELLER),
    schema: { tags: ["crm"], summary: "Listar origens de leads disponíveis", security: [{ sessionCookie: [] }] },
  }, async (_request, reply) => {
    const items = await prisma.motorcycleOption.findMany({
      where: { type: MotorcycleOptionType.ORIGIN },
      orderBy: { value: "asc" },
      select: { id: true, value: true },
    });
    return reply.send({ items });
  });

  app.get("/motorcycle-options", {
    preHandler: allowRoles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER),
    schema: { tags: ["inventory"], summary: "Listar opções para o cadastro de motocicletas", security: [{ sessionCookie: [] }] },
  }, async (_request, reply) => {
    const items = await prisma.motorcycleOption.findMany({
      orderBy: [{ type: "asc" }, { value: "asc" }],
    });
    return reply.send({ items });
  });

  app.post("/motorcycle-options", {
    preHandler: allowRoles(UserRole.ADMIN),
    schema: { tags: ["inventory"], summary: "Cadastrar opção para o cadastro de motocicletas", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const body = z.object({
      type: z.nativeEnum(MotorcycleOptionType),
      value: z.string().trim().min(1).max(100),
    }).superRefine(({ type, value }, context) => {
      if (type === MotorcycleOptionType.YEAR && !motorcycleYear.safeParse(value).success) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Informe um ano válido, como 2026 ou 26/27." });
      }
    }).parse(request.body);

    try {
      const item = await prisma.$transaction(async (tx) => {
        const created = await tx.motorcycleOption.create({ data: body });
        await tx.auditLog.create({
          data: {
            userId: request.user.sub,
            action: "motorcycle_option.created",
            entity: "MotorcycleOption",
            entityId: created.id,
            metadata: { type: created.type, value: created.value } as Prisma.InputJsonValue,
          },
        });
        return created;
      });
      return reply.code(201).send({ item });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return reply.code(409).send({ error: "option_exists", message: "Este valor já está cadastrado para esse tipo." });
      }
      throw error;
    }
  });

  app.patch("/motorcycle-options/:id", {
    preHandler: allowRoles(UserRole.ADMIN),
    schema: { tags: ["inventory"], summary: "Editar opção do cadastro de motocicletas", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const current = await prisma.motorcycleOption.findUnique({ where: { id }, select: { type: true } });
    if (!current) return reply.code(404).send({ error: "option_not_found", message: "Opção não encontrada." });
    const body = z.object({
      value: z.string().trim().min(1).max(100),
    }).superRefine(({ value }, context) => {
      if (current.type === MotorcycleOptionType.YEAR && !motorcycleYear.safeParse(value).success) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Informe um ano válido, como 2026 ou 26/27." });
      }
    }).parse(request.body);

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const item = await tx.motorcycleOption.update({ where: { id }, data: { value: body.value } });
        await tx.auditLog.create({
          data: {
            userId: request.user.sub,
            action: "motorcycle_option.updated",
            entity: "MotorcycleOption",
            entityId: item.id,
            metadata: { type: item.type, value: item.value } as Prisma.InputJsonValue,
          },
        });
        return item;
      });
      return reply.send({ item: updated });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          return reply.code(409).send({ error: "option_exists", message: "Este valor já está cadastrado para esse tipo." });
        }
        if (error.code === "P2025") {
          return reply.code(404).send({ error: "option_not_found", message: "Opção não encontrada." });
        }
      }
      throw error;
    }
  });

  app.delete("/motorcycle-options/:id", {
    preHandler: allowRoles(UserRole.ADMIN),
    schema: { tags: ["inventory"], summary: "Excluir opção do cadastro de motocicletas", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    try {
      await prisma.$transaction(async (tx) => {
        const item = await tx.motorcycleOption.delete({ where: { id } });
        await tx.auditLog.create({
          data: {
            userId: request.user.sub,
            action: "motorcycle_option.deleted",
            entity: "MotorcycleOption",
            entityId: item.id,
            metadata: { type: item.type, value: item.value } as Prisma.InputJsonValue,
          },
        });
      });
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return reply.code(404).send({ error: "option_not_found", message: "Opção não encontrada." });
      }
      throw error;
    }
  });

  app.get("/users", {
    preHandler: allowRoles(UserRole.ADMIN),
    schema: { tags: ["auth"], summary: "Listar contas de acesso", security: [{ sessionCookie: [] }] },
  }, async (_request, reply) => {
    const items = await prisma.user.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        seller: { select: { id: true, name: true } },
      },
    });
    return reply.send({ items });
  });

  app.post("/users", {
    preHandler: allowRoles(UserRole.ADMIN),
    schema: { tags: ["auth"], summary: "Criar conta de acesso", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const body = z.object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
      password: z.string().min(12).max(200),
      role: z.nativeEnum(UserRole),
      sellerId: z.string().uuid().optional(),
    }).superRefine((value, context) => {
      if (value.role === UserRole.SELLER && !value.sellerId) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["sellerId"], message: "Vincule o vendedor à conta." });
      }
      if (value.role !== UserRole.SELLER && value.role !== UserRole.SUPPORT && value.sellerId) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["sellerId"], message: "Este perfil não pode ser vinculado a um vendedor." });
      }
    }).parse(request.body);

    const [existingUser, seller] = await Promise.all([
      prisma.user.findUnique({ where: { email: body.email }, select: { id: true } }),
      body.sellerId
        ? prisma.seller.findUnique({ where: { id: body.sellerId }, select: { id: true, userId: true, isActive: true } })
        : Promise.resolve(null),
    ]);
    if (existingUser) return reply.code(409).send({ error: "email_in_use", message: "Já existe uma conta com este e-mail." });
    if (body.sellerId && !seller) return reply.code(404).send({ error: "seller_not_found", message: "Vendedor não encontrado." });
    if (seller && !seller.isActive) return reply.code(409).send({ error: "seller_inactive", message: "Ative o cadastro do vendedor antes de vincular uma conta." });
    if (seller?.userId) return reply.code(409).send({ error: "seller_already_linked", message: "Este vendedor já está vinculado a uma conta." });

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name: body.name, email: body.email, passwordHash, role: body.role },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      });
      if (body.sellerId) await tx.seller.update({ where: { id: body.sellerId }, data: { userId: created.id } });
      await tx.auditLog.create({
        data: { userId: request.user.sub, action: "user.created", entity: "User", entityId: created.id },
      });
      return created;
    });
    return reply.code(201).send({ user });
  });

  app.patch("/users/:id", {
    preHandler: allowRoles(UserRole.ADMIN),
    schema: { tags: ["auth"], summary: "Atualizar conta de acesso", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({
      name: z.string().trim().min(2).max(120).optional(),
      email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()).optional(),
      password: z.string().min(12).max(200).optional(),
      role: z.nativeEnum(UserRole).optional(),
      sellerId: z.string().uuid().nullable().optional(),
      isActive: z.boolean().optional(),
    }).parse(request.body);
    const current = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, isActive: true, seller: { select: { id: true } } },
    });
    if (!current) return reply.code(404).send({ error: "not_found", message: "Conta não encontrada." });

    const role = body.role ?? current.role;
    const sellerId = body.sellerId === undefined ? current.seller?.id ?? null : body.sellerId;
    const isActive = body.isActive ?? current.isActive;
    if (id === request.user.sub && (!isActive || role !== current.role)) {
      return reply.code(400).send({ error: "self_access_change", message: "Não é possível bloquear ou alterar o perfil da própria conta." });
    }
    if (role === UserRole.SELLER && !sellerId) {
      return reply.code(400).send({ error: "seller_required", message: "Vincule um vendedor à conta com perfil de vendedor." });
    }
    if (role !== UserRole.SELLER && role !== UserRole.SUPPORT && sellerId) {
      return reply.code(400).send({ error: "seller_not_allowed", message: "Este perfil não pode ser vinculado a um vendedor." });
    }
    if (current.role === UserRole.ADMIN && (role !== UserRole.ADMIN || !isActive)) {
      const activeAdmins = await prisma.user.count({ where: { role: UserRole.ADMIN, isActive: true } });
      if (activeAdmins <= 1) {
        return reply.code(409).send({ error: "last_admin", message: "A última conta de administrador não pode ser bloqueada ou rebaixada." });
      }
    }

    if (body.email && body.email !== current.email) {
      const emailOwner = await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } });
      if (emailOwner) return reply.code(409).send({ error: "email_in_use", message: "Já existe uma conta com este e-mail." });
    }
    if (sellerId) {
      const seller = await prisma.seller.findUnique({ where: { id: sellerId }, select: { id: true, userId: true, isActive: true } });
      if (!seller) return reply.code(404).send({ error: "seller_not_found", message: "Vendedor não encontrado." });
      if (!seller.isActive) return reply.code(409).send({ error: "seller_inactive", message: "Ative o cadastro do vendedor antes de vincular uma conta." });
      if (seller.userId && seller.userId !== id) {
        return reply.code(409).send({ error: "seller_already_linked", message: "Este vendedor já está vinculado a outra conta." });
      }
    }

    const passwordHash = body.password ? await bcrypt.hash(body.password, 12) : undefined;
    const updated = await prisma.$transaction(async (tx) => {
      await tx.seller.updateMany({ where: { userId: id }, data: { userId: null } });
      if (sellerId) await tx.seller.update({ where: { id: sellerId }, data: { userId: id } });
      const user = await tx.user.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.email !== undefined ? { email: body.email } : {}),
          ...(passwordHash ? { passwordHash, failedLoginCount: 0, lockedUntil: null } : {}),
          role,
          isActive,
          ...((body.password || role !== current.role || isActive !== current.isActive) ? { authVersion: { increment: 1 } } : {}),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          seller: { select: { id: true, name: true } },
        },
      });
      await tx.auditLog.create({
        data: { userId: request.user.sub, action: "user.updated", entity: "User", entityId: id },
      });
      return user;
    });
    return reply.send({ user: updated });
  });

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
    const body = motorcycleInput.partial().extend({
      version: z.string().trim().max(100).nullable().optional(),
      modelYear: z.number().int().min(1900).max(2100).nullable().optional(),
      displacementCc: z.number().int().positive().max(3000).nullable().optional(),
      group: z.string().trim().max(80).nullable().optional(),
      category: z.string().trim().max(80).nullable().optional(),
      color: z.string().trim().max(60).nullable().optional(),
      mileageKm: z.number().int().nonnegative().nullable().optional(),
      fuelType: z.string().trim().max(60).nullable().optional(),
      transmission: z.string().trim().max(60).nullable().optional(),
      promotionalCents: z.string().regex(/^\d+$/).nullable().optional(),
      description: z.string().max(5000).nullable().optional(),
      imageUrl: webUrl.nullable().optional(),
      internalCode: z.string().trim().max(80).nullable().optional(),
      primarySellerId: z.string().uuid().nullable().optional(),
    }).parse(request.body);
    const { primarySellerId, priceCents, promotionalCents, specifications, ...fields } = body;
    const data: Prisma.MotorcycleUpdateInput = {
      ...fields,
      ...(priceCents !== undefined ? { priceCents: BigInt(priceCents) } : {}),
      ...(promotionalCents !== undefined ? { promotionalCents: promotionalCents === null ? null : BigInt(promotionalCents) } : {}),
      ...(specifications !== undefined ? { specifications: specifications as Prisma.InputJsonValue } : {}),
      ...(primarySellerId !== undefined
        ? { primarySeller: primarySellerId ? { connect: { id: primarySellerId } } : { disconnect: true } }
        : {}),
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
    const body = sellerInput.parse(request.body);
    const slug = `${toSlug(body.name)}-${randomUUID().slice(0, 6)}`;
    const seller = await prisma.seller.create({ data: { ...body, slug } });
    await prisma.auditLog.create({
      data: { userId: request.user.sub, action: "seller.created", entity: "Seller", entityId: seller.id },
    });
    return reply.code(201).send({ seller });
  });

  app.patch("/sellers/:id", {
    preHandler: allowRoles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER),
    schema: { tags: ["inventory"], summary: "Atualizar vendedor", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = sellerInput.partial().extend({
      email: z.string().email().max(254).nullable().optional(),
      phone: z.string().trim().max(30).nullable().optional(),
      whatsapp: z.string().trim().max(30).nullable().optional(),
      photoUrl: webUrl.nullable().optional(),
      bio: z.string().max(1000).nullable().optional(),
    }).parse(request.body);
    const seller = await prisma.seller.update({ where: { id }, data: body });
    await prisma.auditLog.create({
      data: { userId: request.user.sub, action: "seller.updated", entity: "Seller", entityId: id },
    });
    return reply.send({ seller });
  });
}
