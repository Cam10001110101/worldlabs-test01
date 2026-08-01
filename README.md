# @worldlabs/marble-client

TypeScript client SDK for the [World Labs / Marble Public API v1](https://api.worldlabs.ai), plus a thin Cloudflare Workers (Hono) proxy that holds the API key server-side.

The public surface is camelCase; the wire format is snake_case. Requests and responses are validated with Zod (see `src/schemas.ts`) and converted automatically — you never write snake_case field names.

## Install

```bash
npm install
```

## Auth

The API authenticates with a `WLT-Api-Key` header (not `Authorization: Bearer`). The SDK resolves the key from `ClientOptions.apiKey`, falling back to the `WLT_API_KEY` environment variable.

This project's key is stored in 1Password. Load it into your shell:

```bash
export WLT_API_KEY=$(npm run -s dev:key)
```

For the Worker (see below):

- **Local (`wrangler dev`)**: put the key in a git-ignored `.dev.vars` file: `echo "WLT_API_KEY=$(npm run -s dev:key)" > .dev.vars`.
- **Deployed**: `wrangler secret put WLT_API_KEY` (not declared in `wrangler.jsonc` — secrets are set at runtime).

Never print, commit, or log a real key.

## Quickstart

```ts
import { createClient } from "@worldlabs/marble-client";

const client = createClient(); // reads WLT_API_KEY from the environment

const op = await client.generateWorld({
  displayName: "Mystical Forest",
  model: "marble-1.1",
  worldPrompt: { type: "text", textPrompt: "A mystical forest with glowing mushrooms" },
});

const result = await client.waitForOperation(op.operationId, { intervalMs: 3000 });
if ("worldId" in result) {
  console.log(result.worldId, result.worldMarbleUrl, result.assets?.thumbnailUrl);
}
```

`waitForOperation` polls `GET /operations/{id}` until it completes, throwing `OperationFailedError` if the operation itself failed or `OperationTimeoutError` if `timeoutMs` (default 10 minutes) elapses first. Pass `onProgress` to observe each poll.

See `src/demo.ts` for a full end-to-end example. Run it with:

```bash
export WLT_API_KEY=$(npm run -s dev:key) && npm run demo
```

(**Spends real credits** — it generates an actual world and polls until it's ready.)

## Errors

Every SDK method throws a typed subclass of `WorldLabsError`:

| Class | Cause |
| --- | --- |
| `MissingApiKeyError` | No API key supplied and `WLT_API_KEY` is unset |
| `AuthError` | 401 / 403 |
| `OutOfCreditsError` | 402 — `.detail` carries the billing message |
| `RequestValidationError` | 422 — `.validation.detail` carries the field errors |
| `NotFoundError` | 404 |
| `RateLimitError` | 429 |
| `ServerError` | 5xx |
| `NetworkError` | `fetch` threw or the request timed out |
| `OperationFailedError` | A polled operation completed with an error |
| `OperationTimeoutError` | A polled operation didn't finish within `timeoutMs`; `.lastSnapshot` has the last observed state |

Error messages and the attached `.body` are redacted of secret-looking keys (API keys, auth headers) before being stored — safe to log.

## Worker proxy

`worker/index.ts` is a thin Hono app that mirrors the Marble API 1:1 under `/marble/v1`, holding `WLT_API_KEY` as a Worker secret so browser/mobile clients never see it.

```bash
npm run dev      # wrangler dev, reads .dev.vars
npm run deploy   # wrangler deploy
```

```bash
curl http://localhost:8787/marble/v1/credits

curl -X POST http://localhost:8787/marble/v1/worlds:generate \
  -H "Content-Type: application/json" \
  -d '{"worldPrompt": {"type": "text", "textPrompt": "A mystical forest"}}'

curl http://localhost:8787/marble/v1/operations/<operation_id>
```

Thrown SDK errors are mapped to JSON error responses (`{ error, message, ... }`) with the matching HTTP status; client-side validation failures (bad request shape) return `400` before any upstream call is made.

## Viewer

The Worker also serves an HTML viewer that renders a world's Gaussian-splat (`.spz`) asset in-browser with [Spark](https://github.com/sparkjsdev/spark) (`@sparkjsdev/spark`, built by World Labs). It's a zero-build page — three.js and Spark are loaded from a CDN via an import map, so no `npm install`-able dependency is added to this package for it.

```
GET /view/<worldId>          # resolves the world's splat via the SDK (WLT_API_KEY never reaches the browser) and renders it
GET /view/<worldId>?res=100k # override which resolution label to use (defaults to full_res, then the largest "<N>k")
GET /view?url=<spz-url>      # render any publicly-reachable .spz URL directly, without calling the Marble API
```

Drag to orbit, scroll to zoom (Spark's own `SparkControls`). A world with no splats yet (still generating, or a non-splat prompt type) returns `422`; a bad `/view?url=` returns `400`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run build` | `tsc` — emits `dist/src` (published as `.`) and `dist/worker` (published as `./worker`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | `vitest run` |
| `npm run test:watch` | `vitest` in watch mode |
| `npm run demo` | Manual end-to-end demo — **spends real credits**. Run as `export WLT_API_KEY=$(npm run -s dev:key) && npm run demo` |
| `npm run smoke` | Fast auth/connectivity check (just `getCredits`) — no credit spend, safe for CI |
| `npm run dev` | `wrangler dev` — run the Worker proxy locally |
| `npm run deploy` | `wrangler deploy` |
| `npm run dev:key` | Print the World Labs API key from 1Password |

## Reference

Full endpoint and schema reference: `.claude/skills/marble-developer-api/references/api.md` and `references/openapi.yaml`. Base URL: `https://api.worldlabs.ai`.
