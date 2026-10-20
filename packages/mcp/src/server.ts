import { McpServer } from '@modelcontextprotocol/server';
import { KrokiRenderer } from './renderers/kroki.js';
import type { Renderer } from './renderers/renderer.js';
import { registerListFormats } from './tools/list-formats.js';
import { registerRenderDiagram } from './tools/render-diagram.js';
import { registerValidateDiagram } from './tools/validate-diagram.js';
import { VERSION } from './version.js';

export interface CreateServerOptions {
  renderer?: Renderer;
}

export function createServer(options: CreateServerOptions = {}): McpServer {
  const renderer = options.renderer ?? new KrokiRenderer();
  const server = new McpServer(
    { name: 'archform', title: 'Archform', version: VERSION },
    {
      instructions:
        'Archform renders and validates diagrams as code. Call list_formats to see supported languages and examples, ' +
        'validate_diagram to check syntax, and render_diagram to produce an image and a shareable link.',
    },
  );
  registerListFormats(server);
  registerRenderDiagram(server, renderer);
  registerValidateDiagram(server, renderer);
  return server;
}
