import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { normalizePhone } from "../lib/phone";

const catalogQuery = z.object({
  q: z.string().trim().max(100).optional(),
  brand: z.string().trim().max(60).optional(),
  category: z.string().trim().max(60).optional(),
  minPrice: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  maxPrice: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});

const leadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(10).max(30),
  email: z.union([z.string().email().max(254), z.literal("")]).optional(),
  message: z.string().trim().max(2000).optional(),
  bestContactTime: z.string().trim().max(100).optional(),
  motorcycleSlug: z.string().trim().max(180).optional(),
  sellerSlug: z.string().trim().max(180).optional(),
  sourcePage: z.string().trim().max(500).optional(),
  utm: z.record(z.string().max(200)).optional(),
  consent: z.literal(true),
});

function publicMotorcycle<T extends {
  priceCents: bigint;
  promotionalCents: bigint | null;
}>(motorcycle: T) {
  return {
    ...motorcycle,
    priceCents: motorcycle.priceCents.toString(),
    promotionalCents: motorcycle.promotionalCents?.toString() ?? null,
  };
}

export async function publicRoutes(app: FastifyInstance) {
  app.get("/motorcycles", {
    schema: { tags: ["public"], summary: "Listar motos publicadas", querystring: { type: "object" } },
  }, async (request, reply) => {
    const query = catalogQuery.parse(request.query);
    const where: Prisma.MotorcycleWhereInput = {
      isPublished: true,
      status: "AVAILABLE",
      ...(query.brand ? { brand: { equals: query.brand, mode: "insensitive" } } : {}),
      ...(query.category ? { category: { equals: query.category, mode: "insensitive" } } : {}),
      ...(query.q ? {
        OR: [
          { brand: { contains: query.q, mode: "insensitive" } },
          { model: { contains: query.q, mode: "insensitive" } },
          { version: { contains: query.q, mode: "insensitive" } },
        ],
      } : {}),
      ...(query.minPrice !== undefined ? { priceCents: { gte: BigInt(query.minPrice * 100) } } : {}),
      ...(query.maxPrice !== undefined ? {
        priceCents: { ...(query.minPrice !== undefined ? { gte: BigInt(query.minPrice * 100) } : {}), lte: BigInt(query.maxPrice * 100) },
      } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.motorcycle.findMany({
        where,
        orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { images: { orderBy: { position: "asc" } } },
      }),
      prisma.motorcycle.count({ where }),
    ]);
    return reply.send({
      items: items.map(publicMotorcycle),
      pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
    });
  });

  app.get("/motorcycles/:slug", {
    schema: { tags: ["public"], summary: "Consultar detalhes de uma moto" },
  }, async (request, reply) => {
    const { slug } = z.object({ slug: z.string().max(180) }).parse(request.params);
    const motorcycle = await prisma.motorcycle.findFirst({
      where: { slug, isPublished: true, status: "AVAILABLE" },
      include: {
        images: { orderBy: { position: "asc" } },
        primarySeller: { select: { name: true, slug: true, phone: true, whatsapp: true } },
      },
    });
    if (!motorcycle) return reply.code(404).send({ error: "not_found", message: "Motocicleta não encontrada." });
    return reply.send({ motorcycle: publicMotorcycle(motorcycle) });
  });

  app.get("/sellers/:slug", {
    schema: { tags: ["public"], summary: "Consultar catálogo de vendedor" },
  }, async (request, reply) => {
    const { slug } = z.object({ slug: z.string().max(180) }).parse(request.params);
    const seller = await prisma.seller.findFirst({
      where: { slug, isActive: true },
      select: {
        name: true, slug: true, bio: true, photoUrl: true, whatsapp: true,
        primaryMotos: {
          where: { isPublished: true, status: "AVAILABLE" },
          include: { images: { orderBy: { position: "asc" } } },
        },
        motorcycles: {
          where: { motorcycle: { isPublished: true, status: "AVAILABLE" } },
          include: { motorcycle: { include: { images: { orderBy: { position: "asc" } } } } },
        },
      },
    });
    if (!seller) return reply.code(404).send({ error: "not_found", message: "Vendedor não encontrado." });
    return reply.send({
      seller: {
        ...seller,
        motorcycles: [
          ...seller.primaryMotos,
          ...seller.motorcycles.map(({ motorcycle }) => motorcycle),
        ].filter((motorcycle, index, list) => list.findIndex((item) => item.id === motorcycle.id) === index)
          .map(publicMotorcycle),
      },
    });
  });

  app.get("/sellers", {
    schema: { tags: ["public"], summary: "Listar vendedores ativos" },
  }, async (_request, reply) => {
    const sellers = await prisma.seller.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { name: true, slug: true, bio: true, photoUrl: true, whatsapp: true },
    });
    return reply.send({ items: sellers });
  });

  app.post("/leads", {
    config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    schema: {
      tags: ["public"],
      summary: "Registrar interesse no catálogo",
      body: {
        type: "object",
        required: ["name", "phone", "consent"],
        properties: {
          name: { type: "string", minLength: 2 },
          phone: { type: "string", description: "Telefone com DDD." },
          email: { type: "string", format: "email" },
          message: { type: "string" },
          bestContactTime: { type: "string" },
          motorcycleSlug: { type: "string" },
          sellerSlug: { type: "string" },
          sourcePage: { type: "string" },
          utm: { type: "object", additionalProperties: { type: "string" } },
          consent: { type: "boolean", enum: [true] },
        },
      },
    },
  }, async (request, reply) => {
    const body = leadSchema.parse(request.body);
    const normalizedPhone = normalizePhone(body.phone);
    if (!normalizedPhone) {
      return reply.code(400).send({ error: "invalid_phone", message: "Informe um telefone com DDD válido." });
    }

    const rawIdempotencyKey = request.headers["idempotency-key"];
    if (rawIdempotencyKey !== undefined && (typeof rawIdempotencyKey !== "string" || rawIdempotencyKey.length > 100)) {
      return reply.code(400).send({ error: "invalid_idempotency_key", message: "Chave de idempotência inválida." });
    }
    const key = typeof rawIdempotencyKey === "string" ? rawIdempotencyKey : undefined;
    if (key) {
      const replay = await prisma.idempotencyRecord.findUnique({
        where: { key },
        include: { lead: { select: { id: true, normalizedPhone: true } } },
      });
      if (replay) {
        if (replay.lead.normalizedPhone !== normalizedPhone) {
          return reply.code(409).send({ error: "idempotency_conflict", message: "A chave já foi utilizada em outra solicitação." });
        }
        return reply.send({ message: "Recebemos seu interesse. A equipe entrará em contato.", leadId: replay.lead.id });
      }
    }

    const motorcycle = body.motorcycleSlug
      ? await prisma.motorcycle.findFirst({
        where: { slug: body.motorcycleSlug, isPublished: true, status: "AVAILABLE" },
        select: { id: true, primarySellerId: true },
      })
      : null;
    if (body.motorcycleSlug && !motorcycle) {
      return reply.code(409).send({ error: "unavailable", message: "Esta motocicleta não está mais disponível." });
    }
    const seller = body.sellerSlug
      ? await prisma.seller.findFirst({ where: { slug: body.sellerSlug, isActive: true }, select: { id: true } })
      : null;
    if (body.sellerSlug && !seller) {
      return reply.code(404).send({ error: "seller_not_found", message: "Vendedor não encontrado." });
    }
    if (seller && motorcycle && seller.id !== motorcycle.primarySellerId) {
      const association = await prisma.sellerMotorcycle.findUnique({
        where: { sellerId_motorcycleId: { sellerId: seller.id, motorcycleId: motorcycle.id } },
        select: { sellerId: true },
      });
      if (!association) {
        return reply.code(409).send({ error: "seller_not_assigned", message: "Este vendedor não está associado à motocicleta." });
      }
    }

    const email = body.email || undefined;
    let lead: { id: string };
    try {
      lead = await prisma.$transaction(async (tx) => {
        if (key) {
          const replay = await tx.idempotencyRecord.findUnique({
            where: { key },
            include: { lead: { select: { id: true, normalizedPhone: true } } },
          });
          if (replay) {
            if (replay.lead.normalizedPhone !== normalizedPhone) throw new Error("idempotency_conflict");
            return replay.lead;
          }
        }

        const record = await tx.lead.upsert({
          where: { normalizedPhone },
          create: {
            name: body.name,
            phone: body.phone,
            normalizedPhone,
            email,
            message: body.message,
            bestContactTime: body.bestContactTime,
            source: body.utm?.utm_source ?? "catalog",
            sourcePage: body.sourcePage,
            utm: (body.utm ?? {}) as Prisma.InputJsonValue,
            motorcycleId: motorcycle?.id,
            sellerId: seller?.id ?? motorcycle?.primarySellerId,
            stageHistory: { create: { toStage: "NEW" } },
          },
          update: {
            ...(email ? { email } : {}),
            ...(body.message ? { message: body.message } : {}),
            ...(body.bestContactTime ? { bestContactTime: body.bestContactTime } : {}),
          },
        });

        if (motorcycle) {
          await tx.leadInterest.upsert({
            where: { leadId_motorcycleId: { leadId: record.id, motorcycleId: motorcycle.id } },
            create: { leadId: record.id, motorcycleId: motorcycle.id },
            update: {},
          });
        }
        await tx.leadActivity.create({
          data: {
            leadId: record.id,
            type: "CREATED",
            content: "Interesse recebido pelo catálogo público.",
            metadata: { sourcePage: body.sourcePage ?? "", motorcycleSlug: body.motorcycleSlug ?? "" },
          },
        });
        await tx.consentRecord.upsert({
          where: { leadId: record.id },
          create: { leadId: record.id, purpose: "Contato sobre solicitação comercial", accepted: true, policyVersion: "1" },
          update: { accepted: true, purpose: "Contato sobre solicitação comercial" },
        });
        if (key) await tx.idempotencyRecord.create({ data: { key, leadId: record.id } });
        return record;
      });
    } catch (error) {
      if (error instanceof Error && error.message === "idempotency_conflict") {
        return reply.code(409).send({ error: "idempotency_conflict", message: "A chave já foi utilizada em outra solicitação." });
      }
      if (key && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const replay = await prisma.idempotencyRecord.findUnique({
          where: { key },
          include: { lead: { select: { id: true, normalizedPhone: true } } },
        });
        if (replay?.lead.normalizedPhone === normalizedPhone) {
          return reply.send({ message: "Recebemos seu interesse. A equipe entrará em contato.", leadId: replay.lead.id });
        }
        if (replay) {
          return reply.code(409).send({ error: "idempotency_conflict", message: "A chave já foi utilizada em outra solicitação." });
        }
      }
      throw error;
    }

    return reply.code(201).send({ message: "Recebemos seu interesse. A equipe entrará em contato.", leadId: lead.id });
  });
}
