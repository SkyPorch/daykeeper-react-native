// Shared by the installed ESM/CJS consumer and an actual native JS runtime.
// A counting wrapper delegates unchanged requests to the runtime's real fetch.
// This distinguishes SDK dispatches from transparent native transport retries.
export async function runReplayCases(
  sdk,
  origin,
  run,
  progress = () => {},
  runtime = "node",
  transport = globalThis.fetch,
) {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) || !/^[a-z0-9-]+$/.test(run))
    throw new Error("Synthetic loopback fixture configuration required");
  const results = [];
  const operations = {
    read: (client, signal) => client.getUnread({ signal }),
    create: (client, signal) => client.createConversation({ signal }),
    send: (client, signal) =>
      client.sendMessage(1, "Synthetic fixture message", { signal }),
    seen: (client, signal) => client.markConversationSeen(1, { signal }),
    claim: (client, signal) =>
      client.claimAnonymousConversation("synthetic-widget-token", { signal }),
  };
  const scenarios = [
    ["success", null],
    ["auth-denied", "expired_token"],
    ["auth-refresh", "expired_token"],
    ["auth-legacy", "expired_token"],
    ["unavailable", "daykeeper_support_unavailable"],
    ["quota", "daykeeper_usage_limit_exceeded"],
    ["unknown-code", "daykeeper_request_failed"],
    ["malformed", "INVALID_RESPONSE"],
    ["oversized", "RESPONSE_TOO_LARGE"],
    ["drop", "NETWORK_ERROR"],
    ["stall", "REQUEST_TIMEOUT"],
    ["cancel", "REQUEST_ABORTED"],
  ];
  for (const [operation, call] of Object.entries(operations)) {
    for (const [scenario, failure] of scenarios) {
      const id = `${run}-${operation}-${scenario}`;
      const refresh = [];
      let sdkCalls = 0;
      const caller = new AbortController();
      const client = sdk.createDaykeeperReactNativeClient({
        baseUrl: `${origin}/case/${id}/${scenario}`,
        timeoutMs: scenario === "cancel" ? 5000 : 1000,
        getAccessToken: ({ forceRefresh }) => {
          refresh.push(forceRefresh);
          return "synthetic-customer-token";
        },
        fetch: (input, init) => {
          sdkCalls++;
          return transport(input, init);
        },
      });
      // Attach rejection handling immediately while waiting for cancellation.
      const outcome = call(client, caller.signal).then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      if (scenario === "cancel") {
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          const count = await (
            await transport(`${origin}/__fixture/count/${id}`)
          ).json();
          if (count.calls > 0) break;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        caller.abort();
      }
      const { value, error } = await outcome;
      const read = operation === "read";
      const refreshed =
        read && ["auth-refresh", "auth-legacy"].includes(scenario);
      const success = scenario === "success" || refreshed;
      const unknown =
        !read &&
        [
          "unavailable",
          "malformed",
          "oversized",
          "drop",
          "stall",
          "cancel",
        ].includes(scenario);
      const retryable =
        read &&
        ["unavailable", "malformed", "drop", "stall"].includes(scenario);
      check(
        JSON.stringify(refresh) ===
          JSON.stringify(refreshed ? [false, true] : [false]),
        `${id}: credential calls`,
      );
      if (success) check(value && !error, `${id}: expected success`);
      else {
        check(
          error instanceof sdk.DaykeeperReactNativeApiError ||
            error instanceof sdk.DaykeeperReactNativeTransportError,
          `${id}: exported error class`,
        );
        check(error.code === failure, `${id}: error code`);
        check(error.retryable === retryable, `${id}: retryable`);
        check(error.outcomeUnknown === unknown, `${id}: outcomeUnknown`);
        check(
          error.toJSON().outcomeUnknown === unknown,
          `${id}: serialized outcome`,
        );
        check(
          !/synthetic-private|synthetic-customer-token|synthetic-widget-token/.test(
            JSON.stringify(error) + error.stack,
          ),
          `${id}: safe error`,
        );
      }
      const count = await (
        await transport(`${origin}/__fixture/count/${id}`)
      ).json();
      check(
        sdkCalls === (refreshed ? 2 : 1),
        `${id}: SDK fetch dispatch count`,
      );
      // The tested iOS transport retries a dropped idempotent GET internally.
      // Never permit extra wire attempts for writes or explicit auth denials.
      const nativeReadRetry =
        runtime === "ios" &&
        read &&
        scenario === "drop" &&
        count.calls >= 1 &&
        count.calls <= 3;
      check(
        count.calls === sdkCalls || nativeReadRetry,
        `${id}: server observed dispatch count`,
      );
      check(
        count.methods.every((method) => method === (read ? "GET" : "POST")),
        `${id}: HTTP method`,
      );
      const paths = {
        read: "/v1/unread",
        create: "/v1/conversations",
        send: "/v1/conversations/1/messages",
        seen: "/v1/conversations/1/seen",
        claim: "/v1/anonymous-conversations/claim",
      };
      check(
        count.paths.every((path) => path === paths[operation]),
        `${id}: path prefix`,
      );
      results.push({
        operation,
        scenario,
        calls: count.calls,
        sdkCalls,
        code: error?.code ?? null,
        outcomeUnknown: unknown,
      });
      progress(results.length);
    }
  }
  return {
    run,
    cases: results.length,
    calls: results.reduce((sum, result) => sum + result.calls, 0),
    sdkCalls: results.reduce((sum, result) => sum + result.sdkCalls, 0),
    results,
  };
}

function check(condition, label) {
  if (!condition) throw new Error(label);
}
