export interface AppConfig {
  inboundBearerToken: string;
  outboundHmacSecret: string;
  outboundWebhookUrl: string;
  hmacSignatureHeader: string;
  hmacSignaturePrefix: string;
  requestTimeoutMs: number;
  maxFileSizeBytes: number;
  maxFiles: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export function loadConfig(): AppConfig & { port: number } {
  const hmacSecret = required("HMAC_SECRET");

  return {
    port: positiveInteger("PORT", 9090),
    inboundBearerToken:
      process.env.INBOUND_BEARER_TOKEN ?? process.env.BEARER_TOKEN ?? hmacSecret,
    outboundHmacSecret: hmacSecret,
    outboundWebhookUrl:
      process.env.OUTBOUND_WEBHOOK_URL ??
      "http://localhost:8644/webhooks/pebble-msg",
    hmacSignatureHeader:
      process.env.HMAC_SIGNATURE_HEADER ?? "X-Hub-Signature-256",
    hmacSignaturePrefix: process.env.HMAC_SIGNATURE_PREFIX ?? "sha256=",
    requestTimeoutMs: positiveInteger("REQUEST_TIMEOUT_MS", 10_000),
    maxFileSizeBytes: positiveInteger("MAX_FILE_SIZE_BYTES", 10 * 1024 * 1024),
    maxFiles: positiveInteger("MAX_FILES", 10),
  };
}
