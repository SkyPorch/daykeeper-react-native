import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import test from "node:test";
import {
  DaykeeperReactNativeClient as Client,
  DaykeeperReactNativeApiError as ApiError,
  DaykeeperReactNativeTransportError as TransportError,
  type DaykeeperReactNativeRequestOptions as RequestOptions,
} from "../src/index.ts";

const writes = {
  create: (client: Client, options?: RequestOptions) =>
    client.createConversation(options),
  send: (client: Client, options?: RequestOptions) =>
    client.sendMessage(1, "Synthetic message", options),
  seen: (client: Client, options?: RequestOptions) =>
    client.markConversationSeen(1, options),
  claim: (client: Client, options?: RequestOptions) =>
    client.claimAnonymousConversation("synthetic-widget-token", options),
};

function response(text: string, status: number, buffered: boolean): Response {
  if (!buffered) return new Response(text, { status });
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(),
    text: async () => text,
  } as Response;
}

for (const buffered of [false, true]) {
  const transport = buffered ? "native buffered" : "streaming";
  for (const hint of [false, true, undefined, "false", null]) {
    test(`${transport}: first 401 honors boolean ${String(hint)} before refresh`, async () => {
      const refresh: boolean[] = [];
      let calls = 0;
      const client = new Client({
        baseUrl: "https://support.example.test",
        getAccessToken: ({ forceRefresh }) => {
          refresh.push(forceRefresh);
          return "synthetic-token";
        },
        fetch: async () => {
          calls++;
          return calls === 1
            ? response(
                JSON.stringify({ error: "expired_token", retryable: hint }),
                401,
                buffered,
              )
            : response('{"unreadCount":0}', 200, buffered);
        },
      });
      if (hint === false) {
        await assert.rejects(client.getUnread(), (error: unknown) => {
          assert.ok(error instanceof ApiError);
          assert.equal(error.retryable, false);
          assert.equal(error.outcomeUnknown, false);
          return true;
        });
        assert.equal(calls, 1);
        assert.deepEqual(refresh, [false]);
      } else {
        assert.deepEqual(await client.getUnread(), { unreadCount: 0 });
        assert.equal(calls, 2);
        assert.deepEqual(refresh, [false, true]);
      }
    });
  }

  for (const text of ["", "not JSON", "null", "[]"]) {
    test(`${transport}: complete legacy 401 (${text || "empty"}) refreshes once`, async () => {
      let calls = 0;
      const client = new Client({
        baseUrl: "https://support.example.test",
        getAccessToken: () => "synthetic-token",
        fetch: async () =>
          response(
            ++calls === 1 ? text : "{}",
            calls === 1 ? 401 : 200,
            buffered,
          ),
      });
      await client.getUnread();
      assert.equal(calls, 2);
    });
  }

  test(`${transport}: a failed 401 body read never authorizes refresh`, async () => {
    let calls = 0;
    let tokens = 0;
    const client = new Client({
      baseUrl: "https://support.example.test",
      getAccessToken: () => {
        tokens++;
        return "synthetic-token";
      },
      fetch: async () => {
        calls++;
        return buffered
          ? {
              ...response("", 401, true),
              text: async () => {
                throw new Error("private-read-failure");
              },
            }
          : new Response(
              new ReadableStream({
                start(controller) {
                  controller.error(new Error("private-read-failure"));
                },
              }),
              { status: 401 },
            );
      },
    });
    await assert.rejects(client.getUnread(), (error: unknown) => {
      assert.ok(error instanceof TransportError);
      assert.equal(error.code, "NETWORK_ERROR");
      assert.ok(!JSON.stringify(error).includes("private-read-failure"));
      return true;
    });
    assert.equal(calls, 1);
    assert.equal(tokens, 1);
  });

  test(`${transport}: oversized 401 never authorizes refresh`, async () => {
    let calls = 0;
    const client = new Client({
      baseUrl: "https://support.example.test",
      getAccessToken: () => "token",
      fetch: async () => {
        calls++;
        return response("x".repeat(1024 * 1024 + 1), 401, buffered);
      },
    });
    await assert.rejects(
      client.getUnread(),
      (error: unknown) =>
        error instanceof TransportError && error.code === "RESPONSE_TOO_LARGE",
    );
    assert.equal(calls, 1);
  });

  for (const [name, write] of Object.entries(writes)) {
    test(`${transport}: ${name} never replays or recommends replay after HTTP failure`, async () => {
      for (const status of [400, 401, 403, 408, 409, 429, 500, 503]) {
        for (const retryable of [false, true, undefined]) {
          let calls = 0;
          const refresh: boolean[] = [];
          const client = new Client({
            baseUrl: "https://support.example.test",
            getAccessToken: ({ forceRefresh }) => {
              refresh.push(forceRefresh);
              return "token";
            },
            fetch: async () => {
              calls++;
              return response(
                JSON.stringify({ error: "expired_token", retryable }),
                status,
                buffered,
              );
            },
          });
          await assert.rejects(write(client), (error: unknown) => {
            assert.ok(error instanceof ApiError);
            assert.equal(error.status, status);
            assert.equal(error.retryable, false);
            assert.equal(error.outcomeUnknown, status === 408 || status >= 500);
            assert.equal(error.toJSON().outcomeUnknown, error.outcomeUnknown);
            return true;
          });
          assert.equal(calls, 1);
          assert.deepEqual(refresh, [false]);
        }
      }
    });

    test(`${transport}: ${name} treats invalid success bodies as uncertain writes`, async () => {
      for (const text of [
        "",
        "not JSON",
        "null",
        "[]",
        "x".repeat(1024 * 1024 + 1),
      ]) {
        let calls = 0;
        const client = new Client({
          baseUrl: "https://support.example.test",
          getAccessToken: () => "token",
          fetch: async () => {
            calls++;
            return response(text, 200, buffered);
          },
        });
        await rejectsUncertain(write(client));
        assert.equal(calls, 1);
      }
    });
  }
}

for (const [name, write] of Object.entries(writes)) {
  for (const failure of [
    "NETWORK_ERROR",
    "REQUEST_TIMEOUT",
    "REQUEST_ABORTED",
  ] as const) {
    test(`${name}: ${failure} after dispatch is uncertain and non-retryable`, async (t) => {
      t.mock.timers.enable({ apis: ["setTimeout"] });
      const caller = new AbortController();
      let calls = 0;
      const client = new Client({
        baseUrl: "https://support.example.test",
        getAccessToken: () => "token",
        timeoutMs: 1000,
        fetch: async () => {
          calls++;
          if (failure === "NETWORK_ERROR")
            throw new Error("private-network-detail");
          return new Promise<Response>(() => {});
        },
      });
      const rejected = rejectsUncertain(
        write(client, { signal: caller.signal }),
        failure,
      );
      await nextTurn();
      if (failure === "REQUEST_TIMEOUT") t.mock.timers.tick(1000);
      if (failure === "REQUEST_ABORTED") caller.abort("private-abort-detail");
      await rejected;
      assert.equal(calls, 1);
    });
  }

  test(`${name}: credential failure, pre-abort, and credential timeout do not imply dispatch`, async (t) => {
    for (const failure of [
      "TOKEN_PROVIDER_ERROR",
      "REQUEST_ABORTED",
      "REQUEST_TIMEOUT",
    ]) {
      t.mock.timers.enable({ apis: ["setTimeout"] });
      let calls = 0;
      const caller = new AbortController();
      if (failure === "REQUEST_ABORTED") caller.abort();
      const client = new Client({
        baseUrl: "https://support.example.test",
        timeoutMs: 1000,
        getAccessToken: () => {
          if (failure === "TOKEN_PROVIDER_ERROR")
            throw new Error("private-credential-detail");
          return new Promise<string>(() => {});
        },
        fetch: async () => {
          calls++;
          return Response.json({});
        },
      });
      const rejected = assert.rejects(
        write(client, { signal: caller.signal }),
        (error: unknown) => {
          assert.ok(error instanceof TransportError);
          assert.equal(error.code, failure);
          assert.equal(error.outcomeUnknown, false);
          assert.equal(error.retryable, false);
          return true;
        },
      );
      await nextTurn();
      if (failure === "REQUEST_TIMEOUT") t.mock.timers.tick(1000);
      await rejected;
      assert.equal(calls, 0);
      t.mock.timers.reset();
    }
  });
}

test("mis-shaped API error codes cannot enter message, stack, or serialization", async () => {
  for (const code of [
    "Bearer private-token",
    "private diagnostic",
    "Private_Diagnostic",
    "private-diagnostic",
    "_private_diagnostic",
    "9private",
    "ab",
    `a${"b".repeat(64)}`,
    { private: "detail" },
    null,
    42,
  ]) {
    const client = new Client({
      baseUrl: "https://support.example.test",
      getAccessToken: () => "private-token",
      fetch: async () =>
        Response.json(
          {
            error: code,
            message: "private-message",
            nextAction: "private-action",
          },
          { status: 403 },
        ),
    });
    await assert.rejects(client.getUnread(), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, "daykeeper_request_failed");
      assert.equal(error.message, "daykeeper_request_failed");
      assert.doesNotMatch(
        error.stack ?? "",
        /private_diagnostic|Private_Diagnostic|private-diagnostic|private-token|private-message|private-action/,
      );
      assert.ok(!JSON.stringify(error).includes("private"));
      return true;
    });
  }
});

test("uncertain error constructors cannot be marked retryable", () => {
  for (const error of [
    new ApiError({
      status: 503,
      code: "daykeeper_support_unavailable",
      retryable: true,
      outcomeUnknown: true,
    }),
    new TransportError({
      code: "NETWORK_ERROR",
      message: "Safe local message",
      retryable: true,
      outcomeUnknown: true,
    }),
  ]) {
    assert.equal(error.retryable, false);
    assert.equal(error.toJSON().outcomeUnknown, true);
  }
});

test("the legacy rate_limited public code remains stable", async () => {
  const client = new Client({
    baseUrl: "https://support.example.test",
    getAccessToken: () => "token",
    fetch: async () =>
      Response.json({ error: "rate_limited" }, { status: 429 }),
  });
  await assert.rejects(client.getUnread(), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, "rate_limited");
    assert.equal(error.retryable, true);
    return true;
  });
});

function rejectsUncertain(request: Promise<unknown>, code?: string) {
  return assert.rejects(request, (error: unknown) => {
    assert.ok(error instanceof TransportError);
    if (code) assert.equal(error.code, code);
    assert.equal(error.retryable, false);
    assert.equal(error.outcomeUnknown, true);
    assert.equal(error.toJSON().outcomeUnknown, true);
    assert.ok(!JSON.stringify(error).includes("private"));
    return true;
  });
}
