import { deflateSync } from 'node:zlib';
import type { OutputFormat } from '../formats.js';
import { parseKrokiError } from './kroki-errors.js';
import { DiagramSyntaxError, type Renderer, RenderServiceError } from './renderer.js';

export const DEFAULT_KROKI_URL = 'https://kroki.io';
const TIMEOUT_MS = 15_000;

export interface KrokiRendererOptions {
  /** Base URL of the Kroki server. Defaults to `KROKI_URL` or https://kroki.io. */
  baseUrl?: string;
  /** Request timeout in milliseconds. Defaults to 15 000. */
  timeoutMs?: number;
}

/** Deflate (zlib) then base64url, the encoding Kroki's GET API expects. */
export function encodeKrokiSource(source: string): string {
  return deflateSync(Buffer.from(source, 'utf8'), { level: 9 }).toString('base64url');
}

export class KrokiRenderer implements Renderer {
  readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: KrokiRendererOptions = {}) {
    const base = options.baseUrl ?? process.env.KROKI_URL ?? DEFAULT_KROKI_URL;
    this.baseUrl = base.replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  }

  async render(format: string, source: string, output: OutputFormat): Promise<Buffer> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/${format}/${output}`, {
        method: 'POST',
        // Not image/*: Kroki then draws 400 errors as an SVG or PNG image instead
        // of plain text. The URL path already picks the output format.
        headers: { 'Content-Type': 'text/plain; charset=utf-8', Accept: '*/*' },
        body: source,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new RenderServiceError(
          `Kroki at ${this.baseUrl} did not respond within ${this.timeoutMs / 1000}s. Try again, or simplify the diagram.`,
        );
      }
      const reason = error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : '';
      throw new RenderServiceError(`Could not reach Kroki at ${this.baseUrl}${reason ? `: ${reason}` : ''}.`);
    }

    if (res.ok) return Buffer.from(await res.arrayBuffer());

    // Some Kroki servers still answer with an error image; never read PNG bytes as text.
    const body = res.headers.get('content-type')?.startsWith('image/png') ? '' : await res.text().catch(() => '');
    if (res.status === 400) {
      throw new DiagramSyntaxError([parseKrokiError(format, body)]);
    }
    throw new RenderServiceError(
      `Kroki at ${this.baseUrl} returned HTTP ${res.status}${
        res.status >= 500 ? ' (a server-side failure, not necessarily a problem with the diagram)' : ''
      }. Try again later or use a self-hosted Kroki via KROKI_URL.`,
    );
  }

  shareUrl(format: string, source: string): string {
    return `${this.baseUrl}/${format}/svg/${encodeKrokiSource(source)}`;
  }
}
