import { ActivityType, LeadStage, Prisma, UserRole } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db";
import { allowRoles } from "../lib/auth";

const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  stage: z.nativeEnum(LeadStage).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const reportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Informe uma data válida."),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Informe uma data válida."),
}).superRefine(({ from, to }, context) => {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  const days = (end.getTime() - start.getTime()) / 86_400_000;
  if (days < 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "A data final deve ser igual ou posterior à inicial." });
  } else if (days > 364) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "O período máximo do relatório é de 365 dias." });
  }
});

async function leadScope(request: FastifyRequest, where: Prisma.LeadWhereInput = {}) {
  if (request.user.role === UserRole.ADMIN || request.user.role === UserRole.MANAGER || request.user.role === UserRole.SUPERVISOR) {
    return where;
  }
  if (request.user.role === UserRole.SELLER || request.user.role === UserRole.SUPPORT) {
    const seller = await prisma.seller.findUnique({ where: { userId: request.user.sub }, select: { id: true } });
    return { ...where, sellerId: seller?.id ?? "00000000-0000-0000-0000-000000000000" };
  }
  return { ...where, sellerId: "00000000-0000-0000-0000-000000000000" };
}

async function mayAccessLead(request: FastifyRequest, leadId: string) {
  const where = await leadScope(request, { id: leadId });
  return prisma.lead.findFirst({ where, select: { id: true, stage: true, sellerId: true } });
}

export async function crmRoutes(app: FastifyInstance) {
  app.get("/leads", {
    preHandler: allowRoles("ADMIN", "SUPERVISOR", "MANAGER", "SELLER", "SUPPORT"),
    schema: { tags: ["crm"], summary: "Listar leads com paginação", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const query = listQuerySchema.parse(request.query);
    const where = await leadScope(request, {
      ...(query.stage ? { stage: query.stage } : {}),
      ...(query.q ? {
        OR: [
          { name: { contains: query.q, mode: "insensitive" } },
          { phone: { contains: query.q } },
          { email: { contains: query.q, mode: "insensitive" } },
        ],
      } : {}),
    });
    const [items, total] = await prisma.$transaction([
      prisma.lead.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          seller: { select: { id: true, name: true, slug: true } },
          motorcycle: { select: { id: true, brand: true, model: true, slug: true } },
          activities: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        },
      }),
      prisma.lead.count({ where }),
    ]);
    return reply.send({
      items,
      pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
    });
  });

  app.get("/leads/:id", {
    preHandler: allowRoles("ADMIN", "SUPERVISOR", "MANAGER", "SELLER", "SUPPORT"),
    schema: { tags: ["crm"], summary: "Consultar ficha e histórico do lead", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const scope = await leadScope(request, { id });
    const lead = await prisma.lead.findFirst({
      where: scope,
      include: {
        seller: { select: { id: true, name: true, slug: true } },
        motorcycle: true,
        interests: { include: { motorcycle: { select: { id: true, brand: true, model: true, slug: true } } } },
        activities: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } },
        stageHistory: { orderBy: { createdAt: "desc" } },
        tasks: { orderBy: { dueAt: "asc" } },
        consent: true,
      },
    });
    if (!lead) return reply.code(404).send({ error: "not_found", message: "Lead não encontrado." });
    return reply.send({ lead });
  });

  app.patch("/crm/leads/:id/stage", {
    preHandler: allowRoles("ADMIN", "SUPERVISOR", "MANAGER", "SELLER", "SUPPORT"),
    schema: { tags: ["crm"], summary: "Alterar etapa do funil", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({
      stage: z.nativeEnum(LeadStage),
      salePriceCents: z.string().regex(/^\d+$/).optional(),
      lostReason: z.string().trim().max(500).optional(),
      sellerId: z.string().uuid().optional(),
    }).parse(request.body);
    const current = await mayAccessLead(request, id);
    if (!current) return reply.code(404).send({ error: "not_found", message: "Lead não encontrado." });
    if (body.stage === LeadStage.LOST && !body.lostReason) {
      return reply.code(400).send({ error: "missing_lost_reason", message: "Informe o motivo da perda." });
    }

    const lead = await prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: {
          stage: body.stage,
          ...(body.sellerId ? { sellerId: body.sellerId } : {}),
          ...(body.stage === LeadStage.WON ? { soldAt: new Date() } : {}),
          ...(body.salePriceCents ? { salePriceCents: BigInt(body.salePriceCents) } : {}),
          ...(body.stage === LeadStage.LOST ? { lostReason: body.lostReason } : {}),
        },
      });
      if (current.stage !== body.stage) {
        await tx.leadStageHistory.create({
          data: { leadId: id, fromStage: current.stage, toStage: body.stage, userId: request.user.sub },
        });
        await tx.leadActivity.create({
          data: {
            leadId: id,
            userId: request.user.sub,
            type: ActivityType.STAGE_CHANGED,
            content: `Etapa alterada de ${current.stage} para ${body.stage}.`,
          },
        });
        if (body.sellerId) {
          await tx.leadActivity.create({
            data: {
              leadId: id,
              userId: request.user.sub,
              type: ActivityType.ASSIGNMENT,
              content: `Lead atribuído ao vendedor selecionado.`,
              metadata: { sellerId: body.sellerId } as Prisma.InputJsonValue,
            },
          });
        }
        await tx.auditLog.create({
          data: {
            userId: request.user.sub,
            action: "lead.stage.changed",
            entity: "Lead",
            entityId: id,
            metadata: { from: current.stage, to: body.stage } as Prisma.InputJsonValue,
          },
        });
      }
      return updated;
    });
    return reply.send({ lead });
  });

  app.post("/leads/:id/activities", {
    preHandler: allowRoles("ADMIN", "SUPERVISOR", "MANAGER", "SELLER", "SUPPORT"),
    schema: { tags: ["crm"], summary: "Registrar atividade do lead", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({
      type: z.enum(["NOTE", "CALL", "WHATSAPP", "EMAIL"]),
      content: z.string().trim().min(1).max(4000),
    }).parse(request.body);
    if (!await mayAccessLead(request, id)) {
      return reply.code(404).send({ error: "not_found", message: "Lead não encontrado." });
    }
    const activity = await prisma.leadActivity.create({
      data: { leadId: id, userId: request.user.sub, type: body.type, content: body.content },
    });
    return reply.code(201).send({ activity });
  });

  app.get("/crm/overview", {
    preHandler: allowRoles("ADMIN", "SUPERVISOR", "MANAGER", "SELLER", "SUPPORT"),
    schema: { tags: ["crm"], summary: "Consultar indicadores atuais do funil", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const where = await leadScope(request);
    const [total, byStage, latest] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.groupBy({ by: ["stage"], where, _count: { _all: true } }),
      prisma.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, createdAt: true, stage: true, sellerId: true, motorcycleId: true },
      }),
    ]);
    return reply.send({
      total,
      byStage: Object.fromEntries(byStage.map(({ stage, _count }) => [stage, _count._all])),
      latest,
      conversion: total ? Math.round((byStage.find(({ stage }) => stage === LeadStage.WON)?._count._all ?? 0) / total * 10000) / 100 : 0,
    });
  });

  app.get("/crm/reports", {
    preHandler: allowRoles("ADMIN", "SUPERVISOR", "MANAGER", "SELLER", "SUPPORT"),
    schema: { tags: ["crm"], summary: "Consultar relatório comercial por período", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const query = reportQuerySchema.parse(request.query);
    const from = new Date(`${query.from}T00:00:00.000Z`);
    const toExclusive = new Date(`${query.to}T00:00:00.000Z`);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    const where = await leadScope(request, { createdAt: { gte: from, lt: toExclusive } });
    const sellerId = typeof where.sellerId === "string" ? where.sellerId : undefined;
    const salesWhere: Prisma.LeadWhereInput = {
      ...await leadScope(request),
      stage: LeadStage.WON,
      soldAt: { gte: from, lt: toExclusive },
    };

    const [total, byStage, bySource, bySeller, sales, dailyTrend] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.groupBy({ by: ["stage"], where, _count: { _all: true } }),
      prisma.lead.groupBy({ by: ["source"], where, _count: { _all: true }, orderBy: { _count: { id: "desc" } } }),
      prisma.lead.groupBy({ by: ["sellerId"], where, _count: { _all: true }, orderBy: { _count: { id: "desc" } } }),
      prisma.lead.aggregate({
        where: salesWhere,
        _count: { _all: true },
        _sum: { salePriceCents: true },
      }),
      prisma.$queryRaw<Array<{ day: string; total: number }>>(Prisma.sql`
        SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, count(*)::int AS total
        FROM "Lead"
        WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}
        ${sellerId ? Prisma.sql`AND "sellerId" = ${sellerId}::uuid` : Prisma.empty}
        GROUP BY to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
        ORDER BY day
      `),
    ]);

    const sellerIds = bySeller.flatMap(({ sellerId: id }) => id ? [id] : []);
    const sellers = sellerIds.length
      ? await prisma.seller.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true } })
      : [];
    const sellerNames = new Map(sellers.map(({ id, name }) => [id, name]));
    const leadsWon = byStage.find(({ stage }) => stage === LeadStage.WON)?._count._all ?? 0;
    const revenue = sales._sum.salePriceCents ?? 0n;

    return reply.send({
      period: { from: query.from, to: query.to },
      totals: {
        leads: total,
        won: leadsWon,
        lost: byStage.find(({ stage }) => stage === LeadStage.LOST)?._count._all ?? 0,
        conversion: total ? Math.round((leadsWon / total) * 10_000) / 100 : 0,
        sales: sales._count._all,
        revenueCents: revenue.toString(),
      },
      byStage: Object.fromEntries(byStage.map(({ stage, _count }) => [stage, _count._all])),
      bySource: bySource.map(({ source, _count }) => ({ source, total: _count._all })),
      bySeller: bySeller.map(({ sellerId: id, _count }) => ({
        sellerId: id,
        sellerName: id ? sellerNames.get(id) ?? "Vendedor removido" : "Sem atribuição",
        total: _count._all,
      })),
      dailyTrend: dailyTrend.map(({ day, total: count }) => ({
        date: day,
        total: count,
      })),
    });
  });
}
