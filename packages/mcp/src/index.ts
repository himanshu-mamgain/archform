#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { serve } from '@hono/node-server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createHttpApp, DEFAULT_RATE_LIMIT } from './http.js';
import { createServer } from './server.js';
import { VERSION } from './version.js';

// stdout carries the MCP protocol in stdio mode: every log goes to stderr.
const log = (message: string) => console.error(`[archform] ${message}`);

const HELP = `archform-mcp ${VERSION}

Usage:
  archform-mcp                 Serve MCP over stdio (default)
  archform-mcp --http          Serve MCP over Streamable HTTP (POST /mcp, GET /health)

Options:
  --http                       Use Streamable HTTP instead of stdio
  --port <n>                   HTTP port (default: $PORT or 3000)
  --host <addr>                HTTP bind address (default: $HOST or 127.0.0.1)
  -v, --version                Print the version
  -h, --help                   Print this help

Environment:
  KROKI_URL                    Kroki server (default: https://kroki.io)
  ALLOWED_HOSTS                Comma-separated Host header values accepted when binding publicly
  RATE_LIMIT                   Tool calls per minute across all clients (default: 120, 0 disables)
  RATE_LIMIT_PER_CLIENT        Tool calls per minute per client IP (default: 60, 0 disables)
  TRUST_PROXY                  Reverse proxies in front of the server whose X-Forwarded-For is trusted
                               (default: 0 = ignore the header; "true" = 1)
`;

function main(): void {
  let values: ReturnType<typeof parse>['values'];
  try {
    values = parse().values;
  } catch (error) {
    log(error instanceof Error ? error.message : String(error));
    console.error(HELP);
    process.exit(2);
  }

  if (values.help) {
    console.error(HELP);
    return;
  }
  if (values.version) {
    console.error(VERSION);
    return;
  }
  if (values.http) {
    startHttp(values.port, values.host);
    return;
  }

  const handle = serveStdio(() => createServer());
  const shutdown = () => void handle.close().finally(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  log(`v${VERSION} running on stdio (Kroki: ${process.env.KROKI_URL ?? 'https://kroki.io'})`);
}

function parse() {
  return parseArgs({
    options: {
      http: { type: 'boolean', default: false },
      port: { type: 'string' },
      host: { type: 'string' },
      version: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  });
}

function startHttp(portArg: string | undefined, hostArg: string | undefined): void {
  const port = Number(portArg ?? process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    log(`Invalid port "${portArg ?? process.env.PORT}".`);
    process.exit(2);
  }
  const host = hostArg ?? process.env.HOST ?? '127.0.0.1';
  const allowedHosts = (process.env.ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  const rateLimit = {
    global: envCount('RATE_LIMIT', DEFAULT_RATE_LIMIT.global),
    perClient: envCount('RATE_LIMIT_PER_CLIENT', DEFAULT_RATE_LIMIT.perClient),
    trustProxy: envCount('TRUST_PROXY', 0),
  };

  const { app, handler } = createHttpApp({ host, allowedHosts, rateLimit });
  const server = serve({ fetch: app.fetch, port, hostname: host }, () => {
    log(`v${VERSION} listening on http://${host.includes(':') ? `[${host}]` : host}:${port}/mcp`);
    if (!['127.0.0.1', 'localhost', '::1'].includes(host) && allowedHosts.length === 0) {
      log('Bound to a public interface without ALLOWED_HOSTS: Host header validation is off.');
    }
  });

  const shutdown = () => {
    void handler.close().finally(() => server.close(() => process.exit(0)));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/** Reads a non-negative integer env var; "true"/"false" map to 1/0. Exits on garbage. */
function envCount(name: string, fallback: number): number {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true') return 1;
  if (raw === 'false') return 0;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    log(`Invalid ${name}="${process.env[name]}": expected a non-negative integer.`);
    process.exit(2);
  }
  return value;
}

main();
