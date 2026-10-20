import { createHash } from 'node:crypto';
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { resolveFormat } from '../formats.js';
import { DiagramSyntaxError, type Renderer, RenderServiceError } from '../renderers/renderer.js';
import { formatSchema, READ_ONLY_ANNOTATIONS, sourceSchema, toolError } from './shared.js';

export function registerRenderDiagram(server: McpServer, renderer: Renderer): void {
  server.registerTool(
    'render_diagram',
    {
      title: 'Render diagram',
      description:
        'Render diagram source (Mermaid, PlantUML, C4-PlantUML, Graphviz/DOT, D2, Structurizr, BPMN, Excalidraw) to an SVG or PNG image, ' +
        'and get a shareable link that opens the diagram in a browser. Use it when the user wants to see a diagram. ' +
        'If the source is invalid the result is an error with the parser message and line number: fix the source and retry. ' +
        'Call validate_diagram to check syntax without rendering, or list_formats for examples and which formats support PNG.',
      inputSchema: z.object({
        format: formatSchema,
        source: sourceSchema,
        output: z
          .enum(['svg', 'png'])
          .default('svg')
          .describe('Image type. Defaults to svg. d2, bpmn and excalidraw support svg only.'),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ format: name, source, output }): Promise<CallToolResult> => {
      const format = resolveFormat(name);
      if (!format) return toolError(`Unknown format "${name}". Call list_formats to see the supported formats.`);
      if (!format.outputs.includes(output)) {
        return toolError(
          `${format.id} does not support ${output} output. Supported: ${format.outputs.join(', ')}. Retry with output "svg".`,
        );
      }

      let image: Buffer;
      try {
        image = await renderer.render(format.id, source, output);
      } catch (error) {
        if (error instanceof DiagramSyntaxError) {
          return toolError(
            `The ${format.id} diagram is invalid:\n${error.message}\n\nFix the source and call render_diagram again. ` +
              `list_formats has a valid ${format.id} example.`,
          );
        }
        if (error instanceof RenderServiceError) return toolError(error.message);
        throw error;
      }

      const url = renderer.shareUrl?.(format.id, source);
      const content: CallToolResult['content'] = [];
      if (output === 'png') {
        content.push({ type: 'image', data: image.toString('base64'), mimeType: 'image/png' });
      } else {
        const hash = createHash('sha256').update(source).digest('hex').slice(0, 16);
        content.push({
          type: 'resource',
          resource: {
            uri: `archform://diagram/${format.id}/${hash}.svg`,
            mimeType: 'image/svg+xml',
            text: image.toString('utf8'),
          },
        });
      }
      content.push({
        type: 'text',
        text: url
          ? `Rendered ${format.id} diagram as ${output}. Shareable link (opens the SVG in a browser): ${url}`
          : `Rendered ${format.id} diagram as ${output}.`,
      });
      return { content };
    },
  );
}
