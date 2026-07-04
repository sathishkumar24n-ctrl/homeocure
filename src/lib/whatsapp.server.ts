import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GRAPH_VERSION = "v21.0";
const META_INSPECTION_TIMEOUT_MS = 4000;
const META_SEND_TIMEOUT_MS = 12000;

type WhatsAppOperation = "follow_up_reminder" | "appointment_confirmation";

type WhatsAppConfig = {
  token?: string;
  phoneNumberId?: string;
  templateName?: string;
  businessAccountId?: string;
};

export function getWhatsAppConfig(): WhatsAppConfig {
  return {
    token: normalizeSecret(process.env.WHATSAPP_ACCESS_TOKEN),
    phoneNumberId: normalizeSecret(process.env.WHATSAPP_PHONE_NUMBER_ID),
    templateName: normalizeSecret(process.env.WHATSAPP_TEMPLATE_NAME),
    businessAccountId: normalizeSecret(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID),
  };
}

export function getWhatsAppConfigStatus() {
  const config = getWhatsAppConfig();
  return {
    tokenConfigured: Boolean(config.token),
    tokenSource: "runtime secret WHATSAPP_ACCESS_TOKEN",
    phoneNumberIdConfigured: Boolean(config.phoneNumberId),
    phoneNumberIdSource: "runtime secret WHATSAPP_PHONE_NUMBER_ID",
    templateConfigured: Boolean(config.templateName),
    templateSource: "runtime secret WHATSAPP_TEMPLATE_NAME",
    businessAccountIdConfigured: Boolean(config.businessAccountId),
    businessAccountIdSource: "runtime secret WHATSAPP_BUSINESS_ACCOUNT_ID",
  };
}

export async function sendWhatsAppTemplate(opts: {
  operation: WhatsAppOperation;
  clinicId?: string | null;
  to: string;
  parameters: string[];
}) {
  const config = getWhatsAppConfig();
  if (!config.token || !config.phoneNumberId || !config.templateName) {
    throw new Error("WhatsApp credentials are not configured");
  }

  const to = normalizePhone(opts.to);
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${config.phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: config.templateName,
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: opts.parameters.map((text) => ({ type: "text", text })),
        },
      ],
    },
  };

  const started = Date.now();
  console.info("[whatsapp] request", {
    operation: opts.operation,
    clinicId: opts.clinicId ?? null,
    phoneNumberId: config.phoneNumberId,
    templateName: config.templateName,
    to,
    url,
    payload,
  });

  let responseStatus: number | null = null;
  let responseBody: unknown = null;
  let providerMessageId: string | undefined;
  let fetchError: unknown;

  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }, META_SEND_TIMEOUT_MS);
    responseStatus = res.status;
    responseBody = await parseResponseBody(res);
    providerMessageId = getProviderMessageId(responseBody);
  } catch (err) {
    fetchError = err;
    responseBody = { error: String((err as Error)?.message ?? err) };
  }

  const metaError = getMetaError(responseBody);
  const success = responseStatus != null && responseStatus >= 200 && responseStatus < 300;
  const durationMs = Date.now() - started;

  console.info("[whatsapp] response", {
    operation: opts.operation,
    clinicId: opts.clinicId ?? null,
    status: responseStatus,
    success,
    durationMs,
    providerMessageId,
    responseBody,
  });

  await logWhatsAppExchange({
    clinicId: opts.clinicId ?? null,
    operation: opts.operation,
    recipient: to,
    phoneNumberId: config.phoneNumberId,
    templateName: config.templateName,
    requestUrl: url,
    requestBody: payload,
    responseStatus,
    responseBody,
    providerMessageId,
    durationMs,
    success,
    metaErrorCode: metaError.code,
    metaErrorType: metaError.type,
    metaErrorMessage: metaError.message,
  });

  if (fetchError) {
    throw new Error(`WhatsApp request failed: ${String((fetchError as Error)?.message ?? fetchError)}`);
  }

  if (!success) {
    const detail = metaError.message ?? JSON.stringify(responseBody);
    throw new Error(`WhatsApp ${responseStatus}: ${detail}`);
  }

  return { messageId: providerMessageId };
}

export async function inspectWhatsAppToken() {
  const token = getWhatsAppConfig().token;
  if (!token) {
    return { checked: false, valid: false, classification: "not_configured" as const };
  }

  try {
    const url = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`;
    const res = await fetchWithTimeout(url, undefined, META_INSPECTION_TIMEOUT_MS);
    const body = await parseResponseBody(res);
    const data = typeof body === "object" && body && "data" in body ? (body as any).data : null;
    const error = getMetaError(body);
    const expiresAt = Number(data?.expires_at ?? 0);
    const valid = Boolean(data?.is_valid) && res.ok;
    let classification: "permanent" | "temporary" | "expired" | "invalid" | "unknown" = "unknown";

    if (!valid) classification = "invalid";
    else if (!expiresAt) classification = "permanent";
    else if (expiresAt * 1000 < Date.now()) classification = "expired";
    else classification = "temporary";

    return {
      checked: true,
      valid,
      classification,
      expiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
      scopes: Array.isArray(data?.scopes) ? data.scopes : [],
      error: error.message ?? null,
      responseStatus: res.status,
    };
  } catch (err) {
    return {
      checked: true,
      valid: false,
      classification: "unknown" as const,
      error: String((err as Error)?.message ?? err),
    };
  }
}

export async function inspectWhatsAppPhoneNumber() {
  const config = getWhatsAppConfig();
  if (!config.token || !config.phoneNumberId) {
    return { checked: false, ok: false, error: "Token or Phone Number ID is missing" };
  }

  try {
    const fields = "id,display_phone_number,verified_name,quality_rating,whatsapp_business_account";
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${config.phoneNumberId}?fields=${encodeURIComponent(fields)}`;
    const res = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${config.token}` },
    }, META_INSPECTION_TIMEOUT_MS);
    const body = await parseResponseBody(res);
    const error = getMetaError(body);
    return {
      checked: true,
      ok: res.ok,
      responseStatus: res.status,
      displayPhoneNumber: (body as any)?.display_phone_number ?? null,
      verifiedName: (body as any)?.verified_name ?? null,
      qualityRating: (body as any)?.quality_rating ?? null,
      detectedBusinessAccountId: (body as any)?.whatsapp_business_account?.id ?? null,
      error: error.message ?? null,
    };
  } catch (err) {
    return {
      checked: true,
      ok: false,
      error: String((err as Error)?.message ?? err),
    };
  }
}

export function normalizePhone(p: string) {
  let s = p.trim().replace(/[\s\-()]/g, "");
  if (s.startsWith("+")) return s.slice(1);
  if (s.startsWith("00")) return s.slice(2);
  if (s.startsWith("0")) s = s.slice(1);
  const defaultCc = (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? "91").replace(
    /\D/g,
    "",
  );
  if (/^\d{10}$/.test(s)) return `${defaultCc}${s}`;
  return s;
}

function normalizeSecret(value: string | undefined) {
  if (!value) return undefined;
  let cleaned = value.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned.replace(/\s+/g, "");
}

async function parseResponseBody(res: Response) {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 4000) };
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function getProviderMessageId(body: unknown) {
  return typeof body === "object" && body
    ? ((body as any)?.messages?.[0]?.id as string | undefined)
    : undefined;
}

function getMetaError(body: unknown): {
  code: string | null;
  type: string | null;
  message: string | null;
} {
  const error = typeof body === "object" && body ? (body as any).error : null;
  return {
    code: error?.code != null ? String(error.code) : null,
    type: error?.type != null ? String(error.type) : null,
    message: error?.message != null ? String(error.message) : null,
  };
}

async function logWhatsAppExchange(entry: {
  clinicId: string | null;
  operation: WhatsAppOperation;
  recipient: string;
  phoneNumberId: string;
  templateName: string;
  requestUrl: string;
  requestBody: unknown;
  responseStatus: number | null;
  responseBody: unknown;
  providerMessageId?: string;
  durationMs: number;
  success: boolean;
  metaErrorCode: string | null;
  metaErrorType: string | null;
  metaErrorMessage: string | null;
}) {
  try {
    const { error } = await (supabaseAdmin as any).from("whatsapp_message_logs").insert({
      clinic_id: entry.clinicId,
      operation: entry.operation,
      recipient: entry.recipient,
      phone_number_id: entry.phoneNumberId,
      template_name: entry.templateName,
      request_url: entry.requestUrl,
      request_body: entry.requestBody,
      response_status: entry.responseStatus,
      response_body: entry.responseBody,
      provider_message_id: entry.providerMessageId ?? null,
      duration_ms: entry.durationMs,
      success: entry.success,
      meta_error_code: entry.metaErrorCode,
      meta_error_type: entry.metaErrorType,
      meta_error_message: entry.metaErrorMessage,
    });
    if (error) console.error("[whatsapp] failed to persist log", error);
  } catch (err) {
    console.error("[whatsapp] failed to persist log", err);
  }
}