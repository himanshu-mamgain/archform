import type { OutputFormat } from '../formats.js';

export interface DiagramError {
  line?: number;
  message: string;
}

export interface Renderer {
  /**
   * Renders `source` in the given canonical format.
   * Rejects with `DiagramSyntaxError` when the diagram is invalid and with
   * `RenderServiceError` when the renderer itself fails.
   */
  render(format: string, source: string, output: OutputFormat): Promise<Buffer>;
  /** A URL that renders the diagram as SVG when opened in a browser, if the renderer has one. */
  shareUrl?(format: string, source: string): string;
}

/** The diagram source is invalid. The message comes from the parser. */
export class DiagramSyntaxError extends Error {
  override readonly name = 'DiagramSyntaxError';
  constructor(readonly errors: DiagramError[]) {
    super(errors.map(formatDiagramError).join('\n'));
  }
}

/** The renderer could not be reached, timed out, or failed for reasons unrelated to the source. */
export class RenderServiceError extends Error {
  override readonly name = 'RenderServiceError';
}

export function formatDiagramError(error: DiagramError): string {
  return error.line === undefined ? error.message : `Line ${error.line}: ${error.message}`;
}
