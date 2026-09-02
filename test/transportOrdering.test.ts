import assert from "node:assert/strict";
import test from "node:test";
import {
  DaykeeperReactNativeClient as Client,
  DaykeeperReactNativeApiError as ApiError,
  DaykeeperReactNativeTransportError as TransportError,
} from "../src/index.ts";

test("an HTML 401 still authorizes exactly one credential refresh", async () => {
  for (const contentType of ["text/html", "application/json"]) {
    const refresh: boolean[] = [];
    let calls = 0;
    const sdk = new Client({
      baseUrl: "https://support.example.test",
      getAccessToken: ({ forceRefresh }) => {
        refresh.push(forceRefresh);
        return "synthetic-token";
      },
      fetch: async () => {
        calls += 1;
        return calls === 1
          ? new Response("<html><body>401 Unauthorized</body></html>", {
              status: 401,
              headers: { "content-type": contentType },
            })
          : Response.json({ unreadCount: 0 });
      },
    });
    assert.deepEqual(await sdk.getUnread(), { unreadCount: 0 });
    assert.equal(calls, 2);
    assert.deepEqual(refresh, [false, true]);
  }
});

test("an HTML error page keeps its HTTP status instead of a parse failure", async () => {
  for (const status of [400, 403, 404, 429, 500, 502, 503]) {
    const sdk = new Client({
      baseUrl: "https://support.example.test",
      getAccessToken: () => "synthetic-token",
      fetch: async () =>
        new Response("<html><body>Gateway error</body></html>", {
          status,
          headers: { "content-type": "text/html" },
        }),
    });
    await assert.rejects(sdk.getUnread(), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, status);
      assert.equal(error.code, "daykeeper_request_failed");
      assert.ok(!JSON.stringify(error).includes("Gateway error"));
      return true;
    });
  }
});

test("a successful response with an unparseable body is still invalid", async () => {
  const sdk = new Client({
    baseUrl: "https://support.example.test",
    getAccessToken: () => "synthetic-token",
    fetch: async () => new Response("<html></html>", { status: 200 }),
  });
  await assert.rejects(sdk.getUnread(), (error) => {
    assert.ok(error instanceof TransportError);
    assert.equal(error.code, "INVALID_RESPONSE");
    return true;
  });
});

test("loopback base URLs may use http, including bracketed IPv6", () => {
  for (const baseUrl of [
    "http://localhost:3002",
    "http://LOCALHOST:3002",
    "http://127.0.0.1:3002",
    "http://[::1]:3002",
    "http://[0:0:0:0:0:0:0:1]:3002",
  ]) {
    assert.doesNotThrow(
      () =>
        new Client({
          baseUrl,
          getAccessToken: () => "synthetic-token",
          fetch: async () => Response.json({}),
        }),
      baseUrl,
    );
  }
});

test("non-loopback base URLs still require https", () => {
  for (const baseUrl of [
    "http://support.example.test",
    "http://[::2]:3002",
    "http://127.0.0.2:3002",
    "http://localhost.example.test",
  ]) {
    assert.throws(
      () =>
        new Client({
          baseUrl,
          getAccessToken: () => "synthetic-token",
          fetch: async () => Response.json({}),
        }),
      (error: unknown) =>
        error instanceof TransportError &&
        error.code === "INVALID_CONFIGURATION",
      baseUrl,
    );
  }
});
