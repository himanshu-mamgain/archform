import type { Context, MiddlewareHandler } from 'hono';

export interface ToolCallLimitOptions {
  /** Tool calls per window across all clients: size it to what the Kroki backend can take. 0 disables. */
  global: number;
  /** Tool calls per window per client IP. 0 disables. */
  perClient: number;
  windowMs?: number;
  /**
   * Number of reverse proxies in front of the server. With 0, X-Forwarded-For is
   * ignored (clients can set it to anything) and the socket address is used.
   * With N, the client is the entry the outermost trusted proxy appended:
   * the Nth from the end.
   */
  trustProxy?: number;
  /** Upper bound on tracked client buckets, so rotating addresses cannot grow memory. */
  maxClients?: number;
}

export interface ToolCallLimiter {
  middleware: MiddlewareHandler;
  /** Number of client buckets currently held in memory. */
  readonly trackedClients: number;
}

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window, in-memory limiter that counts `tools/call` requests (the calls
 * that reach Kroki), not HTTP requests: a session's initialize and tools/list
 * are free. Good for a single instance; use a shared store when running several.
 */
export function createToolCallLimiter(options: ToolCallLimitOptions): ToolCallLimiter {
  const windowMs = options.windowMs ?? 60_000;
  const trustProxy = options.trustProxy ?? 0;
  const maxClients = options.maxClients ?? 10_000;
  const global: Window = { count: 0, resetAt: 0 };
  const clients = new Map<string, Window>();

  const clientWindow = (key: string, now: number): Window => {
    let entry = clients.get(key);
    if (entry && entry.resetAt > now) return entry;
    if (entry) clients.delete(key);
    if (clients.size >= maxClients) {
      for (const [k, w] of clients) if (w.resetAt <= now) clients.delete(k);
      // Still full of live buckets: evict the oldest (Map keeps insertion order).
      while (clients.size >= maxClients) {
        const oldest = clients.keys().next().value;
        if (oldest === undefined) break;
        clients.delete(oldest);
      }
    }
    entry = { count: 0, resetAt: now + windowMs };
    clients.set(key, entry);
    return entry;
  };

  const middleware: MiddlewareHandler = async (c, next) => {
    const calls = countToolCalls(c);
    if (calls === 0) return next();

    const now = Date.now();
    if (global.resetAt <= now) {
      global.count = 0;
      global.resetAt = now + windowMs;
    }
    const client = options.perClient > 0 ? clientWindow(clientIp(c, trustProxy), now) : undefined;

    if (client && client.count + calls > options.perClient) {
      return tooManyRequests(c, client.resetAt - now, 'Too many tool calls from this client.');
    }
    if (options.global > 0 && global.count + calls > options.global) {
      return tooManyRequests(c, global.resetAt - now, 'The server is at capacity.');
    }
    if (client) client.count += calls;
    global.count += calls;
    return next();
  };

  return {
    middleware,
    get trackedClients() {
      return clients.size;
    },
  };
}

/**
 * Counts JSON-RPC `tools/call` messages in the body parsed by the MCP Hono app.
 * A POST whose body was not parsed as JSON counts as one call, so changing the
 * Content-Type cannot slip past the limit.
 */
function countToolCalls(c: Context): number {
  if (c.req.method !== 'POST') return 0;
  const body: unknown = c.get('parsedBody');
  if (body === undefined) return 1;
  const messages = Array.isArray(body) ? body : [body];
  return messages.filter(
    (m) => typeof m === 'object' && m !== null && (m as { method?: unknown }).method === 'tools/call',
  ).length;
}

export function clientIp(c: Context, trustProxy: number): string {
  if (trustProxy > 0) {
    const hops = (c.req.header('x-forwarded-for') ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
    const ip = hops[Math.max(0, hops.length - trustProxy)];
    if (ip) return ip;
  }
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return incoming?.socket?.remoteAddress ?? 'unknown';
}

function tooManyRequests(c: Context, retryMs: number, message: string): Response {
  const seconds = Math.max(1, Math.ceil(retryMs / 1000));
  c.header('Retry-After', String(seconds));
  return c.json({ error: `${message} Retry in ${seconds}s.` }, 429);
}
