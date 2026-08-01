/**
 * Fast, no-credit-spend connectivity/auth check. Intended as a CI/pre-release
 * gate — invoke with `npm run smoke`. Never generates a world, so it never
 * spends credits; only confirms that WLT_API_KEY and the Marble API are reachable.
 */

import { createClient } from "./index.js";

async function main() {
  const client = createClient({ timeoutMs: 10_000 });
  const { remainingCredits } = await client.getCredits();
  console.log(`OK: connected to Marble API. Remaining credits: ${remainingCredits}`);
}

main().catch((err) => {
  console.error(`SMOKE FAILED: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`);
  process.exitCode = 1;
});
