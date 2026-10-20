import { createMcpHonoApp } from '@modelcontextprotocol/hono';
import { createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import { type CreateServerOptions, createServer } from './server.js';
import { VERSION } from './version.js';

// A 100 KB source can roughly double once JSON-escaped; leave room for the envelope.
export const MAX_REQUEST_BODY_BYTES = 512 * 1024;

export interface HttpAppOptions extends CreateServerOptions {
  /** Interface the server binds to; drives the SDK's DNS rebinding protection. */
  host?: string;
  /** Hostnames accepted in the Host header when binding to a public interface. */
  allowedHosts?: string[];
  /** Requests per client IP per window on /mcp. 0 disables the limit. */
  rateLimit?: number;
  rateLimitWindowMs?: number;
}

export interface HttpApp {
  app: Hono;
  handler: McpHttpHandler;
}

export function createHttpApp(options: HttpAppOptions = {}): HttpApp {
  const handler = createMcpHandler(() => createServer(options), { maxRequestBodySize: MAX_REQUEST_BODY_BYTES });

  const app = createMcpHonoApp({
    host: options.host ?? '127.0.0.1',
    ...(options.allowedHosts?.length ? { allowedHosts: options.allowedHosts } : {}),
    maxRequestBodySize: MAX_REQUEST_BODY_BYTES,
  });

  app.get('/health', (c) => c.json({ status: 'ok', name: 'archform', version: VERSION }));

  const limit = options.rateLimit ?? 60;
  if (limit > 0) app.use('/mcp', rateLimiter(limit, options.rateLimitWindowMs ?? 60_000));

  app.post('/mcp', (c: Context) => handler.fetch(c.req.raw, { parsedBody: c.get('parsedBody') }));
  // Stateless server: no SSE stream to resume and no session to delete.
  app.on(['GET', 'DELETE'], '/mcp', (c) => c.json({ error: 'Method not allowed. Use POST /mcp.' }, 405));

  return { app, handler };
}

/**
 * Fixed-window, in-memory rate limiter keyed by client IP. Good enough for a
 * single instance; put a shared limiter in front when running several.
 */
function rateLimiter(limit: number, windowMs: number): MiddlewareHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return async (c, next) => {
    const now = Date.now();
    if (hits.size > 10_000) {
      for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
    }
    const key = clientIp(c);
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    c.header('RateLimit-Limit', String(limit));
    c.header('RateLimit-Remaining', String(Math.max(0, limit - entry.count)));
    if (entry.count > limit) {
      c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return c.json({ error: 'Too many requests. Try again later.' }, 429);
    }
    await next();
  };
}

function clientIp(c: Context): string {
  // Behind a proxy (Fly, Render, Cloudflare) the first X-Forwarded-For hop is the client.
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return incoming?.socket?.remoteAddress ?? 'unknown';
}
