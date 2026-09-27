# Contributing

Thanks for helping improve Pebble Bridge.

## Development

Requirements:

- Node.js 22 or newer
- npm

```bash
git clone https://github.com/jhsu/pebble-bridge.git
cd pebble-bridge
npm ci
cp .env.example .env
npm run dev
```

Use placeholder secrets in tests, examples, and issue reports. Never commit a
real `.env` file, bearer token, HMAC secret, transcript, or webhook payload.

## Before opening a pull request

Run the complete check locally:

```bash
npm run check
```

Pull requests should be focused, include tests for changed behavior, and update
the documentation when configuration or API behavior changes.

## Reporting issues

Use the GitHub issue templates for reproducible bugs and feature requests. For
security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening
a public issue.
