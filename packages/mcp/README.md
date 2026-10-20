# @archform/mcp

An [MCP](https://modelcontextprotocol.io) server that lets AI assistants render and validate **diagrams as code**: Mermaid, PlantUML, C4-PlantUML, Graphviz, D2, Structurizr, BPMN and Excalidraw.

It works in Claude Desktop, Claude Code, Cursor and VS Code over stdio, and in ChatGPT developer mode as a remote Streamable HTTP endpoint.

> **Privacy:** rendering is done by [Kroki](https://kroki.io). By default, **diagram source is sent to the public kroki.io service**. If your diagrams describe anything you would not paste into a public website, [self-host Kroki](#self-hosting-kroki) and set `KROKI_URL`.

## Tools

All tools are read-only (`readOnlyHint: true`, `openWorldHint: true`).

| Tool | Input | Result |
| --- | --- | --- |
| `list_formats` | none | Every supported format with aliases, outputs, a docs link and a minimal valid example |
| `render_diagram` | `format`, `source` (≤ 100 KB), `output` (`svg` default, or `png`) | SVG as an embedded `image/svg+xml` resource, or PNG as image content, plus a shareable kroki.io link. Invalid source returns `isError: true` with the parser message and line |
| `validate_diagram` | `format`, `source` | `{ valid, errors: [{ line?, message }] }`. An invalid diagram is a normal result, not a tool error |

## Formats

| Format | Aliases | Outputs |
| --- | --- | --- |
| `mermaid` | | svg, png |
| `plantuml` | | svg, png |
| `c4plantuml` | | svg, png |
| `graphviz` | `dot` | svg, png |
| `d2` | | svg |
| `structurizr` | | svg, png |
| `bpmn` | | svg |
| `excalidraw` | | svg |

## Use it locally (stdio)

Requires Node.js 22 or later.

**Claude Desktop**: add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "archform": {
      "command": "npx",
      "args": ["-y", "@archform/mcp"]
    }
  }
}
```

**Claude Code**:

```sh
claude mcp add archform -- npx -y @archform/mcp
```

**Cursor**: add to `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "archform": { "command": "npx", "args": ["-y", "@archform/mcp"] }
  }
}
```

**VS Code**: add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "archform": { "type": "stdio", "command": "npx", "args": ["-y", "@archform/mcp"] }
  }
}
```

To use your own Kroki, add `"env": { "KROKI_URL": "https://kroki.internal.example.com" }` to the server entry.

## Run it remotely (Streamable HTTP)

```sh
npx -y @archform/mcp --http --port 3000
```

- `POST /mcp`: MCP traffic (stateless)
- `GET /health`: health check

By default the server binds to `127.0.0.1` and rejects requests whose `Host` or `Origin` is not localhost (DNS rebinding protection). To expose it publicly, for example for ChatGPT developer mode, bind to all interfaces and name your public hostname:

```sh
HOST=0.0.0.0 ALLOWED_HOSTS=mcp.example.com PORT=8080 npx -y @archform/mcp --http
```

Then add `https://mcp.example.com/mcp` as a connector in ChatGPT (Settings → Connectors, developer mode) with no authentication. Serve it behind HTTPS.

The HTTP endpoint limits request bodies to 512 KB and rate-limits each client IP (60 requests per minute by default, set by `RATE_LIMIT`). The limiter is in memory, so when you run several instances, put a shared limiter in front.

## Configuration

| Flag / variable | Default | Meaning |
| --- | --- | --- |
| `--http` | off | Serve Streamable HTTP instead of stdio |
| `--port`, `PORT` | `3000` | HTTP port |
| `--host`, `HOST` | `127.0.0.1` | HTTP bind address |
| `ALLOWED_HOSTS` | | Comma-separated `Host` values accepted on a public bind |
| `RATE_LIMIT` | `60` | Requests per minute per IP on `/mcp`; `0` disables |
| `KROKI_URL` | `https://kroki.io` | Kroki server used for rendering and share links |

## Self-hosting Kroki

Kroki ships as Docker images. The core image covers PlantUML, C4-PlantUML, Graphviz, D2 and Structurizr; Mermaid, BPMN and Excalidraw each need a companion container:

```yaml
# docker-compose.yml
services:
  kroki:
    image: yuzutech/kroki
    ports: ["8000:8000"]
    environment:
      KROKI_MERMAID_HOST: mermaid
      KROKI_BPMN_HOST: bpmn
      KROKI_EXCALIDRAW_HOST: excalidraw
  mermaid:
    image: yuzutech/kroki-mermaid
  bpmn:
    image: yuzutech/kroki-bpmn
  excalidraw:
    image: yuzutech/kroki-excalidraw
```

```sh
docker compose up -d
KROKI_URL=http://localhost:8000 npx -y @archform/mcp
```

Shareable links then point at your Kroki instance, so they only open for people who can reach it. See the [Kroki installation docs](https://docs.kroki.io/kroki/setup/install/) for details.

## Development

```sh
pnpm install
pnpm test                      # unit + in-process integration tests (Kroki stubbed)
KROKI_LIVE=1 pnpm test         # also run the live tests against KROKI_URL
pnpm build
npx @modelcontextprotocol/inspector node dist/index.js           # stdio
node dist/index.js --http      # then point the Inspector at http://127.0.0.1:3000/mcp
```

## License

MIT
