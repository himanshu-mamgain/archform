import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { FORMAT_NAMES } from '../formats.js';

export const MAX_SOURCE_BYTES = 100 * 1024;

/** Every tool only reads input and calls an external renderer. */
export const READ_ONLY_ANNOTATIONS: ToolAnnotations = { readOnlyHint: true, openWorldHint: true };

export const formatSchema = z
  .enum(FORMAT_NAMES)
  .describe(`Diagram language. One of: ${FORMAT_NAMES.join(', ')} ("dot" is an alias for graphviz).`);

export const sourceSchema = z
  .string()
  .min(1, 'source is empty')
  .refine((s) => Buffer.byteLength(s, 'utf8') <= MAX_SOURCE_BYTES, {
    message: `source must be at most ${MAX_SOURCE_BYTES / 1024} KB`,
  })
  .describe('The diagram source text, exactly as it would appear in a file of that format.');

export function toolError(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}
