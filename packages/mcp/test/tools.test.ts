import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { FORMATS } from '../src/formats.js';
import { KrokiRenderer } from '../src/renderers/kroki.js';
import { connect, type Harness, text } from './helpers.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><text>ok</text></svg>';

let harness: Harness;
let krokiFetch: Mock<(url: string, init: RequestInit) => Promise<Response>>;

beforeEach(async () => {
  krokiFetch = vi.fn(async (url: string) => (url.endsWith('/png') ? new Response(PNG) : new Response(SVG)));
  vi.stubGlobal('fetch', krokiFetch);
  harness = await connect({ renderer: new KrokiRenderer({ baseUrl: 'http://kroki.test' }) });
});

afterEach(async () => {
  await harness.close();
  vi.unstubAllGlobals();
});

describe('tools/list', () => {
  it('registers three read-only, open-world tools', async () => {
    const { tools } = await harness.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['list_formats', 'render_diagram', 'validate_diagram']);
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
      expect(tool.description).toBeTruthy();
    }
  });

  it('advertises the format enum including aliases', async () => {
    const { tools } = await harness.client.listTools();
    const render = tools.find((t) => t.name === 'render_diagram');
    const properties = render?.inputSchema.properties as Record<string, { enum?: string[] }> | undefined;
    const format = properties?.format;
    expect(format?.enum).toEqual(expect.arrayContaining(['mermaid', 'graphviz', 'dot', 'd2']));
  });
});

describe('list_formats', () => {
  it('returns the registry with examples', async () => {
    const result = await harness.client.callTool({ name: 'list_formats', arguments: {} });
    expect(result.isError).toBeFalsy();
    const { formats } = result.structuredContent as { formats: { id: string; example: string }[] };
    expect(formats.map((f) => f.id)).toEqual(FORMATS.map((f) => f.id));
    expect(formats.every((f) => f.example.length > 0)).toBe(true);
    expect(JSON.parse(text(result))).toEqual(result.structuredContent);
  });
});

describe('render_diagram', () => {
  it('returns SVG as an embedded resource plus a share URL', async () => {
    const result = await harness.client.callTool({
      name: 'render_diagram',
      arguments: { format: 'd2', source: 'a -> b' },
    });
    expect(result.isError).toBeFalsy();
    const [resource] = result.content as { type: string; resource: { mimeType: string; text: string; uri: string } }[];
    expect(resource?.type).toBe('resource');
    expect(resource?.resource.mimeType).toBe('image/svg+xml');
    expect(resource?.resource.text).toBe(SVG);
    expect(text(result)).toMatch(/http:\/\/kroki\.test\/d2\/svg\/[A-Za-z0-9_-]+/);
    expect(krokiFetch.mock.calls[0]?.[0]).toBe('http://kroki.test/d2/svg');
  });

  it('returns PNG as base64 image content', async () => {
    const result = await harness.client.callTool({
      name: 'render_diagram',
      arguments: { format: 'mermaid', source: 'graph TD\n A-->B', output: 'png' },
    });
    expect(result.isError).toBeFalsy();
    const [image] = result.content as { type: string; data: string; mimeType: string }[];
    expect(image).toEqual({ type: 'image', data: PNG.toString('base64'), mimeType: 'image/png' });
    expect(text(result)).toContain('http://kroki.test/mermaid/svg/');
  });

  it('resolves aliases to the canonical Kroki type', async () => {
    await harness.client.callTool({
      name: 'render_diagram',
      arguments: { format: 'dot', source: 'digraph { a -> b }' },
    });
    expect(krokiFetch.mock.calls[0]?.[0]).toBe('http://kroki.test/graphviz/svg');
  });

  it('refuses PNG for SVG-only formats without calling Kroki', async () => {
    const result = await harness.client.callTool({
      name: 'render_diagram',
      arguments: { format: 'excalidraw', source: '{}', output: 'png' },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('excalidraw does not support png');
    expect(krokiFetch).not.toHaveBeenCalled();
  });

  it('returns the parser error and line on invalid source', async () => {
    krokiFetch.mockResolvedValueOnce(
      new Response('Error 400: Syntax Error? (Assumed diagram type: sequence) (line: 2)', { status: 400 }),
    );
    const result = await harness.client.callTool({
      name: 'render_diagram',
      arguments: { format: 'plantuml', source: '@startuml\nA -> B\nnope\n@enduml' },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Line 3: Syntax Error?');
  });

  it('reports Kroki outages as tool errors', async () => {
    krokiFetch.mockResolvedValueOnce(new Response('Error 503', { status: 503 }));
    const result = await harness.client.callTool({ name: 'render_diagram', arguments: { format: 'd2', source: 'a' } });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('HTTP 503');
  });

  it('rejects unknown formats and oversized sources before rendering', async () => {
    const unknown = await harness.client.callTool({
      name: 'render_diagram',
      arguments: { format: 'visio', source: 'x' },
    });
    expect(unknown.isError).toBe(true);

    const big = await harness.client.callTool({
      name: 'render_diagram',
      arguments: { format: 'd2', source: 'a'.repeat(100 * 1024 + 1) },
    });
    expect(big.isError).toBe(true);
    expect(text(big)).toContain('100 KB');

    const empty = await harness.client.callTool({ name: 'render_diagram', arguments: { format: 'd2', source: '' } });
    expect(empty.isError).toBe(true);
    expect(krokiFetch).not.toHaveBeenCalled();
  });
});

describe('validate_diagram', () => {
  it('reports valid diagrams', async () => {
    const result = await harness.client.callTool({
      name: 'validate_diagram',
      arguments: { format: 'graphviz', source: 'digraph { a -> b }' },
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ valid: true, errors: [] });
  });

  it('reports invalid diagrams as a successful result', async () => {
    krokiFetch.mockResolvedValueOnce(
      new Response('Error 400: err: failed to compile -: -:2:4: maps must be terminated with }', { status: 400 }),
    );
    const result = await harness.client.callTool({
      name: 'validate_diagram',
      arguments: { format: 'd2', source: 'a -> b\nc: {' },
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      valid: false,
      errors: [{ line: 2, message: 'err: failed to compile -: -:2:4: maps must be terminated with }' }],
    });
  });

  it('is a tool error when Kroki cannot be reached', async () => {
    krokiFetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    const result = await harness.client.callTool({
      name: 'validate_diagram',
      arguments: { format: 'd2', source: 'a' },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Could not validate');
  });
});
