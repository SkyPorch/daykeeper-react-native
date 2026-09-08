import assert from "node:assert/strict";
import test from "node:test";
import { createDaykeeperReactNativeClient } from "../../../src/client";
import { createFixtureFetch, FIXTURE_BASE_URL } from "./fixture";

test("synthetic fixture exercises client request contract", async () => {
  const fixture = createFixtureFetch();
  let tokens = 0;
  const client = createDaykeeperReactNativeClient({
    baseUrl: FIXTURE_BASE_URL,
    getAccessToken: () => `fixture-token-${++tokens}`,
    fetch: fixture.fetch,
  });
  assert.equal((await client.getIdentity()).subject, "fixture-subject");
  assert.deepEqual((await client.listConversations()).conversations, []);
  assert.equal((await client.getUnread()).unreadCount, 0);
  assert.equal(tokens, 3);
  assert.deepEqual(
    fixture.calls.map(({ path, method }) => ({ path, method })),
    [
      { path: "/support-api/v1/identity", method: "GET" },
      { path: "/support-api/v1/conversations", method: "GET" },
      { path: "/support-api/v1/unread", method: "GET" },
    ],
  );
  assert.ok(
    fixture.calls.every((call) =>
      call.authorization.startsWith("Bearer fixture-token-"),
    ),
  );
});
