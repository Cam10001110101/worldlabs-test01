/**
 * Manual, credit-spending demo of the Marble client SDK. Not run as part of
 * automated verification — invoke explicitly with `npm run demo`.
 *
 * Requires WLT_API_KEY in the environment (see `.env.example` / `npm run -s dev:key`).
 */

import { createClient, OperationFailedError, OperationTimeoutError, OutOfCreditsError } from "./index.js";

async function main() {
  const client = createClient();

  const { remainingCredits } = await client.getCredits();
  console.log(`Remaining credits: ${remainingCredits}`);

  const op = await client.generateWorld({
    displayName: "SDK Demo World",
    model: "marble-1.0-draft",
    worldPrompt: { type: "text", textPrompt: "A small floating island with a lighthouse" },
  });
  console.log(`Started operation ${op.operationId}, polling...`);

  const result = await client.waitForOperation(op.operationId, {
    intervalMs: 3000,
    timeoutMs: 10 * 60_000,
    onProgress: (snapshot) => console.log(`  ...still running (done=${snapshot.done})`),
  });

  if ("worldId" in result) {
    console.log(`World ready: ${result.worldId} — ${result.worldMarbleUrl}`);
    console.log(`Thumbnail: ${result.assets?.thumbnailUrl ?? "(none)"}`);
    console.log(`Pano: ${result.assets?.imagery?.panoUrl ?? "(none)"}`);
    console.log(`Collider mesh: ${result.assets?.mesh?.colliderMeshUrl ?? "(none)"}`);
    console.log(`Splat files: ${JSON.stringify(result.assets?.splats?.spzUrls ?? {})}`);
  }
}

main().catch((err) => {
  if (err instanceof OutOfCreditsError) {
    console.error(`Out of credits: ${err.detail ?? err.message}`);
  } else if (err instanceof OperationFailedError || err instanceof OperationTimeoutError) {
    console.error(err.message);
  } else {
    console.error(err instanceof Error ? err.message : String(err));
  }
  process.exitCode = 1;
});
