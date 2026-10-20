import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { FORMATS } from '../formats.js';
import { READ_ONLY_ANNOTATIONS, toolError } from './shared.js';

const formatEntry = z.object({
  id: z.string(),
  aliases: z.array(z.string()),
  outputs: z.array(z.enum(['svg', 'png'])),
  description: z.string(),
  docsUrl: z.string(),
  example: z.string(),
});

export function registerListFormats(server: McpServer, unavailable?: string): void {
  server.registerTool(
    'list_formats',
    {
      title: 'List diagram formats',
      description:
        'List the diagram languages this server can render (Mermaid, PlantUML, C4-PlantUML, Graphviz, D2, Structurizr, BPMN, Excalidraw), ' +
        "with each one's aliases, supported outputs (svg, png), syntax docs link and a minimal valid example. " +
        'Call this before writing a diagram in a format you are unsure of, or to check whether PNG output is available.',
      outputSchema: z.object({ formats: z.array(formatEntry) }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async () => {
      if (unavailable) return toolError(unavailable);
      const formats = FORMATS.map((f) => ({ ...f, aliases: [...f.aliases], outputs: [...f.outputs] }));
      return {
        content: [{ type: 'text', text: JSON.stringify({ formats }, null, 2) }],
        structuredContent: { formats },
      };
    },
  );
}
