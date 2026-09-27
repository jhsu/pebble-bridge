# Security policy

## Supported versions

Security fixes are applied to the latest code on the `main` branch and the
latest published container image.

## Reporting a vulnerability

Please use GitHub's **Report a vulnerability** flow in the repository Security
tab. Do not include secrets, private transcripts, webhook payloads, or working
exploits in a public issue.

## Operational considerations

- Use different high-entropy values for `INBOUND_BEARER_TOKEN` and
  `HMAC_SECRET` in production.
- Put the public endpoint behind TLS; this service terminates plain HTTP only.
- Restrict network access to the outbound webhook where possible.
- Logs contain complete payloads, generated HMAC signatures, uploaded files as
  base64, and upstream response bodies. Treat logs as sensitive and configure
  retention and access controls accordingly.
- Rotate both secrets if payload logs or configuration files are exposed.
