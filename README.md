# Archform

Diagrams as code for AI assistants.

![How Archform works: the assistant sends diagram source to Archform, which renders it with Kroki and returns an image and share link](https://kroki.io/d2/svg/eNo9jUFLA0EMRu_zKz56leJ9DkLxUESUguhVwmzcCdudWb7MIiL97zK17SmQ5L03GDU1qyWCNuYWVldGvLsSv55l0YhF6bWcgljE7gnibt6ktDCnJWLHlL8qZ7w8HsLEOlnEcx83Pv0crQzK01mO7QO6aTNQvlFXQpiyNU1tpW6CWP84q6kd-xxMRsrcc_10aVy28Loy6X_5Rr597HGPw-v-CvWizTIq7uBZqDhamf4ABl9V_w)

This diagram was drawn by Archform. Connect it to your assistant and ask, for example, *"Draw a C4 context diagram of a URL shortener."*

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
