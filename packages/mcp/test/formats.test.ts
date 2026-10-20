import { describe, expect, it } from 'vitest';
import { FORMAT_NAMES, FORMATS, resolveFormat } from '../src/formats.js';

describe('format registry', () => {
  it('has the v0.1 formats', () => {
    expect(FORMATS.map((f) => f.id)).toEqual([
      'mermaid',
      'plantuml',
      'c4plantuml',
      'graphviz',
      'd2',
      'structurizr',
      'bpmn',
      'excalidraw',
    ]);
  });

  it('gives every format svg output, docs and an example', () => {
    for (const format of FORMATS) {
      expect(format.outputs).toContain('svg');
      expect(format.docsUrl).toMatch(/^https:\/\//);
      expect(format.example.trim()).not.toBe('');
      expect(format.description).not.toBe('');
    }
  });

  it('marks svg-only formats', () => {
    for (const id of ['d2', 'bpmn', 'excalidraw']) {
      expect(resolveFormat(id)?.outputs).toEqual(['svg']);
    }
  });

  it('has no duplicate names across ids and aliases', () => {
    expect(new Set(FORMAT_NAMES).size).toBe(FORMAT_NAMES.length);
  });

  it('resolves ids, aliases and case', () => {
    expect(resolveFormat('mermaid')?.id).toBe('mermaid');
    expect(resolveFormat('dot')?.id).toBe('graphviz');
    expect(resolveFormat(' GraphViz ')?.id).toBe('graphviz');
    expect(resolveFormat('visio')).toBeUndefined();
  });

  it('lists aliases in FORMAT_NAMES', () => {
    expect(FORMAT_NAMES).toContain('dot');
  });
});
