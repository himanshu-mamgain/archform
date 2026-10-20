import type { DiagramError } from './renderer.js';

// Formats whose parser reports 0-based line numbers (PlantUML counts from @startuml as line 0).
const ZERO_BASED_LINES = new Set(['plantuml', 'c4plantuml']);

// Patterns seen in Kroki 400 bodies, tried in order:
//   PlantUML:    "Syntax Error? (Assumed diagram type: sequence) (line: 4)"
//   Graphviz:    "Error: <stdin>: syntax error in line 4 near '}'"
//   D2:          "err: failed to compile -: -:2:4: maps must be terminated with }"
//   Structurizr: "Unexpected tokens (...) at line 3: u = persn \"User\"."
//   Mermaid:     "Parse error on line 3:"
//   JSON:        "... in JSON at position 1 (line 1 column 2)"
const LINE_PATTERNS = [/\(line:\s*(\d+)\)/i, /-:(\d+):\d+:/, /\bline\s+(\d+)/i];

/**
 * Turns a Kroki error body into a diagram error the model can act on:
 * strips the "Error 400:" prefix, stack frames and process noise, and
 * extracts a 1-based line number when the message carries one.
 */
export function parseKrokiError(format: string, body: string): DiagramError {
  const lines = svgErrorText(body)
    .replace(/^\s*Error \d{3}:\s*/, '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '' && !/^\s+at\s/.test(l) && !/^\(exit code \d+\)$/.test(l.trim()));

  // Kroki often repeats the first line verbatim after a JS stack trace; keep one copy.
  const unique = lines.filter((l, i) => lines.indexOf(l) === i);
  let message = unique.join('\n').trim() || 'The diagram could not be rendered.';
  if (message.length > 2000) message = `${message.slice(0, 2000)}…`;

  for (const pattern of LINE_PATTERNS) {
    const match = pattern.exec(message);
    if (match?.[1]) {
      const raw = Number.parseInt(match[1], 10);
      const line = ZERO_BASED_LINES.has(format) ? raw + 1 : raw;
      return { line: Math.max(line, 1), message };
    }
  }
  return { message };
}

/** Kroki draws the error as an SVG when the request accepts images: recover its text lines. */
function svgErrorText(body: string): string {
  if (!/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/.test(body)) return body;
  return [...body.matchAll(/<tspan[^>]*>([\s\S]*?)<\/tspan>/g)].map((m) => decodeXml(m[1] ?? '')).join('\n');
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
