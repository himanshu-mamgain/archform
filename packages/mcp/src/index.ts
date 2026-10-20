#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { serve } from '@hono/node-server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createHttpApp } from './http.js';
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
  RATE_LIMIT                   Requests per minute per client IP on /mcp (default: 60, 0 disables)
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
  const rateLimit = process.env.RATE_LIMIT === undefined ? undefined : Number(process.env.RATE_LIMIT);

  const { app, handler } = createHttpApp({ host, allowedHosts, ...(rateLimit === undefined ? {} : { rateLimit }) });
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

main();
