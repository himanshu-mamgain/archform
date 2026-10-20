import { createMcpHonoApp } from '@modelcontextprotocol/hono';
import { createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server';
import type { Context, Hono } from 'hono';
import { createToolCallLimiter, RATE_LIMITED, type ToolCallLimiter, type ToolCallLimitOptions } from './rate-limit.js';
import { type CreateServerOptions, createServer } from './server.js';
import { VERSION } from './version.js';

// A 100 KB source can roughly double once JSON-escaped; leave room for the envelope.
export const MAX_REQUEST_BODY_BYTES = 512 * 1024;

// Carries the limiter's verdict from the route into the per-request server
// factory. Always stripped from the client's request before being set.
const RATE_LIMIT_HEADER = 'x-archform-rate-limited';

export interface HttpAppOptions extends CreateServerOptions {
  /** Interface the server binds to; drives the SDK's DNS rebinding protection. */
  host?: string;
  /** Hostnames accepted in the Host header when binding to a public interface. */
  allowedHosts?: string[];
  /** Tool-call limits on /mcp. Defaults: 120 per minute overall, 60 per client, X-Forwarded-For ignored. */
  rateLimit?: Partial<ToolCallLimitOptions>;
}

export const DEFAULT_RATE_LIMIT = { global: 120, perClient: 60 } as const;

export interface HttpApp {
  app: Hono;
  handler: McpHttpHandler;
  limiter: ToolCallLimiter;
}

export function createHttpApp(options: HttpAppOptions = {}): HttpApp {
  const handler = createMcpHandler(
    ({ requestInfo }) => {
      const limited = requestInfo?.headers.get(RATE_LIMIT_HEADER);
      return createServer(limited ? { ...options, unavailable: decodeURIComponent(limited) } : options);
    },
    { maxRequestBodySize: MAX_REQUEST_BODY_BYTES },
  );

  const app = createMcpHonoApp({
    host: options.host ?? '127.0.0.1',
    ...(options.allowedHosts?.length ? { allowedHosts: options.allowedHosts } : {}),
    maxRequestBodySize: MAX_REQUEST_BODY_BYTES,
  });

  app.get('/health', (c) => c.json({ status: 'ok', name: 'archform', version: VERSION }));

  const limiter = createToolCallLimiter({ ...DEFAULT_RATE_LIMIT, ...options.rateLimit });
  app.use('/mcp', limiter.middleware);

  app.post('/mcp', (c: Context) => {
    const parsedBody: unknown = c.get('parsedBody');
    const limited: string | undefined = c.get(RATE_LIMITED);
    if (!limited && !c.req.raw.headers.has(RATE_LIMIT_HEADER)) return handler.fetch(c.req.raw, { parsedBody });

    const headers = new Headers(c.req.raw.headers);
    headers.delete(RATE_LIMIT_HEADER);
    if (limited) headers.set(RATE_LIMIT_HEADER, encodeURIComponent(limited));
    const request = new Request(c.req.url, {
      method: 'POST',
      headers,
      body: parsedBody === undefined ? c.req.raw.body : JSON.stringify(parsedBody),
      ...(parsedBody === undefined ? { duplex: 'half' } : {}),
    } as RequestInit);
    return handler.fetch(request, { parsedBody });
  });
  // Stateless server: no SSE stream to resume and no session to delete.
  app.on(['GET', 'DELETE'], '/mcp', (c) => c.json({ error: 'Method not allowed. Use POST /mcp.' }, 405));

  return { app, handler, limiter };
}
