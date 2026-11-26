import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.WHATSAPP_TEST_DATABASE_URL;

test("creates users with optional seller links and preserves seller validation", { skip: !databaseUrl }, async () => {
  if (!databaseUrl || new URL(databaseUrl).pathname !== "/catalogo_whatsapp_test") {
    throw new Error("WHATSAPP_TEST_DATABASE_URL must point to the isolated catalogo_whatsapp_test database.");
  }
  process.env.DATABASE_URL = databaseUrl;
  process.env.WEB_ORIGIN = "http://localhost:5173";

  const { buildApp } = await import("./app.js");
  const { prisma } = await import("./db.js");
  const app = await buildApp();
  const adminId = randomUUID();
  const sellerId = randomUUID();
  const createdIds: string[] = [];

  try {
    await prisma.user.create({
      data: { id: adminId, name: "Admin teste", email: `${adminId}@example.invalid`, passwordHash: "test", role: "ADMIN" },
    });
    await prisma.seller.create({ data: { id: sellerId, name: "Vendedor teste", slug: `seller-${sellerId}` } });
    const token = app.jwt.sign({ sub: adminId, email: `${adminId}@example.invalid`, role: "ADMIN", ver: 0 });
    const headers = { authorization: `Bearer ${token}`, origin: "http://localhost:5173" };
    const create = (role: string, sellerIdValue?: string | null) => app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers,
      payload: {
        name: "Usuário teste", email: `${randomUUID()}@example.invalid`, password: "senha-segura-123",
        role, ...(sellerIdValue !== undefined ? { sellerId: sellerIdValue } : {}),
      },
    });

    for (const role of ["MANAGER", "SUPERVISOR", "ADMIN", "SUPPORT"]) {
      for (const sellerIdValue of [null, undefined]) {
        const response = await create(role, sellerIdValue);
        assert.equal(response.statusCode, 201, `${role}: ${response.body}`);
        createdIds.push(response.json<{ user: { id: string } }>().user.id);
      }
    }

    for (const sellerIdValue of [null, undefined, "invalid-uuid"]) {
      const response = await create("SELLER", sellerIdValue);
      assert.equal(response.statusCode, 400);
    }
    assert.equal((await create("MANAGER", sellerId)).statusCode, 400);

    const sellerResponse = await create("SELLER", sellerId);
    assert.equal(sellerResponse.statusCode, 201, sellerResponse.body);
    const sellerUserId = sellerResponse.json<{ user: { id: string } }>().user.id;
    createdIds.push(sellerUserId);
    assert.equal((await prisma.seller.findUniqueOrThrow({ where: { id: sellerId } })).userId, sellerUserId);

    const edit = await app.inject({
      method: "PATCH", url: `/api/v1/users/${sellerUserId}`, headers,
      payload: { role: "MANAGER", sellerId: null },
    });
    assert.equal(edit.statusCode, 200, edit.body);
    assert.equal((await prisma.seller.findUniqueOrThrow({ where: { id: sellerId } })).userId, null);
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: adminId } });
    await prisma.seller.deleteMany({ where: { id: sellerId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, ...createdIds] } } });
    await app.close();
  }
});
