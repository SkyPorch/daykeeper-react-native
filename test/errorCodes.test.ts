import assert from "node:assert/strict";
import test from "node:test";
import {
  DaykeeperReactNativeClient as Client,
  DaykeeperReactNativeApiError as ApiError,
} from "../src/index.ts";
import { isDaykeeperApiErrorCode } from "../src/errors.ts";

/**
 * Every error code the Daykeeper support gateway can put in the customer-facing
 * `{ "error": ... }` envelope, enumerated from `apps/gateway/server.mjs`,
 * `apps/gateway/auth.mjs` and `apps/gateway/chatwoot-client.mjs` in
 * `SkyPorch/daykeeper`. Consuming apps switch on these, so the SDK must hand
 * every one of them through unchanged. The gateway's vocabulary is open: it
 * grows without an SDK release, which is why the SDK checks the shape of a code
 * rather than matching it against a list.
 */
const GATEWAY_ERROR_CODES = [
  // auth.mjs — SupportAuthError, 401 unless noted
  "missing_bearer_token",
  "invalid_bearer_token",
  "invalid_token",
  "invalid_tenant",
  "unsupported_token",
  "invalid_signature",
  "invalid_issuer",
  "invalid_audience",
  "invalid_subject",
  "invalid_expiration",
  "expired_token",
  "token_lifetime_too_long",
  // server.mjs
  "unknown_tenant",
  "insufficient_scope",
  "erasure_targets_do_not_match_token",
  "unknown_campaign",
  "widget_token_required",
  "not_found",
  "support_upstream_rejected",
  "support_upstream_unavailable",
  // Codes the customer app still switches on from the pre-gateway support
  // stack and from services in front of the gateway. They are not emitted by
  // the three gateway modules today, but the contract calls codes extensible
  // and the SDK must not decide which ones are real.
  "support_gateway_request_failed",
  "conversation_not_found",
  "daykeeper_usage_limit_exceeded",
  "daykeeper_usage_not_enabled",
  "daykeeper_support_not_ready",
  "daykeeper_resource_conflict",
  "daykeeper_support_unavailable",
  "rate_limited",
];

function client(body: unknown, status: number): Client {
  return new Client({
    baseUrl: "https://support.example.test",
    getAccessToken: () => "synthetic-token",
    fetch: async () => Response.json(body, { status }),
  });
}

for (const code of GATEWAY_ERROR_CODES) {
  test(`gateway error code ${code} survives unchanged`, async () => {
    await assert.rejects(client({ error: code }, 403).getUnread(), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, code);
      assert.equal(error.message, code);
      assert.equal(JSON.parse(JSON.stringify(error)).code, code);
      return true;
    });
  });
}

test("every enumerated gateway code has the documented shape", () => {
  // Ask the SDK's own predicate rather than restating the pattern here, so a
  // change to the rule cannot pass a test that quietly kept the old one.
  for (const code of GATEWAY_ERROR_CODES) {
    assert.ok(isDaykeeperApiErrorCode(code), code);
  }
  assert.equal(new Set(GATEWAY_ERROR_CODES).size, GATEWAY_ERROR_CODES.length);
});

test("isDaykeeperApiErrorCode accepts only code-shaped strings", () => {
  for (const value of [
    "abc",
    "not_found",
    "a1_b2_c3",
    "a".repeat(64),
    "support_upstream_rejected",
  ]) {
    assert.ok(isDaykeeperApiErrorCode(value), JSON.stringify(value));
  }

  for (const value of [
    "ab", // shorter than the minimum
    "a".repeat(65), // longer than the maximum
    "", // empty
    "Not_Found", // upper case
    "not-found", // hyphen
    "not found", // whitespace
    " not_found", // leading whitespace
    "not_found\n", // trailing newline
    "_not_found", // leading underscore
    "1not_found", // leading digit
    "not_found\u0000", // embedded NUL
    "nöt_found", // non-ASCII
    // A non-string can still look like a code once coerced. The predicate must
    // reject the value itself rather than anything it can be turned into.
    ["not_found"],
    { toString: () => "not_found" },
    { valueOf: () => "not_found" },
    new String("not_found"),
    null,
    undefined,
    42,
    true,
    Symbol("not_found"),
  ]) {
    assert.equal(isDaykeeperApiErrorCode(value), false, String(value));
  }
});

test("a coercible object error code never reaches the caller", async () => {
  for (const code of [
    ["support_upstream_rejected"],
    { toString: () => "support_upstream_rejected" },
  ]) {
    await assert.rejects(client({ error: code }, 502).getUnread(), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, "daykeeper_request_failed");
      assert.equal(error.message, "daykeeper_request_failed");
      return true;
    });
  }
});

test("a code the SDK has never seen is still handed to the caller", async () => {
  // The gateway can ship a new code before the SDK does; that must not become
  // a silent contract break in the consuming app's switch statement.
  for (const code of [
    "support_brand_new_condition",
    "invalid_future_claim",
    "a".repeat(64),
    "ab0",
  ]) {
    await assert.rejects(client({ error: code }, 400).getUnread(), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, code);
      return true;
    });
  }
});

test("free-form gateway messages collapse instead of leaking prose", async () => {
  // server.mjs answers some 4xx failures with `error: <Error.message>` rather
  // than a code. Those are English sentences and never reach the caller.
  for (const prose of [
    "Payload too large",
    "Invalid JSON",
    "At least one erasure target is required",
    "At most 100 erasure targets are allowed",
    "Each erasure target needs a userId or email",
    "Message content is required",
    "Conversation not found",
  ]) {
    await assert.rejects(client({ error: prose }, 400).getUnread(), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, "daykeeper_request_failed");
      assert.equal(error.message, "daykeeper_request_failed");
      assert.ok(!JSON.stringify(error).includes(prose));
      assert.ok(!(error.stack ?? "").includes(prose));
      return true;
    });
  }
});

test("the contract message field never becomes the error message", async () => {
  await assert.rejects(
    client(
      {
        error: "daykeeper_usage_limit_exceeded",
        message: "You have used your included conversations for August.",
        retryable: false,
        nextAction: "review_usage",
      },
      429,
    ).getUnread(),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, "daykeeper_usage_limit_exceeded");
      assert.equal(error.message, "daykeeper_usage_limit_exceeded");
      // Honor an explicit server veto: a 429 is not automatically retryable
      // when the server says not to replay it.
      assert.equal(error.retryable, false);
      assert.ok(!JSON.stringify(error).includes("August"));
      return true;
    },
  );
});

test("a 429 without retry advice keeps status-based retryability", async () => {
  await assert.rejects(
    client({ error: "rate_limited" }, 429).getUnread(),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

test("the contract nextAction is projected through a closed allowlist", async () => {
  for (const nextAction of [
    "review_usage",
    "review_setup",
    "refresh_conversation",
  ] as const) {
    await assert.rejects(
      client(
        { error: "daykeeper_usage_limit_exceeded", nextAction },
        429,
      ).getUnread(),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.nextAction, nextAction);
        assert.equal(JSON.parse(JSON.stringify(error)).nextAction, nextAction);
        return true;
      },
    );
  }
});

test("an unrecognized nextAction collapses to undefined", async () => {
  // Unlike a code, a next action is an instruction the app acts on, so the
  // vocabulary stays closed: an unknown hint is dropped, not surfaced.
  for (const nextAction of [
    "review_billing",
    "contact_support",
    "Review_Usage",
    "review usage",
    "",
    ["review_usage"],
    { toString: () => "review_usage" },
    null,
    42,
    true,
  ]) {
    await assert.rejects(
      client(
        { error: "daykeeper_usage_limit_exceeded", nextAction },
        429,
      ).getUnread(),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.nextAction, undefined);
        const serialized = JSON.parse(JSON.stringify(error)) as Record<
          string,
          unknown
        >;
        assert.ok(!("nextAction" in serialized));
        assert.ok(!JSON.stringify(error).includes("review_billing"));
        return true;
      },
    );
  }
});

test("an absent nextAction stays absent from serialization", async () => {
  await assert.rejects(
    client({ error: "not_found" }, 404).getUnread(),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.nextAction, undefined);
      assert.ok(!("nextAction" in JSON.parse(JSON.stringify(error))));
      return true;
    },
  );
});
