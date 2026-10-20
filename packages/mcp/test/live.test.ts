import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FORMATS } from '../src/formats.js';
import { connect, type Harness } from './helpers.js';

// Calls the real Kroki service (KROKI_URL or https://kroki.io). Run with KROKI_LIVE=1.
describe.skipIf(!process.env.KROKI_LIVE)('live Kroki', () => {
  let harness: Harness;
  beforeAll(async () => {
    harness = await connect();
  });
  afterAll(async () => {
    await harness?.close();
  });

  it.each(FORMATS.map((f) => [f.id, f.example] as const))('renders the %s example', async (format, source) => {
    const result = await harness.client.callTool({ name: 'validate_diagram', arguments: { format, source } });
    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    expect(result.structuredContent).toEqual({ valid: true, errors: [] });
  });

  it('reports a Graphviz syntax error with its line', async () => {
    const result = await harness.client.callTool({
      name: 'validate_diagram',
      arguments: { format: 'dot', source: 'digraph G {\n a -> b\n b -> \n}' },
    });
    expect(result.structuredContent).toMatchObject({ valid: false, errors: [{ line: 4 }] });
  });

  it('renders PNG', async () => {
    const result = await harness.client.callTool({
      name: 'render_diagram',
      arguments: { format: 'graphviz', source: 'digraph { a -> b }', output: 'png' },
    });
    expect(result.isError).toBeFalsy();
    const [image] = result.content as { type: string; data: string }[];
    expect(
      Buffer.from(image?.data ?? '', 'base64')
        .subarray(1, 4)
        .toString(),
    ).toBe('PNG');
  });
});
