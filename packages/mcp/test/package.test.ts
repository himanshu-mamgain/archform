import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import serverJson from '../server.json' with { type: 'json' };

describe('publishing metadata', () => {
  it('keeps server.json in sync with package.json', () => {
    expect(serverJson.name).toBe(pkg.mcpName);
    expect(serverJson.version).toBe(pkg.version);
    expect(serverJson.packages[0]?.identifier).toBe(pkg.name);
    expect(serverJson.packages[0]?.version).toBe(pkg.version);
  });

  it('publishes publicly with a bin entry', () => {
    expect(pkg.publishConfig.access).toBe('public');
    expect(pkg.bin['archform-mcp']).toBe('dist/index.js');
    expect(pkg.files).toEqual(['dist']);
  });
});
