import { createHmac, timingSafeEqual } from "node:crypto";
import { ActivityType, Prisma, UserRole } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db";
import { allowRoles } from "../lib/auth";
import { normalizePhone, phoneNumberVariants } from "../lib/phone";

type JsonRecord = Record<string, unknown>;

class EvolutionError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "EvolutionError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function evolutionConfig() {
  const baseUrl = process.env.EVOLUTION_API_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY?.trim();
  const instance = process.env.EVOLUTION_INSTANCE?.trim() || "catalogo-motos";
  if (!baseUrl || !apiKey) {
    throw new EvolutionError("Configure EVOLUTION_API_URL e EVOLUTION_API_KEY no ambiente da API.", 503, "not_configured");
  }
  return { baseUrl, apiKey, instance };
}

async function evolutionRequest(path: string, init?: RequestInit) {
  const { baseUrl, apiKey } = evolutionConfig();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(12_000),
      headers: {
        apikey: apiKey,
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new EvolutionError("Não foi possível conectar à Evolution API. Verifique o serviço Docker.", 503, "unavailable");
  }
  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new EvolutionError(
      response.status === 404 ? "Instância do WhatsApp ainda não foi criada." : "A Evolution API recusou a solicitação.",
      response.status === 404 ? 404 : 502,
      response.status === 404 ? "instance_not_found" : "evolution_error",
    );
  }
  return data;
}

function evolutionPath(resource: string, instance: string) {
  return `/${resource}/${encodeURIComponent(instance)}`;
}

function stateFrom(response: unknown) {
  if (!isRecord(response)) return "close";
  const instance = isRecord(response.instance) ? response.instance : response;
  const state = instance.state ?? instance.connectionStatus ?? instance.status;
  return typeof state === "string" ? state.toLowerCase() : "close";
}

export function connectionQrFrom(response: unknown) {
  const data = isRecord(response) ? response : {};
  const qr = isRecord(data.qrcode) ? data.qrcode : {};
  return {
    qrCode: typeof qr.base64 === "string" ? qr.base64 : typeof data.base64 === "string" ? data.base64 : null,
    pairingCode: typeof qr.pairingCode === "string"
      ? qr.pairingCode
      : typeof data.pairingCode === "string"
        ? data.pairingCode
        : null,
  };
}

function messageText(message: unknown) {
  if (!isRecord(message)) return "[Mensagem sem texto]";
  const text = [
    message.conversation,
    isRecord(message.extendedTextMessage) ? message.extendedTextMessage.text : undefined,
    isRecord(message.imageMessage) ? message.imageMessage.caption : undefined,
    isRecord(message.videoMessage) ? message.videoMessage.caption : undefined,
    isRecord(message.documentMessage) ? message.documentMessage.caption : undefined,
    isRecord(message.buttonsResponseMessage) ? message.buttonsResponseMessage.selectedDisplayText : undefined,
    isRecord(message.listResponseMessage) ? message.listResponseMessage.title : undefined,
    isRecord(message.templateButtonReplyMessage) ? message.templateButtonReplyMessage.selectedDisplayText : undefined,
  ].find((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (text) return text.trim().slice(0, 4000);
  if (message.imageMessage) return "[Imagem]";
  if (message.videoMessage) return "[Vídeo]";
  if (message.audioMessage) return "[Áudio]";
  if (message.documentMessage) return "[Documento]";
  if (message.stickerMessage) return "[Figurinha]";
  return "[Mensagem sem texto]";
}

function messageMedia(message: JsonRecord) {
  const mediaTypes = [
    ["imageMessage", "image"],
    ["videoMessage", "video"],
    ["audioMessage", "audio"],
    ["documentMessage", "document"],
    ["stickerMessage", "image"],
  ] as const;
  for (const [field, mediaType] of mediaTypes) {
    const data = message[field];
    if (!isRecord(data)) continue;
    return {
      mediaType,
      mimeType: typeof data.mimetype === "string" ? data.mimetype.slice(0, 120) : null,
      fileName: typeof data.fileName === "string" ? data.fileName.slice(0, 255) : null,
    };
  }
  return { mediaType: null, mimeType: null, fileName: null };
}

function quotedMessageContent(message: JsonRecord) {
  for (const value of Object.values(message)) {
    if (!isRecord(value) || !isRecord(value.contextInfo) || !isRecord(value.contextInfo.quotedMessage)) continue;
    return messageText(value.contextInfo.quotedMessage);
  }
  return null;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function providerMessageParts(value: unknown) {
  if (!isRecord(value) || !isRecord(value.key) || !isRecord(value.message)) return null;
  return { key: value.key, message: value.message };
}

function normalizedRemotePhone(remoteJid: string) {
  if (!remoteJid.endsWith("@s.whatsapp.net")) return null;
  const digits = remoteJid.split("@")[0]?.split(":")[0] ?? "";
  return normalizePhone(digits);
}

function phoneRemoteJidFilters(numbers: string[]) {
  return numbers.flatMap((number) => [
    { remoteJid: `${number}@s.whatsapp.net` },
    { remoteJid: { startsWith: `${number}:`, endsWith: "@s.whatsapp.net" } },
  ]);
}

async function getOrCreateLeadConversation(
  instanceId: string,
  leadId: string,
  phone: string,
  fallbackRemoteJid: string,
) {
  const phoneVariants = phoneNumberVariants(phone);
  const matches = await prisma.conversation.findMany({
    where: {
      instanceId,
      OR: [
        { leadId },
        { leadId: null, OR: phoneRemoteJidFilters(phoneVariants) },
      ],
    },
    select: {
      id: true,
      leadId: true,
      remoteJid: true,
      createdAt: true,
      updatedAt: true,
      isPinned: true,
      isArchived: true,
      isMuted: true,
      isStarred: true,
    },
    orderBy: { createdAt: "asc" },
  });
  let canonical = matches.find((conversation) => conversation.leadId === leadId)
    ?? matches.find((conversation) => conversation.remoteJid === fallbackRemoteJid)
    ?? matches[0];
  if (!canonical) {
    canonical = await prisma.conversation.upsert({
      where: { instanceId_remoteJid: { instanceId, remoteJid: fallbackRemoteJid } },
      create: { instanceId, remoteJid: fallbackRemoteJid, leadId },
      update: {},
      select: {
        id: true,
        leadId: true,
        remoteJid: true,
        createdAt: true,
        updatedAt: true,
        isPinned: true,
        isArchived: true,
        isMuted: true,
        isStarred: true,
      },
    });
  }
  if (canonical.leadId && canonical.leadId !== leadId) {
    throw new EvolutionError("Este número já está associado a outro Lead.", 409, "recipient_conflict");
  }

  const duplicates = matches.filter((conversation) => conversation.id !== canonical.id);
  if (duplicates.length) {
    await prisma.$transaction(async (tx) => {
      const keeperMessages = await tx.message.findMany({
        where: { conversationId: canonical.id, externalId: { not: null } },
        select: { externalId: true },
      });
      const seenExternalIds = new Set(keeperMessages.flatMap((message) => message.externalId ? [message.externalId] : []));
      const duplicateMessages = await tx.message.findMany({
        where: { conversationId: { in: duplicates.map((conversation) => conversation.id) } },
        orderBy: { createdAt: "asc" },
        select: { id: true, externalId: true },
      });
      for (const message of duplicateMessages) {
        if (message.externalId && seenExternalIds.has(message.externalId)) {
          await tx.message.delete({ where: { id: message.id } });
        } else {
          await tx.message.update({ where: { id: message.id }, data: { conversationId: canonical.id } });
          if (message.externalId) seenExternalIds.add(message.externalId);
        }
      }
      await tx.conversation.update({
        where: { id: canonical.id },
        data: {
          leadId,
          isPinned: matches.some((conversation) => conversation.isPinned),
          isArchived: matches.some((conversation) => conversation.isArchived),
          isMuted: matches.some((conversation) => conversation.isMuted),
          isStarred: matches.some((conversation) => conversation.isStarred),
          updatedAt: new Date(Math.max(...matches.map((conversation) => conversation.updatedAt.getTime()))),
        },
      });
      await tx.conversation.deleteMany({ where: { id: { in: duplicates.map((conversation) => conversation.id) } } });
    });
  } else if (canonical.leadId !== leadId) {
    await prisma.conversation.update({ where: { id: canonical.id }, data: { leadId } });
  }
  return { id: canonical.id, leadId };
}

async function saveMessage(instanceName: string, rawMessage: unknown, userId?: string) {
  if (!isRecord(rawMessage) || !isRecord(rawMessage.key)) return;
  const key = rawMessage.key;
  const remoteJid = typeof key.remoteJid === "string" ? key.remoteJid : "";
  const externalId = typeof key.id === "string" ? key.id : null;
  if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") return;
  const fromMe = key.fromMe === true;
  const message = isRecord(rawMessage.message) ? rawMessage.message : {};
  const content = messageText(message);
  const media = messageMedia(message);
  const quotedContent = quotedMessageContent(message);
  const timestamp = Number(rawMessage.messageTimestamp);
  const createdAt = Number.isFinite(timestamp)
    ? new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp)
    : new Date();
  const phone = normalizedRemotePhone(remoteJid);
  const candidates = phone ? phoneNumberVariants(phone) : [];
  const lead = candidates.length
    ? await prisma.lead.findFirst({
      where: { normalizedPhone: { in: candidates } },
      select: { id: true },
    })
    : null;

  const instance = await prisma.whatsAppInstance.upsert({
    where: { name: instanceName },
    create: { name: instanceName, isActive: true, lastCheckedAt: new Date() },
    update: { isActive: true, lastCheckedAt: new Date() },
    select: { id: true },
  });
  const conversation = lead
    ? await getOrCreateLeadConversation(instance.id, lead.id, phone ?? remoteJid, remoteJid)
    : await prisma.conversation.upsert({
      where: { instanceId_remoteJid: { instanceId: instance.id, remoteJid } },
      create: { instanceId: instance.id, remoteJid },
      update: { updatedAt: new Date() },
      select: { id: true, leadId: true },
    });

  const existing = externalId
    ? await prisma.message.findUnique({
      where: { conversationId_externalId: { conversationId: conversation.id, externalId } },
      select: { id: true },
    })
    : null;
  if (existing) return;

  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        conversationId: conversation.id,
        externalId,
        content,
        fromMe,
        status: fromMe ? "sent" : "received",
        isRead: fromMe,
        ...media,
        quotedContent,
        providerPayload: jsonValue(rawMessage),
        createdAt,
      },
    });
    await tx.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    if (conversation.leadId) {
      await tx.leadActivity.create({
        data: {
          leadId: conversation.leadId,
          userId,
          type: ActivityType.WHATSAPP,
          content: `${fromMe ? "Mensagem enviada" : "Mensagem recebida"} pelo WhatsApp: ${content}`,
        },
      });
    }
  }).catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  });
}

function validWebhookSecret(request: { headers: Record<string, string | string[] | undefined> }) {
  const expected = process.env.EVOLUTION_WEBHOOK_SECRET;
  const supplied = request.headers["x-evolution-webhook-secret"];
  if (!expected || typeof supplied !== "string") return false;
  const expectedHash = createHmac("sha256", expected).update("catalogo-whatsapp-webhook").digest();
  const suppliedHash = createHmac("sha256", supplied).update("catalogo-whatsapp-webhook").digest();
  return timingSafeEqual(expectedHash, suppliedHash);
}

export async function whatsappRoutes(app: FastifyInstance) {
  app.get("/whatsapp/status", {
    preHandler: allowRoles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER, UserRole.SELLER),
    schema: { tags: ["whatsapp"], summary: "Consultar conexão do WhatsApp", security: [{ sessionCookie: [] }] },
  }, async (_request, reply) => {
    try {
      const { instance } = evolutionConfig();
      const response = await evolutionRequest(evolutionPath("instance/connectionState", instance));
      const state = stateFrom(response);
      await prisma.whatsAppInstance.upsert({
        where: { name: instance },
        create: { name: instance, isActive: state === "open", lastCheckedAt: new Date() },
        update: { isActive: state === "open", lastCheckedAt: new Date() },
      });
      return reply.send({ configured: true, state });
    } catch (error) {
      if (error instanceof EvolutionError && error.code === "instance_not_found") {
        return reply.send({ configured: true, state: "close" });
      }
      if (error instanceof EvolutionError && error.code === "not_configured") {
        return reply.code(503).send({ error: error.code, message: error.message });
      }
      throw error;
    }
  });

  app.post("/whatsapp/connect", {
    preHandler: allowRoles(UserRole.ADMIN),
    schema: { tags: ["whatsapp"], summary: "Conectar instância do WhatsApp", security: [{ sessionCookie: [] }] },
  }, async (_request, reply) => {
    const { instance } = evolutionConfig();
    let response: unknown;
    try {
      response = await evolutionRequest(evolutionPath("instance/connectionState", instance));
      if (stateFrom(response) === "open") return reply.send({ state: "open" });
      response = await evolutionRequest(evolutionPath("instance/connect", instance));
    } catch (error) {
      if (!(error instanceof EvolutionError) || error.code !== "instance_not_found") throw error;
      const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
      if (!webhookSecret) {
        return reply.code(503).send({ error: "webhook_not_configured", message: "Configure EVOLUTION_WEBHOOK_SECRET no ambiente da API." });
      }
      response = await evolutionRequest("/instance/create", {
        method: "POST",
        body: JSON.stringify({
          instanceName: instance,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
          syncFullHistory: true,
          webhook: {
            enabled: true,
            url: "http://api:3001/api/v1/whatsapp/webhook",
            headers: { "x-evolution-webhook-secret": webhookSecret },
            byEvents: false,
            base64: false,
            events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
          },
        }),
      });
    }
    const data = isRecord(response) ? response : {};
    const state = stateFrom(data);
    const qr = connectionQrFrom(data);
    await prisma.whatsAppInstance.upsert({
      where: { name: instance },
      create: { name: instance, isActive: state === "open", lastCheckedAt: new Date() },
      update: { isActive: state === "open", lastCheckedAt: new Date() },
    });
    return reply.send({
      state,
      ...qr,
    });
  });

  app.post("/whatsapp/webhook", {
    config: { rateLimit: false },
    schema: { tags: ["whatsapp"], summary: "Receber eventos da Evolution API" },
  }, async (request, reply) => {
    if (!validWebhookSecret(request)) {
      return reply.code(401).send({ error: "unauthorized", message: "Assinatura do webhook inválida." });
    }
    const payload = z.record(z.string(), z.unknown()).safeParse(request.body);
    if (!payload.success) {
      return reply.code(400).send({ error: "invalid_payload", message: "Evento inválido." });
    }
    const event = typeof payload.data.event === "string" ? payload.data.event.toUpperCase().replaceAll(".", "_") : "";
    const instance = typeof payload.data.instance === "string" ? payload.data.instance : "";
    const configuredInstance = process.env.EVOLUTION_INSTANCE?.trim() || "catalogo-motos";
    if (instance !== configuredInstance) return reply.code(202).send({ received: true });

    if (event === "CONNECTION_UPDATE") {
      const data = isRecord(payload.data.data) ? payload.data.data : {};
      const state = typeof data.state === "string" ? data.state.toLowerCase() : "";
      await prisma.whatsAppInstance.upsert({
        where: { name: instance },
        create: { name: instance, isActive: state === "open", lastCheckedAt: new Date() },
        update: { isActive: state === "open", lastCheckedAt: new Date() },
      });
    } else if (event === "MESSAGES_UPSERT") {
      const data = payload.data.data;
      const messages = Array.isArray(data)
        ? data
        : isRecord(data) && Array.isArray(data.messages)
          ? data.messages
          : [data];
      for (const message of messages) await saveMessage(instance, message, request.user?.sub);
    }
    return reply.code(200).send({ received: true });
  });

  app.get("/whatsapp/chats", {
    preHandler: allowRoles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER, UserRole.SELLER),
    schema: { tags: ["whatsapp"], summary: "Listar conversas do WhatsApp", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const query = z.object({
      q: z.string().trim().max(100).optional(),
      filter: z.enum(["all", "unread", "archived", "starred"]).default("all"),
    }).parse(request.query);
    const instanceName = process.env.EVOLUTION_INSTANCE?.trim() || "catalogo-motos";
    const instance = await prisma.whatsAppInstance.findUnique({ where: { name: instanceName }, select: { id: true } });
    if (!instance) return reply.send({ items: [] });
    const sellerId = request.user.role === UserRole.SELLER
      ? (await prisma.seller.findUnique({ where: { userId: request.user.sub }, select: { id: true } }))?.id ?? "00000000-0000-0000-0000-000000000000"
      : undefined;
    const items = await prisma.conversation.findMany({
      where: {
        instanceId: instance.id,
        ...(sellerId ? { lead: { sellerId } } : {}),
        ...(query.filter === "archived" ? { isArchived: true } : query.filter === "all" ? { isArchived: false } : {}),
        ...(query.filter === "starred" ? { isStarred: true, isArchived: false } : {}),
        ...(query.filter === "unread" ? { messages: { some: { isRead: false, fromMe: false } }, isArchived: false } : {}),
        ...(query.q ? {
          OR: [
            { remoteJid: { contains: query.q, mode: "insensitive" } },
            { lead: { is: { name: { contains: query.q, mode: "insensitive" } } } },
            { lead: { is: { phone: { contains: query.q } } } },
            { messages: { some: { content: { contains: query.q, mode: "insensitive" } } } },
          ],
        } : {}),
      },
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
      include: {
        lead: { select: { id: true, name: true, phone: true, sellerId: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            content: true,
            fromMe: true,
            status: true,
            createdAt: true,
            mediaType: true,
            mimeType: true,
            fileName: true,
            reaction: true,
            isDeleted: true,
          },
        },
        _count: { select: { messages: { where: { isRead: false, fromMe: false } } } },
      },
    });
    return reply.send({ items });
  });

  app.post("/whatsapp/leads/:leadId/chat", {
    preHandler: allowRoles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER, UserRole.SELLER),
    schema: { tags: ["whatsapp"], summary: "Abrir ou iniciar conversa do WhatsApp de um lead", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const { leadId } = z.object({ leadId: z.string().uuid() }).parse(request.params);
    const sellerId = request.user.role === UserRole.SELLER
      ? (await prisma.seller.findUnique({ where: { userId: request.user.sub }, select: { id: true } }))?.id ?? "00000000-0000-0000-0000-000000000000"
      : undefined;
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, ...(sellerId ? { sellerId } : {}) },
      select: { id: true, phone: true, normalizedPhone: true },
    });
    if (!lead) return reply.code(404).send({ error: "not_found", message: "Lead não encontrado ou fora do seu escopo." });
    const phone = normalizePhone(lead.normalizedPhone || lead.phone);
    if (!phone) {
      return reply.code(400).send({ error: "invalid_recipient", message: "O telefone deste Lead não pode ser usado no WhatsApp." });
    }
    const instanceName = process.env.EVOLUTION_INSTANCE?.trim() || "catalogo-motos";
    const instance = await prisma.whatsAppInstance.upsert({
      where: { name: instanceName },
      create: { name: instanceName },
      update: {},
      select: { id: true },
    });
    const number = phone.startsWith("55") ? phone : `55${phone}`;
    const leadConversation = await getOrCreateLeadConversation(
      instance.id,
      lead.id,
      phone,
      `${number}@s.whatsapp.net`,
    );

    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: leadConversation.id },
      include: {
        lead: { select: { id: true, name: true, phone: true, sellerId: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            content: true,
            fromMe: true,
            status: true,
            createdAt: true,
            mediaType: true,
            mimeType: true,
            fileName: true,
            reaction: true,
            isDeleted: true,
          },
        },
        _count: { select: { messages: { where: { isRead: false, fromMe: false } } } },
      },
    });
    return reply.send({ item: conversation });
  });

  app.get("/whatsapp/chats/:id/messages", {
    preHandler: allowRoles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER, UserRole.SELLER),
    schema: { tags: ["whatsapp"], summary: "Listar mensagens da conversa", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const sellerId = request.user.role === UserRole.SELLER
      ? (await prisma.seller.findUnique({ where: { userId: request.user.sub }, select: { id: true } }))?.id ?? "00000000-0000-0000-0000-000000000000"
      : undefined;
    const conversation = await prisma.conversation.findFirst({
      where: { id, ...(sellerId ? { lead: { sellerId } } : {}) },
      select: { id: true },
    });
    if (!conversation) return reply.code(404).send({ error: "not_found", message: "Conversa não encontrada." });
    const items = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "asc" },
      take: 500,
      select: {
        id: true,
        content: true,
        fromMe: true,
        status: true,
        isRead: true,
        mediaType: true,
        mimeType: true,
        fileName: true,
        quotedContent: true,
        reaction: true,
        isDeleted: true,
        createdAt: true,
      },
    });
    return reply.send({ items });
  });

  app.get("/whatsapp/chats/:id/messages/:messageId/media", {
    preHandler: allowRoles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER, UserRole.SELLER),
    schema: { tags: ["whatsapp"], summary: "Obter mídia de uma mensagem", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const { id, messageId } = z.object({ id: z.string().uuid(), messageId: z.string().uuid() }).parse(request.params);
    const sellerId = request.user.role === UserRole.SELLER
      ? (await prisma.seller.findUnique({ where: { userId: request.user.sub }, select: { id: true } }))?.id ?? "00000000-0000-0000-0000-000000000000"
      : undefined;
    const message = await prisma.message.findFirst({
      where: { id: messageId, conversationId: id, ...(sellerId ? { conversation: { lead: { sellerId } } } : {}) },
      select: { providerPayload: true, mediaType: true, mimeType: true, fileName: true },
    });
    if (!message?.mediaType || !message.providerPayload) {
      return reply.code(404).send({ error: "media_not_found", message: "Mídia não encontrada para esta mensagem." });
    }
    const { instance } = evolutionConfig();
    const response = await evolutionRequest(evolutionPath("chat/getBase64FromMediaMessage", instance), {
      method: "POST",
      body: JSON.stringify({ message: message.providerPayload, convertToMp4: false }),
    });
    if (!isRecord(response)) {
      return reply.code(502).send({ error: "invalid_media_response", message: "A Evolution API retornou uma mídia inválida." });
    }
    const rawBase64 = typeof response.base64 === "string" ? response.base64 : "";
    if (!rawBase64 || rawBase64.length > 12 * 1024 * 1024) {
      return reply.code(rawBase64 ? 413 : 502).send({ error: "media_unavailable", message: "A mídia está indisponível ou excede o limite de visualização." });
    }
    const mimeType = typeof response.mimetype === "string" ? response.mimetype : message.mimeType ?? "application/octet-stream";
    const dataUrl = rawBase64.startsWith("data:") ? rawBase64 : `data:${mimeType};base64,${rawBase64}`;
    return reply.send({
      dataUrl,
      mimeType,
      fileName: typeof response.fileName === "string" ? response.fileName : message.fileName,
    });
  });

  app.patch("/whatsapp/chats/:id/read", {
    preHandler: allowRoles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER, UserRole.SELLER),
    schema: { tags: ["whatsapp"], summary: "Marcar conversa como lida", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const sellerId = request.user.role === UserRole.SELLER
      ? (await prisma.seller.findUnique({ where: { userId: request.user.sub }, select: { id: true } }))?.id ?? "00000000-0000-0000-0000-000000000000"
      : undefined;
    const conversation = await prisma.conversation.findFirst({
      where: { id, ...(sellerId ? { lead: { sellerId } } : {}) },
      select: { id: true },
    });
    if (!conversation) return reply.code(404).send({ error: "not_found", message: "Conversa não encontrada." });
    await prisma.message.updateMany({ where: { conversationId: id, fromMe: false, isRead: false }, data: { isRead: true } });
    return reply.send({ updated: true });
  });

  app.patch("/whatsapp/chats/:id/preferences", {
    preHandler: allowRoles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER, UserRole.SELLER),
    schema: { tags: ["whatsapp"], summary: "Atualizar organização da conversa", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const preferences = z.object({
      isPinned: z.boolean().optional(),
      isArchived: z.boolean().optional(),
      isMuted: z.boolean().optional(),
      isStarred: z.boolean().optional(),
    }).refine((value) => Object.keys(value).length > 0, "Informe ao menos uma preferência.").parse(request.body);
    const sellerId = request.user.role === UserRole.SELLER
      ? (await prisma.seller.findUnique({ where: { userId: request.user.sub }, select: { id: true } }))?.id ?? "00000000-0000-0000-0000-000000000000"
      : undefined;
    const conversation = await prisma.conversation.findFirst({
      where: { id, ...(sellerId ? { lead: { sellerId } } : {}) },
      select: { id: true },
    });
    if (!conversation) return reply.code(404).send({ error: "not_found", message: "Conversa não encontrada." });
    const updated = await prisma.conversation.update({ where: { id }, data: preferences });
    return reply.send({ item: updated });
  });

  app.post("/whatsapp/chats/:id/messages", {
    preHandler: allowRoles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER, UserRole.SELLER),
    schema: { tags: ["whatsapp"], summary: "Enviar mensagem de texto pelo WhatsApp", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { text, quotedMessageId } = z.object({
      text: z.string().trim().min(1).max(4000),
      quotedMessageId: z.string().uuid().optional(),
    }).parse(request.body);
    const sellerId = request.user.role === UserRole.SELLER
      ? (await prisma.seller.findUnique({ where: { userId: request.user.sub }, select: { id: true } }))?.id ?? "00000000-0000-0000-0000-000000000000"
      : undefined;
    const conversation = await prisma.conversation.findFirst({
      where: { id, ...(sellerId ? { lead: { sellerId } } : {}) },
      select: { id: true, remoteJid: true, leadId: true },
    });
    if (!conversation) return reply.code(404).send({ error: "not_found", message: "Conversa não encontrada." });
    const number = conversation.remoteJid.split("@")[0]?.split(":")[0] ?? "";
    if (!/^\d{10,13}$/.test(number)) {
      return reply.code(400).send({ error: "invalid_recipient", message: "Esta conversa não possui um telefone compatível para envio." });
    }
    let quoted: { key: JsonRecord; message: JsonRecord } | undefined;
    let quotedContent: string | null = null;
    if (quotedMessageId) {
      const source = await prisma.message.findFirst({
        where: { id: quotedMessageId, conversationId: id },
        select: { providerPayload: true, content: true },
      });
      const parts = providerMessageParts(source?.providerPayload);
      if (!source || !parts) {
        return reply.code(400).send({ error: "quote_unavailable", message: "Esta mensagem não pode ser citada." });
      }
      quoted = parts;
      quotedContent = source.content;
    }
    const { instance } = evolutionConfig();
    const response = await evolutionRequest(evolutionPath("message/sendText", instance), {
      method: "POST",
      body: JSON.stringify({ number, text, ...(quoted ? { quoted } : {}) }),
    });
    const data = isRecord(response) ? response : {};
    const key = isRecord(data.key) ? data.key : {};
    const externalId = typeof key.id === "string" ? key.id : null;
    const message = await prisma.message.create({
      data: {
        conversationId: id,
        externalId,
        content: text,
        fromMe: true,
        status: "sent",
        quotedContent,
        providerPayload: isRecord(response) ? jsonValue(response) : undefined,
      },
      select: { id: true, externalId: true, content: true, fromMe: true, status: true, quotedContent: true, createdAt: true },
    }).catch(async (error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && externalId) {
        return prisma.message.findUniqueOrThrow({
          where: { conversationId_externalId: { conversationId: id, externalId } },
        });
      }
      throw error;
    });
    await prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
    return reply.code(201).send({ message });
  });

  app.post("/whatsapp/chats/:id/media", {
    bodyLimit: 12 * 1024 * 1024,
    preHandler: allowRoles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER, UserRole.SELLER),
    schema: { tags: ["whatsapp"], summary: "Enviar mídia em uma conversa", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z.object({
      fileName: z.string().trim().min(1).max(255),
      mimeType: z.enum([
        "image/jpeg", "image/png", "image/webp",
        "video/mp4",
        "audio/ogg", "audio/mpeg", "audio/mp4",
        "application/pdf", "text/plain",
        "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ]),
      base64: z.string().min(4).max(11_200_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
      caption: z.string().trim().max(1000).optional(),
      quotedMessageId: z.string().uuid().optional(),
    }).parse(request.body);
    const base64Bytes = Buffer.from(input.base64, "base64");
    if (base64Bytes.length > 8 * 1024 * 1024 || input.base64.length % 4 !== 0) {
      return reply.code(413).send({ error: "media_too_large", message: "O arquivo deve ter no máximo 8 MB." });
    }
    const sellerId = request.user.role === UserRole.SELLER
      ? (await prisma.seller.findUnique({ where: { userId: request.user.sub }, select: { id: true } }))?.id ?? "00000000-0000-0000-0000-000000000000"
      : undefined;
    const conversation = await prisma.conversation.findFirst({
      where: { id, ...(sellerId ? { lead: { sellerId } } : {}) },
      select: { id: true, remoteJid: true },
    });
    if (!conversation) return reply.code(404).send({ error: "not_found", message: "Conversa não encontrada." });
    const number = conversation.remoteJid.split("@")[0]?.split(":")[0] ?? "";
    if (!/^\d{10,13}$/.test(number)) {
      return reply.code(400).send({ error: "invalid_recipient", message: "Esta conversa não possui um telefone compatível para envio." });
    }
    let quoted: { key: JsonRecord; message: JsonRecord } | undefined;
    let quotedContent: string | null = null;
    if (input.quotedMessageId) {
      const source = await prisma.message.findFirst({
        where: { id: input.quotedMessageId, conversationId: id },
        select: { providerPayload: true, content: true },
      });
      const parts = providerMessageParts(source?.providerPayload);
      if (!source || !parts) {
        return reply.code(400).send({ error: "quote_unavailable", message: "Esta mensagem não pode ser citada." });
      }
      quoted = parts;
      quotedContent = source.content;
    }
    const mediaType = input.mimeType.startsWith("image/")
      ? "image"
      : input.mimeType.startsWith("video/")
        ? "video"
        : input.mimeType.startsWith("audio/")
          ? "audio"
          : "document";
    const safeFileName = input.fileName.replace(/[\\/:*?"<>|]/g, "_");
    const { instance } = evolutionConfig();
    const response = await evolutionRequest(evolutionPath("message/sendMedia", instance), {
      method: "POST",
      body: JSON.stringify({
        number,
        mediatype: mediaType,
        media: input.base64,
        mimetype: input.mimeType,
        fileName: safeFileName,
        ...(input.caption ? { caption: input.caption } : {}),
        ...(quoted ? { quoted } : {}),
      }),
    });
    const data = isRecord(response) ? response : {};
    const key = isRecord(data.key) ? data.key : {};
    const externalId = typeof key.id === "string" ? key.id : null;
    const message = await prisma.message.create({
      data: {
        conversationId: id,
        externalId,
        content: input.caption || `[${mediaType === "image" ? "Imagem" : mediaType === "video" ? "Vídeo" : mediaType === "audio" ? "Áudio" : "Documento"}]`,
        fromMe: true,
        status: "sent",
        mediaType,
        mimeType: input.mimeType,
        fileName: safeFileName,
        quotedContent,
        providerPayload: isRecord(response) ? jsonValue(response) : undefined,
      },
      select: { id: true, externalId: true, content: true, fromMe: true, status: true, mediaType: true, mimeType: true, fileName: true, quotedContent: true, createdAt: true },
    }).catch(async (error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && externalId) {
        return prisma.message.findUniqueOrThrow({
          where: { conversationId_externalId: { conversationId: id, externalId } },
          select: { id: true, externalId: true, content: true, fromMe: true, status: true, mediaType: true, mimeType: true, fileName: true, quotedContent: true, createdAt: true },
        });
      }
      throw error;
    });
    await prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
    return reply.code(201).send({ message });
  });

  app.post("/whatsapp/chats/:id/messages/:messageId/forward", {
    bodyLimit: 12 * 1024 * 1024,
    preHandler: allowRoles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER, UserRole.SELLER),
    schema: { tags: ["whatsapp"], summary: "Reencaminhar mensagem para outra conversa", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const { id, messageId } = z.object({ id: z.string().uuid(), messageId: z.string().uuid() }).parse(request.params);
    const { targetChatId } = z.object({ targetChatId: z.string().uuid() }).parse(request.body);
    const sellerId = request.user.role === UserRole.SELLER
      ? (await prisma.seller.findUnique({ where: { userId: request.user.sub }, select: { id: true } }))?.id ?? "00000000-0000-0000-0000-000000000000"
      : undefined;
    const [sourceConversation, targetConversation, sourceMessage] = await Promise.all([
      prisma.conversation.findFirst({
        where: { id, ...(sellerId ? { lead: { sellerId } } : {}) },
        select: { id: true },
      }),
      prisma.conversation.findFirst({
        where: { id: targetChatId, ...(sellerId ? { lead: { sellerId } } : {}) },
        select: { id: true, remoteJid: true },
      }),
      prisma.message.findFirst({
        where: { id: messageId, conversationId: id, isDeleted: false },
        select: { content: true, mediaType: true, mimeType: true, fileName: true, providerPayload: true },
      }),
    ]);
    const parts = providerMessageParts(sourceMessage?.providerPayload);
    if (!sourceConversation || !targetConversation || !sourceMessage || !parts) {
      return reply.code(404).send({ error: "not_found", message: "Mensagem ou conversa de destino não encontrada." });
    }
    const number = targetConversation.remoteJid.split("@")[0]?.split(":")[0] ?? "";
    if (!/^\d{10,13}$/.test(number)) {
      return reply.code(400).send({ error: "invalid_recipient", message: "A conversa de destino não possui um telefone compatível." });
    }
    const { instance } = evolutionConfig();
    let response: unknown;
    if (sourceMessage.mediaType) {
      const media = await evolutionRequest(evolutionPath("chat/getBase64FromMediaMessage", instance), {
        method: "POST",
        body: JSON.stringify({ message: sourceMessage.providerPayload, convertToMp4: false }),
      });
      if (!isRecord(media) || typeof media.base64 !== "string" || media.base64.length > 11_200_000) {
        return reply.code(413).send({ error: "media_unavailable", message: "Esta mídia não pode ser reencaminhada ou excede 8 MB." });
      }
      const base64 = media.base64.replace(/^data:[^,]+,/, "");
      const mimeType = typeof media.mimetype === "string" ? media.mimetype : sourceMessage.mimeType ?? "application/octet-stream";
      response = await evolutionRequest(evolutionPath("message/sendMedia", instance), {
        method: "POST",
        body: JSON.stringify({
          number,
          mediatype: sourceMessage.mediaType,
          media: base64,
          mimetype: mimeType,
          fileName: sourceMessage.fileName ?? "arquivo",
          ...(sourceMessage.content.startsWith("[") ? {} : { caption: sourceMessage.content }),
        }),
      });
    } else {
      response = await evolutionRequest(evolutionPath("message/sendText", instance), {
        method: "POST",
        body: JSON.stringify({ number, text: sourceMessage.content }),
      });
    }
    const sent = isRecord(response) ? response : {};
    const key = isRecord(sent.key) ? sent.key : {};
    const externalId = typeof key.id === "string" ? key.id : null;
    const created = await prisma.message.create({
      data: {
        conversationId: targetChatId,
        externalId,
        content: sourceMessage.content,
        fromMe: true,
        status: "sent",
        mediaType: sourceMessage.mediaType,
        mimeType: sourceMessage.mimeType,
        fileName: sourceMessage.fileName,
        providerPayload: isRecord(response) ? jsonValue(response) : undefined,
      },
      select: { id: true, content: true, mediaType: true, mimeType: true, fileName: true, createdAt: true },
    });
    await prisma.conversation.update({ where: { id: targetChatId }, data: { updatedAt: new Date() } });
    return reply.code(201).send({ message: created });
  });

  app.post("/whatsapp/chats/:id/messages/:messageId/reaction", {
    preHandler: allowRoles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER, UserRole.SELLER),
    schema: { tags: ["whatsapp"], summary: "Reagir a uma mensagem", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const { id, messageId } = z.object({ id: z.string().uuid(), messageId: z.string().uuid() }).parse(request.params);
    const { reaction } = z.object({ reaction: z.string().max(8).regex(/^(?:|[\p{Extended_Pictographic}\uFE0F\u200D]+)$/u) }).parse(request.body);
    const sellerId = request.user.role === UserRole.SELLER
      ? (await prisma.seller.findUnique({ where: { userId: request.user.sub }, select: { id: true } }))?.id ?? "00000000-0000-0000-0000-000000000000"
      : undefined;
    const conversation = await prisma.conversation.findFirst({
      where: { id, ...(sellerId ? { lead: { sellerId } } : {}) },
      select: { id: true, remoteJid: true },
    });
    const message = conversation ? await prisma.message.findFirst({
      where: { id: messageId, conversationId: id },
      select: { id: true, externalId: true, fromMe: true, providerPayload: true },
    }) : null;
    const parts = providerMessageParts(message?.providerPayload);
    if (!conversation || !message || !parts || !message.externalId) {
      return reply.code(404).send({ error: "not_found", message: "Mensagem não encontrada ou não pode receber reação." });
    }
    const { instance } = evolutionConfig();
    await evolutionRequest(evolutionPath("message/sendReaction", instance), {
      method: "POST",
      body: JSON.stringify({ key: parts.key, reaction }),
    });
    await prisma.message.update({ where: { id: messageId }, data: { reaction: reaction || null } });
    return reply.send({ updated: true });
  });

  app.patch("/whatsapp/chats/:id/messages/:messageId", {
    preHandler: allowRoles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER, UserRole.SELLER),
    schema: { tags: ["whatsapp"], summary: "Editar mensagem de texto enviada", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const { id, messageId } = z.object({ id: z.string().uuid(), messageId: z.string().uuid() }).parse(request.params);
    const { text } = z.object({ text: z.string().trim().min(1).max(4000) }).parse(request.body);
    const sellerId = request.user.role === UserRole.SELLER
      ? (await prisma.seller.findUnique({ where: { userId: request.user.sub }, select: { id: true } }))?.id ?? "00000000-0000-0000-0000-000000000000"
      : undefined;
    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId: id,
        fromMe: true,
        mediaType: null,
        isDeleted: false,
        ...(sellerId ? { conversation: { lead: { sellerId } } } : {}),
      },
      select: { id: true, externalId: true, providerPayload: true },
    });
    const parts = providerMessageParts(message?.providerPayload);
    if (!message || !parts || !message.externalId) {
      return reply.code(404).send({ error: "not_found", message: "Mensagem não encontrada ou não pode ser editada." });
    }
    const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id }, select: { remoteJid: true } });
    const number = conversation.remoteJid.split("@")[0]?.split(":")[0] ?? "";
    const { instance } = evolutionConfig();
    await evolutionRequest(evolutionPath("chat/updateMessage", instance), {
      method: "POST",
      body: JSON.stringify({ number, key: parts.key, text }),
    });
    const updated = await prisma.message.update({
      where: { id: messageId },
      data: {
        content: text,
        status: "edited",
      },
      select: { id: true, content: true, status: true, createdAt: true },
    });
    return reply.send({ message: updated });
  });

  app.delete("/whatsapp/chats/:id/messages/:messageId", {
    preHandler: allowRoles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER, UserRole.SELLER),
    schema: { tags: ["whatsapp"], summary: "Apagar mensagem enviada para todos", security: [{ sessionCookie: [] }] },
  }, async (request, reply) => {
    const { id, messageId } = z.object({ id: z.string().uuid(), messageId: z.string().uuid() }).parse(request.params);
    const sellerId = request.user.role === UserRole.SELLER
      ? (await prisma.seller.findUnique({ where: { userId: request.user.sub }, select: { id: true } }))?.id ?? "00000000-0000-0000-0000-000000000000"
      : undefined;
    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId: id,
        fromMe: true,
        isDeleted: false,
        ...(sellerId ? { conversation: { lead: { sellerId } } } : {}),
      },
      select: { id: true, externalId: true, providerPayload: true },
    });
    const parts = providerMessageParts(message?.providerPayload);
    if (!message || !parts || !message.externalId) {
      return reply.code(404).send({ error: "not_found", message: "Mensagem não encontrada ou não pode ser apagada." });
    }
    const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id }, select: { remoteJid: true } });
    const { instance } = evolutionConfig();
    await evolutionRequest(evolutionPath("chat/deleteMessageForEveryone", instance), {
      method: "DELETE",
      body: JSON.stringify({ id: message.externalId, fromMe: true, remoteJid: conversation.remoteJid }),
    });
    await prisma.message.update({
      where: { id: messageId },
      data: { content: "Esta mensagem foi apagada.", isDeleted: true, providerPayload: Prisma.DbNull },
    });
    return reply.send({ deleted: true });
  });
}
