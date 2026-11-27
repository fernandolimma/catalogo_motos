import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.WHATSAPP_TEST_DATABASE_URL;

test("manual leads can reference available catalog motorcycles", { skip: !databaseUrl }, async () => {
  if (!databaseUrl || new URL(databaseUrl).pathname !== "/catalogo_whatsapp_test") {
    throw new Error("WHATSAPP_TEST_DATABASE_URL must point to the isolated catalogo_whatsapp_test database.");
  }
  process.env.DATABASE_URL = databaseUrl;
  process.env.WEB_ORIGIN = "http://localhost:5173";

  const { buildApp } = await import("./app.js");
  const { prisma } = await import("./db.js");
  const app = await buildApp();
  const adminId = randomUUID();
  const userId = randomUUID();
  const sellerId = randomUUID();
  const originId = randomUUID();
  const motorcycleId = randomUUID();
  const unavailableId = randomUUID();
  const unpublishedId = randomUUID();
  const createdIds: string[] = [];

  try {
    await prisma.user.createMany({ data: [
      { id: adminId, name: "Admin teste", email: `${adminId}@example.invalid`, passwordHash: "test", role: "ADMIN" },
      { id: userId, name: "Vendedor teste", email: `${userId}@example.invalid`, passwordHash: "test", role: "SELLER" },
    ] });
    await prisma.seller.create({ data: { id: sellerId, userId, name: "Vendedor teste", slug: `seller-${sellerId}` } });
    await prisma.motorcycleOption.create({ data: { id: originId, type: "ORIGIN", value: `origem-${originId}` } });
    await prisma.motorcycle.createMany({ data: [
      { id: motorcycleId, slug: `moto-${motorcycleId}`, brand: "Honda", model: "Biz Kuromi", year: "26/27", priceCents: 100n, isPublished: true },
      { id: unavailableId, slug: `moto-${unavailableId}`, brand: "Honda", model: "Vendida", year: "26/27", priceCents: 100n, isPublished: true, status: "SOLD" },
      { id: unpublishedId, slug: `moto-${unpublishedId}`, brand: "Honda", model: "Rascunho", year: "26/27", priceCents: 100n, isPublished: false },
    ] });
    const headers = (id: string, role: "ADMIN" | "SELLER") => ({
      authorization: `Bearer ${app.jwt.sign({ sub: id, email: `${id}@example.invalid`, role, ver: 0 })}`,
      origin: "http://localhost:5173",
    });

    const create = (user: typeof adminId, role: "ADMIN" | "SELLER", phone: string, selected?: string) => app.inject({
      method: "POST",
      url: "/api/v1/leads/manual",
      headers: headers(user, role),
      payload: {
        sellerId, name: "Lead teste", phone, email: "lead@example.invalid", originId,
        ...(selected ? { motorcycleId: selected } : {}),
      },
    });

    for (const [user, role, phone] of [[adminId, "ADMIN", "11987654321"], [userId, "SELLER", "11987654322"]] as const) {
      const response = await create(user, role, phone, motorcycleId);
      assert.equal(response.statusCode, 201, response.body);
      const id = response.json<{ lead: { id: string } }>().lead.id;
      createdIds.push(id);
      const lead = await prisma.lead.findUniqueOrThrow({ where: { id }, include: { interests: true } });
      assert.equal(lead.motorcycleId, motorcycleId);
      assert.equal(lead.interests.length, 1);
      assert.equal(lead.interests[0]?.motorcycleId, motorcycleId);
      const list = await app.inject({ method: "GET", url: "/api/v1/leads", headers: headers(user, role) });
      assert.equal(list.statusCode, 200);
      assert.deepEqual(list.json<{ items: { id: string; motorcycle: { brand: string; model: string } | null }[] }>()
        .items.find((item) => item.id === id)?.motorcycle, { id: motorcycleId, brand: "Honda", model: "Biz Kuromi", slug: `moto-${motorcycleId}` });
    }

    const without = await create(adminId, "ADMIN", "11987654323");
    assert.equal(without.statusCode, 201, without.body);
    const withoutId = without.json<{ lead: { id: string; motorcycleId: string | null } }>().lead.id;
    createdIds.push(withoutId);
    assert.equal(without.json<{ lead: { motorcycleId: string | null } }>().lead.motorcycleId, null);
    assert.equal(await prisma.leadInterest.count({ where: { leadId: withoutId } }), 0);

    const firstId = createdIds[0];
    assert.ok(firstId);
    const move = async (id: string, stage: string) => {
      const response = await app.inject({
        method: "PATCH", url: `/api/v1/crm/leads/${id}/stage`, headers: headers(userId, "SELLER"),
        payload: { stage, ...(stage === "LOST" ? { lostReason: "Sem interesse" } : {}) },
      });
      assert.equal(response.statusCode, 200, response.body);
    };
    const remarketing = async (id: string) => {
      const list = await app.inject({ method: "GET", url: "/api/v1/leads?limit=100", headers: headers(userId, "SELLER") });
      assert.equal(list.statusCode, 200);
      const item = list.json<{ items: { id: string; isRemarketing: boolean }[] }>().items.find((lead) => lead.id === id);
      const detail = await app.inject({ method: "GET", url: `/api/v1/leads/${id}`, headers: headers(userId, "SELLER") });
      assert.equal(detail.statusCode, 200);
      const detailValue = detail.json<{ lead: { isRemarketing: boolean } }>().lead.isRemarketing;
      assert.equal(item?.isRemarketing, detailValue);
      return detailValue;
    };
    assert.equal(await remarketing(firstId), false);
    await move(firstId, "WAITING");
    await move(firstId, "NEW");
    assert.equal(await remarketing(firstId), false);
    await move(firstId, "LOST");
    assert.equal(await remarketing(firstId), false);
    await move(firstId, "NEW");
    assert.equal(await remarketing(firstId), true);
    await move(firstId, "CONTACTED");
    assert.equal(await remarketing(firstId), true);
    await move(withoutId, "LOST");
    await move(withoutId, "WAITING");
    await move(withoutId, "NEW");
    assert.equal(await remarketing(withoutId), false);

    for (const id of [unavailableId, unpublishedId, randomUUID()]) {
      const response = await create(adminId, "ADMIN", "11987654324", id);
      assert.equal(response.statusCode, 409);
      assert.equal(response.json<{ error: string }>().error, "unavailable");
    }
    assert.equal((await create(adminId, "ADMIN", "11987654324", "invalid")).statusCode, 400);
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: { in: [adminId, userId] } } });
    await prisma.lead.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.motorcycle.deleteMany({ where: { id: { in: [motorcycleId, unavailableId, unpublishedId] } } });
    await prisma.motorcycleOption.deleteMany({ where: { id: originId } });
    await prisma.seller.deleteMany({ where: { id: sellerId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, userId] } } });
    await app.close();
  }
});

test("reports compare received leads and their current won stage by source within seller scope", { skip: !databaseUrl }, async () => {
  if (!databaseUrl || new URL(databaseUrl).pathname !== "/catalogo_whatsapp_test") {
    throw new Error("WHATSAPP_TEST_DATABASE_URL must point to the isolated catalogo_whatsapp_test database.");
  }
  process.env.DATABASE_URL = databaseUrl;
  process.env.WEB_ORIGIN = "http://localhost:5173";

  const { buildApp } = await import("./app.js");
  const { prisma } = await import("./db.js");
  const app = await buildApp();
  const adminId = randomUUID();
  const userId = randomUUID();
  const sellerId = randomUUID();
  const sourceA = `origem-a-${randomUUID()}`;
  const sourceB = `origem-b-${randomUUID()}`;
  const leadIds: string[] = [];

  try {
    await prisma.user.createMany({ data: [
      { id: adminId, name: "Admin teste", email: `${adminId}@example.invalid`, passwordHash: "test", role: "ADMIN" },
      { id: userId, name: "Vendedor teste", email: `${userId}@example.invalid`, passwordHash: "test", role: "SELLER" },
    ] });
    await prisma.seller.create({ data: { id: sellerId, userId, name: "Vendedor teste", slug: `seller-${sellerId}` } });
    const leads = [
      { source: sourceA, stage: "WON" as const, sellerId, createdAt: new Date("2001-02-01T00:00:00Z"), soldAt: new Date("2001-03-01T00:00:00Z") },
      { source: sourceA, stage: "NEW" as const, sellerId, createdAt: new Date("2001-02-28T23:59:59Z") },
      { source: sourceB, stage: "NEW" as const, sellerId, createdAt: new Date("2001-02-15T12:00:00Z") },
      { source: sourceA, stage: "WON" as const, sellerId: null, createdAt: new Date("2001-02-15T12:00:00Z") },
      { source: sourceA, stage: "WON" as const, sellerId, createdAt: new Date("2001-03-01T00:00:00Z"), soldAt: new Date("2001-02-15T12:00:00Z") },
    ];
    await prisma.lead.createMany({ data: leads.map((lead) => {
      const id = randomUUID();
      leadIds.push(id);
      return { ...lead, id, name: "Lead teste", phone: id, normalizedPhone: id };
    }) });

    const getReport = async (id: string, role: "ADMIN" | "SELLER", from = "2001-02-01", to = "2001-02-28") => {
      const response = await app.inject({
        method: "GET", url: `/api/v1/crm/reports?from=${from}&to=${to}`,
        headers: { authorization: `Bearer ${app.jwt.sign({ sub: id, email: `${id}@example.invalid`, role, ver: 0 })}` },
      });
      assert.equal(response.statusCode, 200, response.body);
      return response.json<{ bySource: Array<{ source: string; total: number; won: number }> }>().bySource;
    };
    const sellerReport = await getReport(userId, "SELLER");
    assert.deepEqual(sellerReport.find(({ source }) => source === sourceA), { source: sourceA, total: 2, won: 1 });
    assert.deepEqual(sellerReport.find(({ source }) => source === sourceB), { source: sourceB, total: 1, won: 0 });
    const adminReport = await getReport(adminId, "ADMIN");
    assert.deepEqual(adminReport.find(({ source }) => source === sourceA), { source: sourceA, total: 3, won: 2 });
    const emptyReport = await getReport(userId, "SELLER", "2000-01-01", "2000-01-31");
    assert.deepEqual(emptyReport, []);
  } finally {
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.seller.deleteMany({ where: { id: sellerId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, userId] } } });
    await app.close();
  }
});
