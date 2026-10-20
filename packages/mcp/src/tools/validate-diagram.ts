import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { resolveFormat } from '../formats.js';
import { type DiagramError, DiagramSyntaxError, type Renderer, RenderServiceError } from '../renderers/renderer.js';
import { formatSchema, READ_ONLY_ANNOTATIONS, sourceSchema, toolError } from './shared.js';

const outputSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.object({ line: z.number().int().optional(), message: z.string() })),
});

export function registerValidateDiagram(server: McpServer, renderer: Renderer, unavailable?: string): void {
  server.registerTool(
    'validate_diagram',
    {
      title: 'Validate diagram',
      description:
        'Check whether diagram source (Mermaid, PlantUML, C4-PlantUML, Graphviz/DOT, D2, Structurizr, BPMN, Excalidraw) is valid, ' +
        'without returning an image. Returns { valid, errors: [{ line?, message }] }. ' +
        'Use it to check syntax you are unsure of before rendering or before handing diagram code to the user. ' +
        'Call list_formats for a valid example of each format.',
      inputSchema: z.object({ format: formatSchema, source: sourceSchema }),
      outputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ format: name, source }): Promise<CallToolResult> => {
      if (unavailable) return toolError(unavailable);
      const format = resolveFormat(name);
      if (!format) return toolError(`Unknown format "${name}". Call list_formats to see the supported formats.`);

      let errors: DiagramError[] = [];
      try {
        // Every format supports SVG, and rendering is the only check Kroki offers.
        await renderer.render(format.id, source, 'svg');
      } catch (error) {
        if (error instanceof DiagramSyntaxError) errors = error.errors;
        else if (error instanceof RenderServiceError) {
          return toolError(`Could not validate the diagram: ${error.message}`);
        } else throw error;
      }

      const result = { valid: errors.length === 0, errors };
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
