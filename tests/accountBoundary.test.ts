import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("history creation is server-owned and client POST is rejected", async () => {
  const [route, client, store] = await Promise.all([
    readFile("app/api/history/route.ts", "utf8"),
    readFile("lib/historyService.ts", "utf8"),
    readFile("lib/userDataStore.ts", "utf8"),
  ]);
  assert.match(route, /status: 405/);
  assert.doesNotMatch(client, /saveHistory/);
  assert.match(store, /canonicalizeGeneratedItems/);
});

test("OAuth persistence drops provider tokens and hashes account ids", async () => {
  const auth = await readFile("auth.ts", "utf8");
  const safeAccount = auth.slice(
    auth.indexOf("const safeAccount"),
    auth.indexOf("await baseAdapter.linkAccount")
  );
  assert.match(safeAccount, /protectedAccountId/);
  assert.doesNotMatch(safeAccount, /access_token|refresh_token|id_token/);
});
