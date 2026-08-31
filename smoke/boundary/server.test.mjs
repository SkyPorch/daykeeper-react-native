import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import test from "node:test";
import * as sdk from "../../src/index.ts";
import { runBoundaryCases } from "./cases.js";
import { startBoundaryFixture } from "./server.mjs";

test("boundary receiver records partial bodies before completion", async () => {
  const fixture = await startBoundaryFixture();
  const request = httpRequest(`${fixture.receiverOrigin}/sink/partial`, {
    method: "POST",
    headers: { "content-length": "2" },
  });
  request.on("error", () => {});
  try {
    request.write("x");
    let record;
    for (let attempt = 0; attempt < 20; attempt++) {
      const response = await fetch(`${fixture.origin}/record/partial`, {
        signal: AbortSignal.timeout(2000),
      });
      record = await response.json();
      if (record.sink[0]?.bodyBytes === 1) break;
    }
    assert.equal(record.sink.length, 1);
    assert.deepEqual(record.sink[0], {
      method: "POST",
      receiver: 1,
      authorization: false,
      cookie: false,
      body: true,
      bodyBytes: 1,
      declaredBody: true,
      complete: false,
    });
  } finally {
    request.destroy();
    await fixture.close();
  }
});

test("boundary cases refuse a non-loopback origin before calling transport", async () => {
  let calls = 0;
  await assert.rejects(
    runBoundaryCases(
      sdk,
      async () => {
        calls++;
      },
      "https://support.example.test",
      "refused",
      true,
    ),
    /Loopback origin required/,
  );
  assert.equal(calls, 0);
});

test("an unavailable transport cannot pass the redirect safety probe", async () => {
  const fixture = await startBoundaryFixture();
  try {
    await assert.rejects(
      runBoundaryCases(
        sdk,
        async () => {
          throw new Error("Synthetic unavailable transport");
        },
        fixture.origin,
        "unavailable",
        true,
      ),
      /Synthetic unavailable transport/,
    );
    const response = await fetch(
      `${fixture.origin}/record/unavailable-direct-read`,
    );
    assert.deepEqual(await response.json(), { source: [], sink: [] });
  } finally {
    await fixture.close();
  }
});
