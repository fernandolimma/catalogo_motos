import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "./app";
import { connectionQrFrom } from "./routes/whatsapp";

test("reads Evolution QR data from top-level and nested responses without exposing other fields", () => {
  const qrData = "data:image/png;base64,example";
  const pairingCode = "12345678";
  assert.deepEqual(connectionQrFrom({
    base64: qrData,
    pairingCode,
    code: "must-not-be-returned",
  }), { qrCode: qrData, pairingCode });
  assert.deepEqual(connectionQrFrom({
    qrcode: { base64: qrData, pairingCode },
    code: "must-not-be-returned",
  }), { qrCode: qrData, pairingCode });
});

test("publishes the public catalog and lead intake in OpenAPI", async () => {
  const app = await buildApp();
  try {
    const response = await app.inject({ method: "GET", url: "/docs/json" });
    assert.equal(response.statusCode, 200);
    const specification = response.json<{ paths: Record<string, unknown> }>();
    assert.ok(specification.paths["/api/v1/public/motorcycles"]);
    assert.ok(specification.paths["/api/v1/public/leads"]);
    assert.ok(specification.paths["/api/v1/motorcycle-options"]);
    assert.ok(specification.paths["/api/v1/motorcycle-options/{id}"]);
    assert.ok(specification.paths["/api/v1/lead-sources"]);
    assert.ok(specification.paths["/api/v1/leads/manual"]);
    assert.ok(specification.paths["/api/v1/leads/{id}/contact"]);
    assert.ok(specification.paths["/api/v1/leads/{id}"]);
    assert.ok(specification.paths["/api/v1/whatsapp/status"]);
    assert.ok(specification.paths["/api/v1/whatsapp/connect"]);
    assert.ok(specification.paths["/api/v1/whatsapp/webhook"]);
    assert.ok(specification.paths["/api/v1/whatsapp/chats"]);
    assert.ok(specification.paths["/api/v1/whatsapp/leads/{leadId}/chat"]);
    assert.ok(specification.paths["/api/v1/whatsapp/chats/{id}/media"]);
    assert.ok(specification.paths["/api/v1/whatsapp/chats/{id}/messages/{messageId}/media"]);
    assert.ok(specification.paths["/api/v1/whatsapp/chats/{id}/messages/{messageId}/reaction"]);
    assert.ok(specification.paths["/api/v1/whatsapp/chats/{id}/messages/{messageId}/forward"]);
    assert.ok(specification.paths["/api/v1/whatsapp/chats/{id}/messages/{messageId}"]);
    assert.ok(specification.paths["/api/v1/whatsapp/chats/{id}/read"]);
    assert.ok(specification.paths["/api/v1/whatsapp/chats/{id}/preferences"]);
    assert.ok(specification.paths["/api/v1/users"]);
    const leadOperation = specification.paths["/api/v1/public/leads"] as {
      post?: { requestBody?: { content?: Record<string, { schema?: { required?: string[] } }> } };
    };
    assert.ok(leadOperation.post?.requestBody?.content?.["application/json"]?.schema?.required?.includes("sellerSlug"));
    assert.ok(leadOperation.post?.requestBody?.content?.["application/json"]?.schema?.required?.includes("email"));
    assert.ok(specification.paths["/api/v1/crm/reports"]);
    assert.ok(specification.paths["/api/v1/motorcycles/{id}"]);
    assert.ok(specification.paths["/api/v1/sellers/{id}"]);
    assert.ok(specification.paths["/api/v1/sellers/{id}/photo"]);
    assert.ok(specification.paths["/api/v1/public/seller-photos/{filename}"]);
  } finally {
    await app.close();
  }
});

test("protects seller photo upload and removal endpoints", async () => {
  const app = await buildApp();
  try {
    const sellerId = "00000000-0000-4000-8000-000000000001";
    const responses = await Promise.all([
      app.inject({ method: "POST", url: `/api/v1/sellers/${sellerId}/photo`, payload: {} }),
      app.inject({ method: "DELETE", url: `/api/v1/sellers/${sellerId}/photo` }),
      app.inject({ method: "GET", url: "/api/v1/public/seller-photos/not-a-photo.png" }),
    ]);
    assert.deepEqual(responses.map((response) => response.statusCode), [403, 403, 400]);
  } finally {
    await app.close();
  }
});

test("requires administrator authentication to list user accounts", async () => {
  const app = await buildApp();
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/users" });
    assert.equal(response.statusCode, 401);
  } finally {
    await app.close();
  }
});

test("blocks unauthenticated motorcycle configuration management", async () => {
  const app = await buildApp();
  try {
    const responses = await Promise.all([
      app.inject({ method: "GET", url: "/api/v1/motorcycle-options" }),
      app.inject({ method: "PATCH", url: "/api/v1/motorcycle-options/00000000-0000-4000-8000-000000000001", payload: { value: "Teste" } }),
      app.inject({ method: "DELETE", url: "/api/v1/motorcycle-options/00000000-0000-4000-8000-000000000001" }),
    ]);
    assert.deepEqual(responses.map((response) => response.statusCode), [401, 403, 403]);
  } finally {
    await app.close();
  }
});

test("blocks unauthenticated manual lead creation and source lookup", async () => {
  const app = await buildApp();
  try {
    const [create, sources] = await Promise.all([
      app.inject({ method: "POST", url: "/api/v1/leads/manual", payload: {} }),
      app.inject({ method: "GET", url: "/api/v1/lead-sources" }),
    ]);
    assert.equal(create.statusCode, 403);
    assert.equal(sources.statusCode, 401);
  } finally {
    await app.close();
  }
});

test("protects contact editing and deletion endpoints", async () => {
  const app = await buildApp();
  try {
    const responses = await Promise.all([
      app.inject({ method: "GET", url: "/api/v1/leads" }),
      app.inject({
        method: "PATCH",
        url: "/api/v1/leads/00000000-0000-4000-8000-000000000001/contact",
        payload: { name: "Contato Teste", phone: "11987654321", email: "contato@example.com" },
      }),
      app.inject({ method: "DELETE", url: "/api/v1/leads/00000000-0000-4000-8000-000000000001" }),
    ]);
    assert.deepEqual(responses.map((response) => response.statusCode), [401, 403, 403]);
  } finally {
    await app.close();
  }
});

test("protects the WhatsApp connection endpoints and webhook", async () => {
  const app = await buildApp();
  try {
    const [status, connect, webhook] = await Promise.all([
      app.inject({ method: "GET", url: "/api/v1/whatsapp/status" }),
      app.inject({ method: "POST", url: "/api/v1/whatsapp/connect" }),
      app.inject({ method: "POST", url: "/api/v1/whatsapp/webhook", payload: {} }),
    ]);
    assert.equal(status.statusCode, 401);
    assert.equal(connect.statusCode, 403);
    assert.equal(webhook.statusCode, 401);
  } finally {
    await app.close();
  }
});

test("protects WhatsApp conversation opening and organization endpoints", async () => {
  const app = await buildApp();
  try {
    const responses = await Promise.all([
      app.inject({ method: "GET", url: "/api/v1/whatsapp/chats?q=cliente&filter=unread" }),
      app.inject({ method: "POST", url: "/api/v1/whatsapp/leads/00000000-0000-4000-8000-000000000001/chat" }),
      app.inject({ method: "PATCH", url: "/api/v1/whatsapp/chats/00000000-0000-4000-8000-000000000001/read" }),
      app.inject({
        method: "PATCH",
        url: "/api/v1/whatsapp/chats/00000000-0000-4000-8000-000000000001/preferences",
        payload: { isPinned: true },
      }),
    ]);
    assert.deepEqual(responses.map((response) => response.statusCode), [401, 403, 403, 403]);
  } finally {
    await app.close();
  }
});

test("protects WhatsApp media and message action endpoints", async () => {
  const app = await buildApp();
  try {
    const chatId = "00000000-0000-4000-8000-000000000001";
    const messageId = "00000000-0000-4000-8000-000000000002";
    const responses = await Promise.all([
      app.inject({ method: "POST", url: `/api/v1/whatsapp/chats/${chatId}/media`, payload: {} }),
      app.inject({ method: "GET", url: `/api/v1/whatsapp/chats/${chatId}/messages/${messageId}/media` }),
      app.inject({ method: "POST", url: `/api/v1/whatsapp/chats/${chatId}/messages/${messageId}/reaction`, payload: { reaction: "👍" } }),
      app.inject({ method: "POST", url: `/api/v1/whatsapp/chats/${chatId}/messages/${messageId}/forward`, payload: { targetChatId: chatId } }),
      app.inject({ method: "PATCH", url: `/api/v1/whatsapp/chats/${chatId}/messages/${messageId}`, payload: { text: "teste" } }),
      app.inject({ method: "DELETE", url: `/api/v1/whatsapp/chats/${chatId}/messages/${messageId}` }),
    ]);
    assert.deepEqual(responses.map((response) => response.statusCode), [403, 401, 403, 403, 403, 403]);
  } finally {
    await app.close();
  }
});

test("requires a selected seller when submitting a public lead", async () => {
  const app = await buildApp();
  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/public/leads",
      payload: { name: "Cliente Teste", phone: "11999999999", consent: true },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json<{ error: string }>().error, "validation_error");
  } finally {
    await app.close();
  }
});

test("requires an email when submitting a public lead", async () => {
  const app = await buildApp();
  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/public/leads",
      payload: { sellerSlug: "seller-test", name: "Cliente Teste", phone: "11999999999", consent: true },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json<{ error: string }>().error, "validation_error");
  } finally {
    await app.close();
  }
});
