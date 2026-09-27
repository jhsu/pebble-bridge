# pebble-bridge

A small webhook proxy that:

1. receives authenticated `multipart/form-data` requests on port `9090`;
2. converts the multipart fields and files to JSON;
3. signs the exact JSON body with HMAC-SHA256; and
4. forwards it to `http://localhost:8644/webhooks/pebble-msg`.

## Setup

Requires Node.js 22 or newer.

```bash
npm install
cp .env.example .env
```

Set a strong value for `HMAC_SECRET`, then start the service. The `.env` file
is loaded automatically:

```bash
npm run build
npm start
```

For development, use `npm run dev`.

## API

### `POST /webhooks/pebble-msg`

The request must have:

- `Authorization: Bearer <INBOUND_BEARER_TOKEN>`
- `Content-Type: multipart/form-data; boundary=...`

Example:

```bash
curl http://localhost:9090/webhooks/pebble-msg \
  -H "Authorization: Bearer $INBOUND_BEARER_TOKEN" \
  -F 'message=hello' \
  -F 'tag=first' \
  -F 'tag=second' \
  -F 'attachment=@./image.png'
```

Text fields retain their names. Repeated field names become arrays. Each file
becomes an object at its form field name:

```json
{
  "message": "hello",
  "tag": ["first", "second"],
  "attachment": {
    "filename": "image.png",
    "contentType": "image/png",
    "size": 12345,
    "contentBase64": "..."
  }
}
```

When a non-empty `transcription` field is present, it is preserved verbatim and
the bridge adds `"event_type": "transcription"` unless the incoming form
already supplies `event_type` or `type`. This lets Hermes identify the event
instead of reporting it as `unknown`.

The outbound request uses `Content-Type: application/json` and, by default:

```text
X-Hub-Signature-256: sha256=<hex HMAC of the exact JSON request body>
```

The signature header and prefix can be changed with
`HMAC_SIGNATURE_HEADER` and `HMAC_SIGNATURE_PREFIX`.

### `GET /health`

Returns `{ "status": "ok" }` without authentication.

## Configuration

| Variable | Default |
| --- | --- |
| `PORT` | `9090` |
| `HMAC_SECRET` | required; signs the outbound JSON |
| `INBOUND_BEARER_TOKEN` | `HMAC_SECRET` |
| `BEARER_TOKEN` | alias for `INBOUND_BEARER_TOKEN` |
| `OUTBOUND_WEBHOOK_URL` | `http://localhost:8644/webhooks/pebble-msg` |
| `HMAC_SIGNATURE_HEADER` | `X-Hub-Signature-256` |
| `HMAC_SIGNATURE_PREFIX` | `sha256=` |
| `REQUEST_TIMEOUT_MS` | `10000` |
| `MAX_FILE_SIZE_BYTES` | `10485760` (10 MiB) |
| `MAX_FILES` | `10` |

Successful and error responses from the destination webhook are relayed with
their status code and body. Network errors and timeouts return `502`.

## Logging

The service writes one-line JSON logs to stdout for each received, forwarding,
and completed webhook. Received logs contain the parsed multipart payload, and
forwarding logs contain the exact JSON body, destination URL, and generated
signature header. Uploaded file contents therefore appear as base64 in logs.

The inbound `Authorization` header and the HMAC secret are never logged.

## Docker

When the destination webhook runs on the Docker host, override
`OUTBOUND_WEBHOOK_URL` with a host address reachable from the container.

```bash
docker build -t pebble-bridge .
docker run --rm -p 9090:9090 --env-file .env pebble-bridge
```
