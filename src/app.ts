import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import multer from "multer";
import type { AppConfig } from "./config.js";

export interface FileValue {
  filename: string;
  contentType: string;
  size: number;
  contentBase64: string;
}

type PayloadValue = unknown | FileValue | Array<unknown | FileValue>;
type Payload = Record<string, PayloadValue>;

export interface Logger {
  info(message: string): void;
  error(message: string): void;
}

function writeLog(
  logger: Logger,
  level: "info" | "error",
  event: string,
  values: Record<string, unknown>,
): void {
  logger[level](
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...values,
    }),
  );
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function authorize(expectedToken: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const authorization = request.get("authorization");
    const match = authorization?.match(/^Bearer\s+(.+)$/i);

    if (!match?.[1] || !safeEqual(match[1], expectedToken)) {
      response
        .status(401)
        .set("WWW-Authenticate", "Bearer")
        .json({ error: "Unauthorized" });
      return;
    }

    next();
  };
}

function requireMultipart(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (!request.is("multipart/form-data")) {
    response.status(415).json({ error: "Expected multipart/form-data" });
    return;
  }
  next();
}

function addValue(payload: Payload, key: string, value: unknown | FileValue): void {
  const existing = payload[key];
  if (existing === undefined) {
    payload[key] = value;
  } else if (Array.isArray(existing)) {
    existing.push(value);
  } else {
    payload[key] = [existing, value];
  }
}

export function multipartToPayload(request: Request): Payload {
  const payload: Payload = { ...(request.body as Record<string, unknown>) };
  const files = Array.isArray(request.files) ? request.files : [];

  for (const file of files) {
    addValue(payload, file.fieldname, {
      filename: file.originalname,
      contentType: file.mimetype,
      size: file.size,
      contentBase64: file.buffer.toString("base64"),
    });
  }

  if (
    typeof payload.transcription === "string" &&
    payload.transcription.trim() !== "" &&
    payload.event_type === undefined &&
    payload.type === undefined
  ) {
    payload.event_type = "transcription";
  }

  return payload;
}

export function createApp(
  config: AppConfig,
  fetchImplementation: typeof fetch = fetch,
  logger: Logger = console,
) {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: config.maxFileSizeBytes,
      files: config.maxFiles,
      fields: 1_000,
    },
  });

  app.disable("x-powered-by");

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.post(
    "/webhooks/pebble-msg",
    authorize(config.inboundBearerToken),
    requireMultipart,
    upload.any(),
    async (request, response, next) => {
      const requestId = randomUUID();
      try {
        const payload = multipartToPayload(request);
        const json = JSON.stringify(payload);
        const signature = createHmac("sha256", config.outboundHmacSecret)
          .update(json)
          .digest("hex");
        const signatureValue = `${config.hmacSignaturePrefix}${signature}`;

        writeLog(logger, "info", "webhook_received", {
          requestId,
          method: request.method,
          path: request.path,
          sourceIp: request.ip,
          contentType: request.get("content-type"),
          contentLength: request.get("content-length"),
          payload,
        });

        writeLog(logger, "info", "webhook_forwarding", {
          requestId,
          method: "POST",
          url: config.outboundWebhookUrl,
          headers: {
            "content-type": "application/json",
            [config.hmacSignatureHeader]: signatureValue,
          },
          body: json,
        });

        const upstream = await fetchImplementation(config.outboundWebhookUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [config.hmacSignatureHeader]: signatureValue,
          },
          body: json,
          signal: AbortSignal.timeout(config.requestTimeoutMs),
        });

        const body = Buffer.from(await upstream.arrayBuffer());
        const contentType = upstream.headers.get("content-type");

        writeLog(logger, "info", "webhook_forwarded", {
          requestId,
          status: upstream.status,
          contentType,
          responseBody: body.toString("utf8"),
        });

        if (contentType) response.type(contentType);
        response.status(upstream.status).send(body);
      } catch (error) {
        writeLog(logger, "error", "webhook_forward_failed", {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
        next(error);
      }
    },
  );

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ): void => {
      if (error instanceof multer.MulterError) {
        response.status(413).json({ error: error.message, code: error.code });
        return;
      }

      writeLog(logger, "error", "request_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      response.status(502).json({ error: "Failed to forward webhook" });
    },
  );

  return app;
}
