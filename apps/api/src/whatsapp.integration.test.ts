import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.WHATSAPP_TEST_DATABASE_URL;

test("isolates WhatsApp accounts and enforces read-only cross-account access", { skip: !databaseUrl }, async () => {
  if (!databaseUrl || new URL(databaseUrl).pathname !== "/catalogo_whatsapp_test") {
    throw new Error("WHATSAPP_TEST_DATABASE_URL must point to the isolated catalogo_whatsapp_test database.");
  }
  process.env.DATABASE_URL = databaseUrl;
  process.env.EVOLUTION_API_URL = "http://evolution.test";
  process.env.EVOLUTION_API_KEY = "test-api-key";
  process.env.EVOLUTION_WEBHOOK_SECRET = "test-webhook-secret";
  process.env.WEB_ORIGIN = "http://localhost:5173";

  const { buildApp } = await import("./app.js");
  const { prisma } = await import("./db.js");
  const app = await buildApp();
  const originalFetch = globalThis.fetch;
  const accounts = new Set<string>();
  const sentPaths: string[] = [];
  const sentAudio: { number: string; audio: string }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.startsWith("/instance/connectionState/")) {
      const name = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      return Response.json(accounts.has(name) ? { instance: { state: "open" } } : {}, { status: accounts.has(name) ? 200 : 404 });
    }
    if (url.pathname === "/instance/create" && typeof init?.body === "string") {
      const body: { instanceName: string } = JSON.parse(init.body);
      accounts.add(body.instanceName);
      return Response.json({ qrcode: { base64: "test-qr" } });
    }
    if (url.pathname.startsWith("/message/sendText/")) {
      sentPaths.push(url.pathname);
      return Response.json({ key: { id: randomUUID() }, message: { conversation: "test" } });
    }
    if (url.pathname.startsWith("/message/sendWhatsAppAudio/") && typeof init?.body === "string") {
      sentPaths.push(url.pathname);
      sentAudio.push(JSON.parse(init.body));
      return Response.json({ key: { id: randomUUID() }, message: { audioMessage: { mimetype: "audio/ogg; codecs=opus", ptt: true } } });
    }
    if (url.pathname.startsWith("/chat/getBase64FromMediaMessage/")) {
      return Response.json({ base64: "dGVzdA==", mimetype: "image/png" });
    }
    throw new Error(`Unexpected Evolution request: ${url.pathname}`);
  };

  const ids = Array.from({ length: 5 }, () => randomUUID());
  const [adminId, managerId, firstSellerId, secondSellerId, supportId] = ids;
  const legacyName = `legacy-test-${randomUUID()}`;
  const sellerId = randomUUID();
  const leadId = randomUUID();
  if (!adminId || !managerId || !firstSellerId || !secondSellerId || !supportId) throw new Error("Missing test user IDs.");

  try {
    for (const [id, role] of [
      [adminId, "ADMIN"], [managerId, "MANAGER"], [firstSellerId, "SELLER"], [secondSellerId, "SELLER"], [supportId, "SUPPORT"],
    ] as const) {
      await prisma.user.create({ data: { id, name: role, email: `${id}@example.invalid`, passwordHash: "test", role } });
    }
    const token = (id: string) => app.jwt.sign({ sub: id, email: `${id}@example.invalid`, role: "SELLER", ver: 0 });
    const headers = (id: string) => ({ authorization: `Bearer ${token(id)}`, origin: "http://localhost:5173" });

    for (const id of [firstSellerId, secondSellerId, supportId]) {
      const response = await app.inject({ method: "POST", url: "/api/v1/whatsapp/connect", headers: headers(id) });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().qrCode, "test-qr");
      assert.equal(accounts.has(`catalogo-user-${id}`), true);
      const status = await app.inject({ method: "GET", url: "/api/v1/whatsapp/status", headers: headers(id) });
      assert.equal(status.statusCode, 200);
      assert.equal(status.json().state, "open");
    }

    await prisma.seller.create({ data: { id: sellerId, userId: firstSellerId, name: "Vendedor teste", slug: `seller-${sellerId}` } });
    await prisma.lead.create({ data: { id: leadId, name: "Lead teste", phone: "5511988888888", normalizedPhone: "5511988888888", sellerId } });
    const legacy = await prisma.whatsAppInstance.create({ data: { name: legacyName } });
    const oldChat = await prisma.conversation.create({ data: { instanceId: legacy.id, remoteJid: "5511999999999@s.whatsapp.net" } });
    await prisma.message.create({ data: { conversationId: oldChat.id, content: "Histórico anterior", fromMe: false } });
    await prisma.leadActivity.create({ data: { leadId, type: "WHATSAPP", content: "Mensagem recebida pelo WhatsApp: Histórico anterior" } });

    for (const id of [firstSellerId, secondSellerId]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/whatsapp/webhook",
        headers: { "x-evolution-webhook-secret": "test-webhook-secret" },
        payload: {
          event: "messages.upsert",
          instance: `catalogo-user-${id}`,
          data: {
            key: { remoteJid: "5511988888888@s.whatsapp.net", fromMe: false, id: `received-${id}` },
            message: { imageMessage: { caption: "Olá", mimetype: "image/png" } },
            messageTimestamp: Math.floor(Date.now() / 1000),
          },
        },
      });
      assert.equal(response.statusCode, 200);
    }

    const list = async (id: string) => {
      const response = await app.inject({ method: "GET", url: "/api/v1/whatsapp/chats", headers: headers(id) });
      assert.equal(response.statusCode, 200);
      return response.json<{ items: { id: string; instance: { ownerId: string | null } }[] }>().items;
    };
    const firstChats = await list(firstSellerId);
    const secondChats = await list(secondSellerId);
    assert.equal(firstChats.length, 1);
    assert.equal(secondChats.length, 1);
    assert.equal(firstChats[0]?.instance.ownerId, firstSellerId);
    assert.equal(secondChats[0]?.instance.ownerId, secondSellerId);
    assert.notEqual(firstChats[0]?.id, secondChats[0]?.id);
    assert.equal((await list(supportId)).length, 0);
    assert.equal((await list(managerId)).length, 2);
    assert.equal((await list(adminId)).length, 3);

    for (const [userId, count] of [[firstSellerId, 1], [managerId, 2], [adminId, 3]] as const) {
      const detail = await app.inject({ method: "GET", url: `/api/v1/leads/${leadId}`, headers: headers(userId) });
      assert.equal(detail.statusCode, 200);
      assert.equal(detail.json<{ lead: { activities: unknown[] } }>().lead.activities.length, count);
    }

    const chatId = firstChats[0]?.id;
    assert.ok(chatId);
    const message = await prisma.message.findFirstOrThrow({ where: { conversationId: chatId } });
    const requests = [
      { method: "PATCH" as const, suffix: "/read", payload: undefined },
      { method: "PATCH" as const, suffix: "/preferences", payload: { isPinned: true } },
      { method: "POST" as const, suffix: "/messages", payload: { text: "teste" } },
      { method: "POST" as const, suffix: "/media", payload: { fileName: "test.txt", mimeType: "text/plain", base64: "dGVzdA==" } },
      { method: "POST" as const, suffix: "/media", payload: { fileName: "audio.webm", mimeType: "audio/webm", base64: "dGVzdA==", voiceMessage: true } },
      { method: "POST" as const, suffix: `/messages/${message.id}/reaction`, payload: { reaction: "👍" } },
      { method: "PATCH" as const, suffix: `/messages/${message.id}`, payload: { text: "teste" } },
      { method: "DELETE" as const, suffix: `/messages/${message.id}`, payload: undefined },
      { method: "POST" as const, suffix: `/messages/${message.id}/forward`, payload: { targetChatId: chatId } },
    ];
    for (const observerId of [adminId, managerId, secondSellerId]) {
      const read = await app.inject({ method: "GET", url: `/api/v1/whatsapp/chats/${chatId}/messages`, headers: headers(observerId) });
      assert.equal(read.statusCode, observerId === secondSellerId ? 404 : 200);
      for (const request of requests) {
        const response = await app.inject({
          method: request.method, url: `/api/v1/whatsapp/chats/${chatId}${request.suffix}`,
          headers: headers(observerId), payload: request.payload,
        });
        assert.equal(response.statusCode, 404, `${observerId} ${request.method} ${request.suffix}`);
      }
    }
    assert.equal((await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).isRead, false);
    const media = await app.inject({ method: "GET", url: `/api/v1/whatsapp/chats/${chatId}/messages/${message.id}/media`, headers: headers(adminId) });
    assert.equal(media.statusCode, 200);
    const legacyRead = await app.inject({ method: "GET", url: `/api/v1/whatsapp/chats/${oldChat.id}/messages`, headers: headers(managerId) });
    assert.equal(legacyRead.statusCode, 404);
    const legacyWrite = await app.inject({ method: "POST", url: `/api/v1/whatsapp/chats/${oldChat.id}/messages`, headers: headers(adminId), payload: { text: "teste" } });
    assert.equal(legacyWrite.statusCode, 404);
    const newLeadChat = await app.inject({ method: "POST", url: `/api/v1/whatsapp/leads/${leadId}/chat`, headers: headers(adminId) });
    assert.equal(newLeadChat.statusCode, 200);
    assert.equal(newLeadChat.json().item.instance.ownerId, adminId);
    assert.notEqual(newLeadChat.json().item.id, chatId);
    const send = await app.inject({ method: "POST", url: `/api/v1/whatsapp/chats/${chatId}/messages`, headers: headers(firstSellerId), payload: { text: "Olá de volta" } });
    assert.equal(send.statusCode, 201);
    assert.deepEqual(sentPaths, [`/message/sendText/catalogo-user-${firstSellerId}`]);
    const audio = await app.inject({
      method: "POST", url: `/api/v1/whatsapp/chats/${chatId}/media`, headers: headers(firstSellerId),
      payload: { fileName: "audio.webm", mimeType: "audio/webm", base64: "dGVzdA==", voiceMessage: true },
    });
    assert.equal(audio.statusCode, 201);
    assert.equal(audio.json().message.mediaType, "audio");
    assert.equal(audio.json().message.mimeType, "audio/ogg");
    assert.equal(audio.json().message.content, "[Áudio]");
    assert.deepEqual(sentAudio, [{ number: "5511988888888", audio: "dGVzdA==" }]);
    assert.equal(sentPaths.at(-1), `/message/sendWhatsAppAudio/catalogo-user-${firstSellerId}`);
    for (const payload of [
      { fileName: "x.png", mimeType: "image/png", base64: "dGVzdA==", voiceMessage: true },
      { fileName: "audio.webm", mimeType: "audio/webm", base64: "dGVzdA==" },
      { fileName: "audio.webm", mimeType: "audio/webm", base64: "dGVzdA==", voiceMessage: true, quotedMessageId: message.id },
    ]) {
      const invalid: { statusCode: number } = await app.inject({ method: "POST", url: `/api/v1/whatsapp/chats/${chatId}/media`, headers: headers(firstSellerId), payload });
      assert.equal(invalid.statusCode, 400);
    }
    assert.equal(sentAudio.length, 1);
    const unknown = await app.inject({
      method: "POST", url: "/api/v1/whatsapp/webhook",
      headers: { "x-evolution-webhook-secret": "test-webhook-secret" },
      payload: { event: "messages.upsert", instance: `unknown-${randomUUID()}`, data: {} },
    });
    assert.equal(unknown.statusCode, 202);
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.whatsAppInstance.deleteMany({ where: { OR: [{ ownerId: { in: ids } }, { name: legacyName }] } });
    await prisma.lead.deleteMany({ where: { id: leadId } });
    await prisma.seller.deleteMany({ where: { id: sellerId } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  }
});
