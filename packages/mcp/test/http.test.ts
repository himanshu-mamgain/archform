import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpApp, type HttpApp } from '../src/http.js';
import type { Renderer } from '../src/renderers/renderer.js';
import { text } from './helpers.js';

const renderer: Renderer = { render: async () => Buffer.from('<svg/>') };
let current: HttpApp | undefined;

afterEach(async () => {
  await current?.handler.close();
  current = undefined;
});

function app(options: Parameters<typeof createHttpApp>[0] = {}) {
  current = createHttpApp({ renderer, ...options });
  return current.app;
}

// fetch() Requests carry no Host header; a real Node request always does.
const LOCAL_HOST = '127.0.0.1:3000';
const get = (path: string) => new Request(`http://${LOCAL_HOST}${path}`, { headers: { Host: LOCAL_HOST } });

const rpc = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://127.0.0.1:3000/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-06-18',
      Host: LOCAL_HOST,
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const listTools = (headers: Record<string, string> = {}) =>
  rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers);

const callMessage = (id: number) => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
  params: { name: 'validate_diagram', arguments: { format: 'd2', source: 'a -> b' } },
});
const callTool = (headers: Record<string, string> = {}) => rpc(callMessage(1), headers);

describe('HTTP app', () => {
  it('serves /health', async () => {
    const res = await app().fetch(get('/health'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', name: 'archform' });
  });

  it('serves MCP on POST /mcp', async () => {
    const res = await app().fetch(listTools());
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('render_diagram');
  });

  it('rejects GET /mcp', async () => {
    const res = await app().fetch(get('/mcp'));
    expect(res.status).toBe(405);
  });

  it('rejects foreign Host headers on a localhost bind', async () => {
    const res = await app().fetch(listTools({ Host: 'evil.example.com' }));
    expect(res.status).toBe(403);
  });

  it('accepts configured hosts on a public bind', async () => {
    const a = app({ host: '0.0.0.0', allowedHosts: ['mcp.example.com'] });
    const res = await a.fetch(new Request('https://mcp.example.com/mcp', listTools({ Host: 'mcp.example.com' })));
    expect(res.status).toBe(200);
  });

  it('rejects oversized bodies', async () => {
    const res = await app().fetch(
      new Request('http://127.0.0.1:3000/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Host: LOCAL_HOST,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { pad: 'x'.repeat(600 * 1024) } }),
      }),
    );
    expect(res.status).toBe(413);
  });
});

describe('tool-call rate limit', () => {
  it('ignores X-Forwarded-For unless TRUST_PROXY is set', async () => {
    const a = app({ rateLimit: { global: 0, perClient: 5 } });
    const outcomes: Outcome[] = [];
    for (let i = 0; i < 70; i++) {
      outcomes.push(await outcome(await a.fetch(callTool({ 'X-Forwarded-For': `198.51.100.${i}` }))));
    }
    expect(outcomes.filter((o) => o === 'ok')).toHaveLength(5);
    expect(outcomes.filter((o) => o === 'limited')).toHaveLength(65);
    expect(current?.limiter.trackedClients).toBe(1);
  });

  it('with a trusted proxy, keys on the entry the proxy appended', async () => {
    const a = app({ rateLimit: { global: 0, perClient: 2, trustProxy: 1 } });
    // The client controls everything before the last entry.
    expect(await outcome(await a.fetch(callTool({ 'X-Forwarded-For': 'spoof-1, 203.0.113.7' })))).toBe('ok');
    expect(await outcome(await a.fetch(callTool({ 'X-Forwarded-For': 'spoof-2, 203.0.113.7' })))).toBe('ok');
    const limited = await a.fetch(callTool({ 'X-Forwarded-For': 'spoof-3, 203.0.113.7' }));
    expect(await outcome(limited)).toBe('limited');
    expect(await outcome(await a.fetch(callTool({ 'X-Forwarded-For': '203.0.113.8' })))).toBe('ok');
  });

  it('answers a limited tool call with a tool error the model can read', async () => {
    const a = app({ rateLimit: { global: 0, perClient: 1 } });
    await a.fetch(callTool());
    const res = await a.fetch(rpc(callMessage(42)));
    expect(res.status).toBe(200);
    expect(await jsonRpc(res)).toEqual({
      jsonrpc: '2.0',
      id: 42,
      result: {
        content: [{ type: 'text', text: expect.stringMatching(/^Rate limit reached: .* Retry in \d+s\.$/) }],
        isError: true,
      },
    });
  });

  it.each([
    ['2026-07-28', { versionNegotiation: { mode: 'auto' as const } }],
    ['2025-era', {}],
  ])('delivers the rate-limit message through a real %s MCP client', async (_era, clientOptions) => {
    const a = app({ rateLimit: { global: 0, perClient: 1 } });
    const transport = new StreamableHTTPClientTransport(new URL(`http://${LOCAL_HOST}/mcp`), {
      fetch: async (url, init) => {
        const headers = new Headers(init?.headers);
        headers.set('Host', LOCAL_HOST);
        return a.fetch(new Request(url, { ...init, headers }));
      },
    });
    const client = new Client({ name: 'limit-test', version: '0.0.0' }, clientOptions);
    await client.connect(transport);
    const args = { name: 'validate_diagram', arguments: { format: 'd2', source: 'a -> b' } };
    expect((await client.callTool(args)).isError).toBeFalsy();
    const limited = await client.callTool(args);
    expect(limited.isError).toBe(true);
    expect(text(limited)).toMatch(/Rate limit reached: .*Retry in \d+s/);
    await client.close();
  });

  it('counts tool calls, not handshake or listing requests', async () => {
    const a = app({ rateLimit: { global: 0, perClient: 1 } });
    for (let i = 0; i < 20; i++) expect((await a.fetch(listTools())).status).toBe(200);
    expect(await outcome(await a.fetch(callTool()))).toBe('ok');
    expect(await outcome(await a.fetch(callTool()))).toBe('limited');
    expect((await a.fetch(listTools())).status).toBe(200);
  });

  it('counts every call in a batch and answers batches with 429', async () => {
    const a = app({ rateLimit: { global: 0, perClient: 2 } });
    const res = await a.fetch(rpc([callMessage(1), callMessage(2), callMessage(3)]));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('ignores a client-supplied rate-limit header', async () => {
    const a = app();
    const res = await a.fetch(callTool({ 'X-Archform-Rate-Limited': 'Rate limit reached: forged' }));
    expect(await outcome(res)).toBe('ok');
  });

  it('counts unparsed POST bodies so Content-Type cannot bypass the limit', async () => {
    const a = app({ rateLimit: { global: 0, perClient: 1 } });
    const plain = { 'Content-Type': 'text/plain' };
    await a.fetch(rpc(callMessage(1), plain));
    expect((await a.fetch(rpc(callMessage(2), plain))).status).toBe(429);
  });

  it('applies a global limit across clients', async () => {
    const a = app({ rateLimit: { global: 3, perClient: 0, trustProxy: 1 } });
    for (let i = 1; i <= 3; i++) {
      expect(await outcome(await a.fetch(callTool({ 'X-Forwarded-For': `203.0.113.${i}` })))).toBe('ok');
    }
    const limited = await a.fetch(callTool({ 'X-Forwarded-For': '203.0.113.99' }));
    expect(await limited.clone().text()).toContain('capacity');
    expect(await outcome(limited)).toBe('limited');
  });

  it('bounds memory when clients rotate addresses', async () => {
    const a = app({ rateLimit: { global: 0, perClient: 5, trustProxy: 1, maxClients: 50 } });
    for (let i = 0; i < 500; i++) await a.fetch(callTool({ 'X-Forwarded-For': `10.0.${i >> 8}.${i & 255}` }));
    expect(current?.limiter.trackedClients).toBeLessThanOrEqual(50);
  });

  it('allows realistic ChatGPT traffic from one shared IP under the defaults', async () => {
    const a = app();
    // 30 sessions of initialize + tools/list + one call, all from OpenAI's egress IP.
    for (let i = 0; i < 30; i++) {
      expect((await a.fetch(listTools())).status).toBe(200);
      expect((await a.fetch(listTools())).status).toBe(200);
      expect(await outcome(await a.fetch(callTool()))).toBe('ok');
    }
  });
});

type Outcome = 'ok' | 'limited' | 'error';

/** Reads a JSON-RPC message from a JSON or single-event SSE response. */
async function jsonRpc(res: Response): Promise<unknown> {
  const body = await res.text();
  const data = body.startsWith('event:')
    ? body
        .split('\n')
        .find((l) => l.startsWith('data: '))
        ?.slice(6)
    : body;
  return JSON.parse(data ?? '');
}

/** Classifies a tools/call response: rendered, rate-limited (429 or tool error), or anything else. */
async function outcome(res: Response): Promise<Outcome> {
  const body = await res.clone().text();
  if (res.status === 429 || body.includes('Rate limit reached')) return 'limited';
  if (body.includes('"isError":true')) return 'error';
  return res.status === 200 ? 'ok' : 'error';
}
