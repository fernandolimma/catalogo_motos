export type WhatsAppProvider = "evolution" | "meta" | "none";
export type EmailProvider = "smtp" | "resend" | "sendgrid" | "none";
export type StorageProvider = "aws-s3" | "cloudflare-r2" | "supabase" | "none";

export type IntegrationConfig = {
  whatsapp: {
    provider: WhatsAppProvider;
    apiUrl?: string;
    apiKey?: string;
    instance?: string;
    webhookSecret?: string;
  };
  email: {
    provider: EmailProvider;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    from?: string;
  };
  storage: {
    provider: StorageProvider;
    bucket?: string;
    region?: string;
    endpoint?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
  enabled: {
    whatsapp: boolean;
    email: boolean;
    storage: boolean;
  };
};

export function buildIntegrationConfig(): IntegrationConfig {
  const whatsappProvider = (process.env.WHATSAPP_PROVIDER && process.env.WHATSAPP_PROVIDER !== "none"
    ? (process.env.WHATSAPP_PROVIDER as WhatsAppProvider)
    : process.env.EVOLUTION_API_URL
      ? "evolution"
      : "none") as WhatsAppProvider;
  const emailProvider = (process.env.EMAIL_PROVIDER && process.env.EMAIL_PROVIDER !== "none"
    ? (process.env.EMAIL_PROVIDER as EmailProvider)
    : process.env.SMTP_HOST
      ? "smtp"
      : "none") as EmailProvider;
  const storageProvider = (process.env.STORAGE_PROVIDER && process.env.STORAGE_PROVIDER !== "none"
    ? (process.env.STORAGE_PROVIDER as StorageProvider)
    : "none") as StorageProvider;

  return {
    whatsapp: {
      provider: whatsappProvider,
      apiUrl: process.env.EVOLUTION_API_URL || undefined,
      apiKey: process.env.EVOLUTION_API_KEY || undefined,
      instance: process.env.EVOLUTION_INSTANCE || undefined,
      webhookSecret: process.env.EVOLUTION_WEBHOOK_SECRET || undefined,
    },
    email: {
      provider: emailProvider,
      host: process.env.SMTP_HOST || undefined,
      port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
      user: process.env.SMTP_USER || undefined,
      password: process.env.SMTP_PASSWORD || undefined,
      from: process.env.SMTP_FROM || undefined,
    },
    storage: {
      provider: storageProvider,
      bucket: process.env.S3_BUCKET || undefined,
      region: process.env.S3_REGION || undefined,
      endpoint: process.env.S3_ENDPOINT || undefined,
      accessKeyId: process.env.S3_ACCESS_KEY_ID || undefined,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || undefined,
    },
    enabled: {
      whatsapp: whatsappProvider !== "none" && !!process.env.EVOLUTION_API_URL,
      email: emailProvider !== "none" && !!process.env.SMTP_HOST,
      storage: storageProvider !== "none" && !!process.env.S3_BUCKET,
    },
  };
}

export type LeadNotificationInput = {
  leadId: string;
  leadName: string;
  phone: string;
  message: string;
};

export interface WhatsAppClient {
  sendText(to: string, message: string): Promise<void>;
  sendLeadNotification(input: LeadNotificationInput): Promise<void>;
}

export interface MailClient {
  sendTemplate(to: string, subject: string, body: string): Promise<void>;
  sendLeadNotification(input: LeadNotificationInput): Promise<void>;
}

export interface StorageClient {
  uploadObject(key: string, content: Buffer | Uint8Array, mimeType: string): Promise<string>;
}

export class EvolutionWhatsAppClient implements WhatsAppClient {
  constructor(private readonly config: IntegrationConfig["whatsapp"]) {}

  async sendText(_to: string, _message: string): Promise<void> {
    if (!this.config.apiUrl || !this.config.apiKey || !this.config.instance) {
      return;
    }
  }

  async sendLeadNotification(_input: LeadNotificationInput): Promise<void> {
    await this.sendText(_input.phone, _input.message);
  }
}

export class SmtpMailClient implements MailClient {
  constructor(private readonly config: IntegrationConfig["email"]) {}

  async sendTemplate(_to: string, _subject: string, _body: string): Promise<void> {
    if (!this.config.host || !this.config.user || !this.config.password) {
      return;
    }
  }

  async sendLeadNotification(input: LeadNotificationInput): Promise<void> {
    await this.sendTemplate(input.phone, "Novo lead", input.message);
  }
}

export class NoopStorageClient implements StorageClient {
  async uploadObject(_key: string, _content: Buffer | Uint8Array, _mimeType: string): Promise<string> {
    throw new Error("Storage integration is not enabled yet.");
  }
}

export function createWhatsAppClient(config: IntegrationConfig): WhatsAppClient {
  if (config.whatsapp.provider === "evolution") {
    return new EvolutionWhatsAppClient(config.whatsapp);
  }
  return {
    async sendText() {},
    async sendLeadNotification() {},
  };
}

export function createMailClient(config: IntegrationConfig): MailClient {
  if (config.email.provider === "smtp") {
    return new SmtpMailClient(config.email);
  }
  return {
    async sendTemplate() {},
    async sendLeadNotification() {},
  };
}

export function createStorageClient(config: IntegrationConfig): StorageClient {
  if (config.storage.provider === "none") {
    return new NoopStorageClient();
  }
  return new NoopStorageClient();
}
