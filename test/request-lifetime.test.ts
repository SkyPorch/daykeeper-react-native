import assert from "node:assert/strict";
import test from "node:test";
import {
  createDaykeeperReactNativeClient,
  DaykeeperReactNativeTransportError,
} from "../src/index.ts";

const never = <T>(): Promise<T> => new Promise(() => {});
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function rejectsBoundedly(
  pending: Promise<unknown>,
  code: string,
  outcomeUnknown: boolean,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await assert.rejects(
      Promise.race([
        pending,
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(new Error("SDK did not settle within the test budget")),
            2_000,
          );
        }),
      ]),
      (error) => {
        assert(error instanceof DaykeeperReactNativeTransportError);
        assert.equal(error.code, code);
        assert.equal(error.outcomeUnknown, outcomeUnknown);
        if (outcomeUnknown) assert.equal(error.retryable, false);
        return true;
      },
    );
  } finally {
    clearTimeout(timer);
  }
}

test("deadline bounds a token provider that never settles without dispatch", async () => {
  let requests = 0;
  const client = createDaykeeperReactNativeClient({
    baseUrl: "https://support.example.test",
    timeoutMs: 1_000,
    getAccessToken: () => never<string>(),
    fetch: async () => {
      requests++;
      return Response.json({});
    },
  });
  await rejectsBoundedly(client.createConversation(), "REQUEST_TIMEOUT", false);
  assert.equal(requests, 0);
});

test("an already aborted request does not acquire credentials or dispatch", async () => {
  let tokenCalls = 0;
  let requests = 0;
  const controller = new AbortController();
  controller.abort();
  const client = createDaykeeperReactNativeClient({
    baseUrl: "https://support.example.test",
    getAccessToken: () => {
      tokenCalls++;
      return "customer-token";
    },
    fetch: async () => {
      requests++;
      return Response.json({});
    },
  });
  await rejectsBoundedly(
    client.createConversation({ signal: controller.signal }),
    "REQUEST_ABORTED",
    false,
  );
  assert.equal(tokenCalls, 0);
  assert.equal(requests, 0);
});

test("caller abort settles a pending token and prevents a later dispatch", async () => {
  let resolveToken!: (value: string) => void;
  let requests = 0;
  const controller = new AbortController();
  const client = createDaykeeperReactNativeClient({
    baseUrl: "https://support.example.test",
    getAccessToken: () =>
      new Promise((resolve) => {
        resolveToken = resolve;
      }),
    fetch: async () => {
      requests++;
      return Response.json({});
    },
  });
  const pending = client.createConversation({ signal: controller.signal });
  await tick();
  controller.abort();
  await rejectsBoundedly(pending, "REQUEST_ABORTED", false);
  resolveToken("late-customer-token");
  await tick();
  assert.equal(requests, 0);
});

test("non-cooperative fetch is bounded and a dispatched write stays unknown", async () => {
  let requests = 0;
  let signal: AbortSignal | null | undefined;
  const client = createDaykeeperReactNativeClient({
    baseUrl: "https://support.example.test",
    timeoutMs: 1_000,
    getAccessToken: () => "customer-token",
    fetch: async (_input, init) => {
      requests++;
      signal = init?.signal;
      return never<Response>();
    },
  });
  await rejectsBoundedly(client.createConversation(), "REQUEST_TIMEOUT", true);
  assert.equal(requests, 1);
  assert.equal(signal?.aborted, true);
});

test("a response arriving after caller abort is cancelled without reviving the write", async () => {
  let resolveFetch!: (response: Response) => void;
  let cancellations = 0;
  const controller = new AbortController();
  const client = createDaykeeperReactNativeClient({
    baseUrl: "https://support.example.test",
    getAccessToken: () => "customer-token",
    fetch: () =>
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
  });
  const pending = client.createConversation({ signal: controller.signal });
  await tick();
  controller.abort();
  await rejectsBoundedly(pending, "REQUEST_ABORTED", true);
  resolveFetch(
    new Response(
      new ReadableStream({
        cancel() {
          cancellations++;
        },
      }),
    ),
  );
  await tick();
  assert.equal(cancellations, 1);
});

test("stream reads and non-cooperative cancellation cannot outlive the deadline", async () => {
  let cancellations = 0;
  const client = createDaykeeperReactNativeClient({
    baseUrl: "https://support.example.test",
    timeoutMs: 1_000,
    getAccessToken: () => "customer-token",
    fetch: async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull: () => never<void>(),
          cancel: () => {
            cancellations++;
            return never<void>();
          },
        }),
      ),
  });
  await rejectsBoundedly(client.createConversation(), "REQUEST_TIMEOUT", true);
  assert.equal(cancellations, 1);
});

test("buffered native response parsing shares the request deadline", async () => {
  const client = createDaykeeperReactNativeClient({
    baseUrl: "https://support.example.test",
    timeoutMs: 1_000,
    getAccessToken: () => "customer-token",
    fetch: async () =>
      ({
        status: 200,
        ok: true,
        headers: new Headers(),
        body: null,
        text: () => never<string>(),
      }) as Response,
  });
  await rejectsBoundedly(client.createConversation(), "REQUEST_TIMEOUT", true);
});

test("a stalled forced credential refresh cannot leave a read pending", async () => {
  const refreshes: boolean[] = [];
  let requests = 0;
  const client = createDaykeeperReactNativeClient({
    baseUrl: "https://support.example.test",
    timeoutMs: 1_000,
    getAccessToken: ({ forceRefresh }) => {
      refreshes.push(forceRefresh);
      return forceRefresh ? never<string>() : "stale-customer-token";
    },
    fetch: async () => {
      requests++;
      return Response.json({ error: "expired_token" }, { status: 401 });
    },
  });
  await rejectsBoundedly(client.getUnread(), "REQUEST_TIMEOUT", false);
  assert.deepEqual(refreshes, [false, true]);
  assert.equal(requests, 1);
});
