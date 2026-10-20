import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server';
import { type CreateServerOptions, createServer } from '../src/server.js';

export interface Harness {
  client: Client;
  handler: McpHttpHandler;
  close(): Promise<void>;
}

/** Connects an SDK client to the server in-process, through the same handler the HTTP mode serves. */
export async function connect(options: CreateServerOptions = {}): Promise<Harness> {
  const handler = createMcpHandler(() => createServer(options));
  const transport = new StreamableHTTPClientTransport(new URL('http://archform.test/mcp'), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  const client = new Client({ name: 'archform-test', version: '0.0.0' }, { versionNegotiation: { mode: 'auto' } });
  await client.connect(transport);
  return {
    client,
    handler,
    async close() {
      await client.close();
      await handler.close();
    },
  };
}

export function text(result: { content?: unknown }): string {
  const blocks = (result.content ?? []) as { type: string; text?: string }[];
  return blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}
