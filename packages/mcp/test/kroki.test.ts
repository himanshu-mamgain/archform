import { inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeKrokiSource, KrokiRenderer } from '../src/renderers/kroki.js';
import { parseKrokiError } from '../src/renderers/kroki-errors.js';
import { DiagramSyntaxError, RenderServiceError } from '../src/renderers/renderer.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('encodeKrokiSource', () => {
  it('matches the Kroki documentation example', () => {
    // https://kroki.io/#how encodes `cat hello.dot`, which ends with a newline.
    expect(encodeKrokiSource('digraph G {Hello->World}\n')).toBe('eNpLyUwvSizIUHBXqPZIzcnJ17ULzy_KSanlAgB1EAjQ');
  });

  it('round-trips unicode and is URL safe', () => {
    const source = 'graph TD\n  A["Café ☕"] --> B[/"naïve"/]\n'.repeat(20);
    const encoded = encodeKrokiSource(source);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(inflateSync(Buffer.from(encoded, 'base64url')).toString('utf8')).toBe(source);
  });
});

describe('KrokiRenderer', () => {
  it('builds share URLs from the base URL', () => {
    const renderer = new KrokiRenderer({ baseUrl: 'https://kroki.example.com/' });
    expect(renderer.shareUrl('graphviz', 'digraph G {Hello->World}\n')).toBe(
      'https://kroki.example.com/graphviz/svg/eNpLyUwvSizIUHBXqPZIzcnJ17ULzy_KSanlAgB1EAjQ',
    );
  });

  it('POSTs the source as text/plain', async () => {
    const fetchMock = vi.fn(async () => new Response('<svg/>', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await new KrokiRenderer({ baseUrl: 'http://kroki.test' }).render('d2', 'a -> b', 'svg');
    expect(out.toString()).toBe('<svg/>');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://kroki.test/d2/svg');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('a -> b');
    expect((init.headers as Record<string, string>)['Content-Type']).toMatch(/^text\/plain/);
    // An image Accept makes Kroki draw errors as images.
    expect((init.headers as Record<string, string>).Accept).toBe('*/*');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('turns HTTP 400 into a DiagramSyntaxError', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response("Error 400: Error: <stdin>: syntax error in line 4 near '}'\n", { status: 400 }),
    );
    const error = await new KrokiRenderer().render('graphviz', 'digraph {', 'svg').catch((e) => e);
    expect(error).toBeInstanceOf(DiagramSyntaxError);
    expect(error.errors).toEqual([{ line: 4, message: "Error: <stdin>: syntax error in line 4 near '}'" }]);
  });

  it('does not read a PNG error image as the message', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
          status: 400,
          headers: { 'Content-Type': 'image/png' },
        }),
    );
    const error = await new KrokiRenderer().render('graphviz', 'digraph {', 'png').catch((e) => e);
    expect(error).toBeInstanceOf(DiagramSyntaxError);
    expect(error.errors).toEqual([{ message: 'The diagram could not be rendered.' }]);
  });

  it('treats 5xx as a service error, not an invalid diagram', async () => {
    vi.stubGlobal('fetch', async () => new Response('Error 500: Internal Server Error', { status: 500 }));
    const error = await new KrokiRenderer().render('mermaid', 'graph TD', 'svg').catch((e) => e);
    expect(error).toBeInstanceOf(RenderServiceError);
    expect(error.message).toMatch(/HTTP 500/);
  });

  it('reports timeouts', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new DOMException('timed out', 'TimeoutError');
    });
    const error = await new KrokiRenderer({ timeoutMs: 15_000 }).render('d2', 'a', 'svg').catch((e) => e);
    expect(error).toBeInstanceOf(RenderServiceError);
    expect(error.message).toMatch(/15s/);
  });

  it('reports network failures', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND kroki.test') });
    });
    const error = await new KrokiRenderer({ baseUrl: 'http://kroki.test' }).render('d2', 'a', 'svg').catch((e) => e);
    expect(error).toBeInstanceOf(RenderServiceError);
    expect(error.message).toContain('ENOTFOUND');
  });
});

describe('parseKrokiError', () => {
  it.each([
    ['plantuml', 'Error 400: Syntax Error? (Assumed diagram type: sequence) (line: 4)', 5],
    ['c4plantuml', 'Error 400: Fatal parsing error (line: 2)', 3],
    ['graphviz', "Error 400: Error: <stdin>: syntax error in line 4 near '}'\n (exit code 1)", 4],
    ['d2', 'Error 400: err: failed to compile -: -:2:4: maps must be terminated with }\n (exit code 1)', 2],
    ['structurizr', 'Error 400: Unexpected tokens (expected: person) at line 3: u = persn "User".', 3],
    ['mermaid', 'Error 400: Error: Parse error on line 3:\n...A-->B  B-->[\n-----------------^', 3],
  ])('extracts the 1-based line for %s', (format, body, line) => {
    expect(parseKrokiError(format, body).line).toBe(line);
  });

  it('strips the status prefix, stack frames and duplicates', () => {
    const body = [
      'Error 400: SyntaxError: Unable to convert the diagram: bad JSON (line 1 column 2)',
      'JSON.parse (<anonymous>)',
      '    at evaluate (file:///usr/local/kroki/src/worker.js:36:25)',
      'JSON.parse (<anonymous>)',
    ].join('\n');
    expect(parseKrokiError('excalidraw', body)).toEqual({
      line: 1,
      message: 'SyntaxError: Unable to convert the diagram: bad JSON (line 1 column 2)\nJSON.parse (<anonymous>)',
    });
  });

  it('reads the text out of an SVG error image', () => {
    // Captured from kroki.io for an invalid D2 diagram requested with Accept: image/svg+xml.
    const body = [
      '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" width="673" height="44" viewBox="0 0 673 44" version="1.1">',
      '<rect fill="#fff5f7" width="673" height="44"/>',
      '<text id="text" xml:space="preserve" font-weight="bold" fill="#cd0930" font-size="16px" x="0" y="5" dy="0">',
      '<tspan x="10" dy="16">Error 400: err: failed to compile -: -:2:4: maps must be terminated with }</tspan>',
      '<tspan x="10" dy="16"> (exit code 1)</tspan>',
      '</text>',
      '<rect fill="#ff3860" width="3" height="44"/>',
      '</svg>',
    ].join('\n');
    expect(parseKrokiError('d2', body)).toEqual({
      line: 2,
      message: 'err: failed to compile -: -:2:4: maps must be terminated with }',
    });
  });

  it('decodes XML entities in SVG error text', () => {
    const body =
      '<svg><text><tspan>Error 400: Error: &lt;stdin&gt;: syntax error in line 4 near &apos;}&apos;</tspan></text></svg>';
    expect(parseKrokiError('graphviz', body).message).toBe("Error: <stdin>: syntax error in line 4 near '}'");
  });

  it('omits the line when there is none', () => {
    expect(parseKrokiError('bpmn', 'Error 400: Error: Syntax error in graph')).toEqual({
      message: 'Error: Syntax error in graph',
    });
  });

  it('falls back to a generic message for an empty body', () => {
    expect(parseKrokiError('d2', '').message).toBe('The diagram could not be rendered.');
  });
});
