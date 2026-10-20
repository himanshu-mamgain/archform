# Archform

Diagrams as code for AI assistants. This repo is a monorepo for the `@archform` npm scope.

The first package is `@archform/mcp`, an MCP server that lets AI assistants (Claude Desktop, Cursor, VS Code, ChatGPT) render and validate diagrams written in standard text formats: Mermaid, PlantUML, Graphviz, D2 and others.

## Goal for v0.1

A published npm package that works two ways:
- **Locally**, through `npx @archform/mcp` over stdio (Claude Desktop, Cursor, VS Code).
- **Remotely**, as a hosted Streamable HTTP endpoint that ChatGPT developer mode can connect to.

Keep it to one package for now. Extract shared code into `@archform/core` only when a second consumer (such as a CLI) exists.

## Stack

- Node.js 22+, TypeScript in strict mode, ESM only.
- **MCP TypeScript SDK v2**: `@modelcontextprotocol/server` (plus `@modelcontextprotocol/hono` for HTTP and `@modelcontextprotocol/client` in tests). Do not use the v1 package `@modelcontextprotocol/sdk`.
  - Read the v2 docs before writing SDK code: https://ts.sdk.modelcontextprotocol.io/v2/ (full text: `/v2/llms-full.txt`).
  - Don't rely on remembered v1 APIs; v2 changed imports and transports.
- Zod v4 (`zod/v4`) for tool input schemas.
- pnpm workspaces, tsup for builds, vitest for tests, Biome for lint and format.
- TypeScript is pinned to 5.9: TypeScript 7 is the native port and tooling support lags.

## Commands

```sh
pnpm install
pnpm lint          # biome check .
pnpm typecheck
pnpm test          # Kroki stubbed; KROKI_LIVE=1 adds live tests
pnpm build
```

If pnpm is not installed and `corepack enable` fails, use `npx pnpm@10.28.0 <command>`.

## Layout

```
packages/
  mcp/                  @archform/mcp
    src/
      index.ts          CLI entry: stdio by default, --http [--port N] for Streamable HTTP
      http.ts           Hono app: POST /mcp, GET /health, rate limiting, body size limit
      server.ts         createServer(): builds the McpServer and registers tools
      tools/            one file per tool
      renderers/        Renderer interface, kroki.ts, kroki-errors.ts
      formats.ts        format registry
    test/
    server.json         MCP Registry entry; its versions must match package.json
```

## Formats (v0.1)

`mermaid`, `plantuml`, `c4plantuml`, `graphviz` (alias `dot`), `d2`, `structurizr`, `bpmn`, `excalidraw`.

`formats.ts` holds one entry per format: `id`, `aliases`, supported outputs, a one-line description, a docs link, and a minimal valid example. Output support is checked against https://kroki.io/#support: d2, bpmn and excalidraw are SVG only.

## Tools (v0.1)

Every tool sets `annotations: { readOnlyHint: true, openWorldHint: true }`. ChatGPT treats any tool without `readOnlyHint` as a write action and asks the user to confirm every call.

1. **`list_formats`**: the format registry, including examples.
2. **`render_diagram`**: `format`, `source` (max 100 KB), `output` (`svg` default | `png`). PNG as image content, SVG as an embedded `image/svg+xml` resource, plus a shareable Kroki GET URL. Invalid source returns `isError: true` with the parser message and line.
3. **`validate_diagram`**: `format`, `source` → `{ valid, errors: [{ line?, message }] }`. An invalid diagram is a normal result, not a tool error.

`convert_diagram` (for example Mermaid to draw.io) is planned for v0.2.

Tool descriptions are the API the model reads: say when to use the tool, name the formats, and point to `validate_diagram` or `list_formats` when unsure of syntax. Keep them accurate and short.

## Rendering

- `Renderer` interface: `render(format, source, output) → Promise<Buffer>`, optional `shareUrl()`.
- `KrokiRenderer`: `POST ${KROKI_URL}/${format}/${output}` with a `text/plain` body, 15-second `AbortSignal.timeout`.
- Share URL: `${KROKI_URL}/${format}/svg/${zlib deflate → base64url}`.
- Error semantics:
  - **HTTP 400** means an invalid diagram: `DiagramSyntaxError`, parsed by `kroki-errors.ts`.
  - **5xx, timeouts and network errors** are `RenderServiceError`, never "invalid diagram". kroki.io's Mermaid backend has returned 500 even for valid input.
- Kroki error quirks: PlantUML and C4-PlantUML report **0-based** line numbers (we add 1). Bodies may include JS stack traces, which are stripped.
- **Privacy:** with the default `KROKI_URL`, diagram source goes to the public kroki.io service. The README says so and explains how to self-host Kroki.

## Transports

- **stdio (default):** `serveStdio` from `@modelcontextprotocol/server/stdio`. Never write to stdout; log to stderr.
- **`--http`:** `createMcpHandler` mounted on `createMcpHonoApp`, served with `@hono/node-server`. It is stateless.
  - The port comes from `--port`, then `PORT`, then defaults to 3000.
  - The host comes from `--host`, then `HOST`, then defaults to `127.0.0.1`.
  - A public bind needs `ALLOWED_HOSTS`.
- The SDK's Hono app rejects requests whose `Host` is not allowed. A test `Request` has no `Host` header unless you set one.
- **Auth:** none in v0.1. The HTTP endpoint has a 512 KB body limit and an in-memory limiter in `rate-limit.ts`:
  - It counts `tools/call` messages, not HTTP requests. Limits are global (`RATE_LIMIT`, sized to Kroki) and per client (`RATE_LIMIT_PER_CLIENT`).
  - It ignores `X-Forwarded-For` unless `TRUST_PROXY=N`, and then uses the Nth entry from the end, never the first, which the client controls.
  - ChatGPT traffic arrives from a few shared OpenAI IPs.

## Testing

- **Unit:** format registry and aliases, Kroki URL encoding, error parsing.
- **Integration:** an SDK `Client` connects in-process through `handler.fetch` (`test/helpers.ts`). Kroki is reached with a stubbed global `fetch`.
- **Live:** `KROKI_LIVE=1` renders every registry example against real Kroki.
- **Manual:** `npx @modelcontextprotocol/inspector node packages/mcp/dist/index.js`, and the same against `--http`.

## Publishing

- The scope is a free npm org, so `publishConfig.access` must be `public`.
- `.github/workflows/publish.yml` runs on every push to `main`. It publishes only when the version in `packages/mcp/package.json` is not yet on npm.
  - npm publishing uses trusted publishing (OIDC) with provenance, with no `NPM_TOKEN`.
  - The same run publishes `server.json` to the MCP Registry through `mcp-publisher login github-oidc`.
- To release, bump the version in both `package.json` and `server.json`. `test/package.test.ts` fails if they drift apart.

## Conventions

- Tool handlers never throw for bad user input. They return `isError: true` with a message the model can act on.
- Validate all input with Zod before doing any work.
- Small, focused commits with conventional commit messages (`feat:`, `fix:`, `chore:`).
- Changes go through a branch and a pull request.
