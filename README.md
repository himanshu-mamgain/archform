# Archform

Diagrams as code for AI assistants.

This is the monorepo for the `@archform` npm scope.

| Package | Description |
| --- | --- |
| [`@archform/mcp`](packages/mcp) | MCP server that renders and validates Mermaid, PlantUML, C4, Graphviz, D2, Structurizr, BPMN and Excalidraw diagrams |

## Quick start

```sh
claude mcp add archform -- npx -y @archform/mcp
```

See [packages/mcp](packages/mcp#readme) for Claude Desktop, Cursor, VS Code and ChatGPT setup.

> By default diagram source is sent to the public [kroki.io](https://kroki.io) service for rendering. Set `KROKI_URL` to a self-hosted Kroki to keep it private.

## Development

Requires Node.js 22+ and pnpm (`corepack enable`).

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Releasing

Bump `version` in both `packages/mcp/package.json` and `packages/mcp/server.json` in a pull request. When it merges to `main`, the [Publish workflow](.github/workflows/publish.yml) publishes the new version to npm (trusted publishing, with provenance) and to the MCP Registry. Pushes that don't change the version publish nothing.

## License

[MIT](LICENSE)
