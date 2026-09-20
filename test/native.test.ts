import assert from "node:assert/strict";
import test from "node:test";
import {
  createDaykeeperReactNativeClient,
  DaykeeperReactNativeClient,
  DaykeeperReactNativeTransportError,
} from "../src/native.ts";

test("native entry fails closed before credentials when transport is omitted", () => {
  let credentials = 0;
  const options = {
    baseUrl: "https://support.example.test",
    getAccessToken: () => {
      credentials++;
      return "synthetic";
    },
  };
  const omitted = () => {
    // @ts-expect-error Native callers must configure a compliant transport.
    return createDaykeeperReactNativeClient(options);
  };
  const constructor = () => {
    // @ts-expect-error The class and factory have the same native requirement.
    return new DaykeeperReactNativeClient(options);
  };
  for (const call of [omitted, constructor]) {
    assert.throws(call, (error) => {
      assert(error instanceof DaykeeperReactNativeTransportError);
      assert.equal(error.code, "INVALID_CONFIGURATION");
      assert.equal(error.retryable, false);
      assert.equal(error.outcomeUnknown, false);
      return true;
    });
  }
  assert.equal(credentials, 0);
});

test("every native operation dispatches with strict redirect and cookie policy", async () => {
  const requests: Request[] = [];
  const client = createDaykeeperReactNativeClient({
    baseUrl: "https://support.example.test/support-api",
    getAccessToken: () => "synthetic-customer-token",
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      return Response.json({});
    },
  });
  await client.getIdentity();
  await client.listConversations();
  await client.createConversation();
  await client.getUnread();
  await client.markConversationSeen(1);
  await client.listMessages(1, { after: 2 });
  await client.sendMessage(1, "synthetic-message");
  await client.claimAnonymousConversation("synthetic-widget-token");
  assert.equal(requests.length, 8);
  for (const request of requests) {
    assert.equal(request.redirect, "error");
    assert.equal(request.credentials, "omit");
    assert.equal(request.cache, "no-store");
    assert.equal(request.headers.get("cache-control"), "no-cache, no-store");
    assert.equal(
      request.headers.get("authorization"),
      "Bearer synthetic-customer-token",
    );
  }
  assert.equal(
    requests.filter((request) => request.method === "POST").length,
    4,
  );
});

test("native read credential refresh keeps the strict transport policy", async () => {
  const requests: Request[] = [];
  const refreshed: boolean[] = [];
  const client = new DaykeeperReactNativeClient({
    baseUrl: "https://support.example.test",
    getAccessToken: ({ forceRefresh }) => {
      refreshed.push(forceRefresh);
      return forceRefresh ? "synthetic-fresh" : "synthetic-old";
    },
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      return requests.length === 1
        ? Response.json(
            { error: "expired_token", retryable: true },
            { status: 401 },
          )
        : Response.json({ unreadCount: 0 });
    },
  });
  await client.getUnread();
  assert.deepEqual(refreshed, [false, true]);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.redirect, "error");
    assert.equal(request.credentials, "omit");
    assert.equal(request.cache, "no-store");
    assert.equal(request.headers.get("cache-control"), "no-cache, no-store");
  }
});
