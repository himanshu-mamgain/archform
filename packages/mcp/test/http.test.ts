import { afterEach, describe, expect, it } from 'vitest';
import { createHttpApp, type HttpApp } from '../src/http.js';
import type { Renderer } from '../src/renderers/renderer.js';

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

const listTools = (headers: Record<string, string> = {}) =>
  new Request('http://127.0.0.1:3000/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-06-18',
      Host: LOCAL_HOST,
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });

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

  it('rate limits per client', async () => {
    const a = app({ rateLimit: 2 });
    const ip = { 'X-Forwarded-For': '203.0.113.7' };
    expect((await a.fetch(listTools(ip))).status).toBe(200);
    expect((await a.fetch(listTools(ip))).status).toBe(200);
    const limited = await a.fetch(listTools(ip));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBeTruthy();
    expect((await a.fetch(listTools({ 'X-Forwarded-For': '203.0.113.8' }))).status).toBe(200);
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
