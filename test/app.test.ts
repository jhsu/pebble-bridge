import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { type AddressInfo } from "node:net";
import { afterEach, test } from "node:test";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

const config: AppConfig = {
  inboundBearerToken: "inbound-test-token",
  outboundHmacSecret: "outbound-test-secret",
  outboundWebhookUrl: "http://unused.test",
  hmacSignatureHeader: "X-Hub-Signature-256",
  hmacSignaturePrefix: "sha256=",
  requestTimeoutMs: 1_000,
  maxFileSizeBytes: 1_024 * 1_024,
  maxFiles: 2,
};

async function listen(app: ReturnType<typeof createApp>): Promise<string> {
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

test("transforms multipart data and signs the exact outbound JSON", async () => {
  let outboundBody = "";
  let outboundSignature = "";
  const logs: string[] = [];
  const logger = {
    info: (message: string) => logs.push(message),
    error: (message: string) => logs.push(message),
  };
  const fetchImplementation: typeof fetch = async (_input, init) => {
    outboundBody = String(init?.body);
    outboundSignature = new Headers(init?.headers).get("X-Hub-Signature-256") ?? "";
    return new Response("accepted", { status: 202 });
  };
  const baseUrl = await listen(createApp(config, fetchImplementation, logger));
  const form = new FormData();
  form.append("message", "hello");
  form.append("transcription", "Ask Hermes what's today's weather.");
  form.append("tag", "one");
  form.append("tag", "two");
  form.append(
    "attachment",
    new Blob(["file contents"], { type: "text/plain" }),
    "message.txt",
  );

  const response = await fetch(`${baseUrl}/webhooks/pebble-msg`, {
    method: "POST",
    headers: { Authorization: "Bearer inbound-test-token" },
    body: form,
  });

  assert.equal(response.status, 202);
  assert.equal(await response.text(), "accepted");
  assert.deepEqual(JSON.parse(outboundBody), {
    message: "hello",
    transcription: "Ask Hermes what's today's weather.",
    tag: ["one", "two"],
    attachment: {
      filename: "message.txt",
      contentType: "text/plain",
      size: 13,
      contentBase64: Buffer.from("file contents").toString("base64"),
    },
    event_type: "transcription",
  });
  const expectedSignature = createHmac("sha256", config.outboundHmacSecret)
    .update(outboundBody)
    .digest("hex");
  assert.equal(outboundSignature, `sha256=${expectedSignature}`);

  const receivedLog = JSON.parse(logs[0] ?? "{}") as Record<string, unknown>;
  const forwardingLog = JSON.parse(logs[1] ?? "{}") as Record<string, unknown>;
  const forwardedLog = JSON.parse(logs[2] ?? "{}") as Record<string, unknown>;
  assert.equal(receivedLog.event, "webhook_received");
  assert.deepEqual(receivedLog.payload, JSON.parse(outboundBody));
  assert.equal(forwardingLog.event, "webhook_forwarding");
  assert.equal(forwardingLog.body, outboundBody);
  assert.equal(forwardedLog.event, "webhook_forwarded");
  assert.equal(forwardedLog.status, 202);
});

test("rejects requests without the configured bearer token", async () => {
  let forwarded = false;
  const fetchImplementation: typeof fetch = async () => {
    forwarded = true;
    return new Response(null, { status: 204 });
  };
  const baseUrl = await listen(createApp(config, fetchImplementation));
  const form = new FormData();
  form.append("message", "hello");

  const response = await fetch(`${baseUrl}/webhooks/pebble-msg`, {
    method: "POST",
    body: form,
  });

  assert.equal(response.status, 401);
  assert.equal(forwarded, false);
});

test("requires multipart content", async () => {
  const baseUrl = await listen(createApp(config));
  const response = await fetch(`${baseUrl}/webhooks/pebble-msg`, {
    method: "POST",
    headers: {
      Authorization: "Bearer inbound-test-token",
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  assert.equal(response.status, 415);
});
