import assert from "node:assert/strict";
import test from "node:test";
import * as sdk from "../../src/native.ts";
import { runCacheCases } from "./cases.js";
import { startCacheFixture } from "./server.mjs";

test("cache fixture observes actual native-entry wire policy for all reads", async () => {
  const fixture = await startCacheFixture();
  try {
    const result = await runCacheCases({
      createClient: (options) =>
        sdk.createDaykeeperReactNativeClient({ ...options, fetch }),
      transport: fetch,
      origin: fixture.origin,
      run: "unit",
      nativeHeaders: true,
    });
    assert.equal(result.summary.cases, 24);
    assert.equal(result.summary.positiveCacheControls, 0);
  } finally {
    await fixture.close();
  }
});

test("cache probe refuses non-loopback origins before dispatch", async () => {
  let calls = 0;
  await assert.rejects(
    runCacheCases({
      createClient: () => {
        calls++;
      },
      transport: () => {
        calls++;
      },
      origin: "https://support.example.test",
      run: "refused",
    }),
    /Loopback origin required/,
  );
  assert.equal(calls, 0);
});

test("Node wire checks cannot claim a native positive cache control", async () => {
  const fixture = await startCacheFixture();
  try {
    await assert.rejects(
      runCacheCases({
        createClient: () => {
          throw new Error("Protected calls must wait for a seeded cache");
        },
        transport: fetch,
        origin: fixture.origin,
        run: "no-native-cache",
        requireCache: true,
        nativeHeaders: true,
        operations: ["identity"],
      }),
      /positive cache control not established/,
    );
  } finally {
    await fixture.close();
  }
});

test("missing native policy fails the cache wire probe even when Node has no cache", async () => {
  const fixture = await startCacheFixture();
  try {
    await assert.rejects(
      runCacheCases({
        createClient: (options) =>
          sdk.createDaykeeperReactNativeClient({
            ...options,
            fetch: (input, init) => {
              const headers = new Headers(init.headers);
              headers.delete("cache-control");
              return fetch(input, { ...init, headers });
            },
          }),
        transport: fetch,
        origin: fixture.origin,
        run: "missing",
        nativeHeaders: true,
      }),
      /native cache policy missing/,
    );
  } finally {
    await fixture.close();
  }
});

test("cache fixture rejects real-looking tokens without recording or echoing them", async () => {
  const fixture = await startCacheFixture();
  try {
    for (const authorization of [
      "Bearer not-a-fixture-token",
      "toString",
      "__proto__",
    ]) {
      const response = await fetch(
        `${fixture.origin}/case/refused/public/v1/identity`,
        { headers: { authorization } },
      );
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {});
    }
    const record = await fetch(`${fixture.origin}/record/refused`);
    assert.equal(record.headers.get("cache-control"), "no-store");
    assert.deepEqual(await record.json(), []);
  } finally {
    await fixture.close();
  }
});
