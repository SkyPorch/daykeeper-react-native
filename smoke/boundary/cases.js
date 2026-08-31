const operations = {
  read: (client) => client.getUnread(),
  create: (client) => client.createConversation(),
  seen: (client) => client.markConversationSeen(1),
  send: (client) => client.sendMessage(1, "synthetic-message"),
  claim: (client) =>
    client.claimAnonymousConversation("synthetic-widget-token"),
};

function check(condition, message) {
  if (!condition) throw new Error(message);
}

// This observes actual SDK calls and server receipts. It never fabricates a
// transport response and never treats zero network activity as a successful test.
export async function runBoundaryCases(sdk, transport, origin, run, strict) {
  check(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin), "Loopback origin required");
  check(/^[a-z0-9-]{1,30}$/.test(run), "Invalid fixture run identifier");
  const control = async (path, credentials = "omit") => {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await transport(`${origin}${path}`, {
            credentials,
            redirect: "error",
            signal: controller.signal,
          });
          check(response.ok, "Fixture control unavailable");
          return response.json();
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Fixture control timed out")),
            5000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  };
  const receipt = (id) => control(`/record/${id}`);
  const invoke = async (id, route, operation) => {
    let dispatches = 0;
    const client = new sdk.DaykeeperReactNativeClient({
      baseUrl: `${origin}/case/${id}/${route}`,
      getAccessToken: () => "synthetic-customer-token",
      timeoutMs: 5000,
      fetch: (input, init) => {
        dispatches++;
        return transport(
          input,
          strict
            ? {
                ...init,
                credentials: "omit",
                redirect: "error",
              }
            : init,
        );
      },
    });
    let outcome = "resolved";
    try {
      await operations[operation](client);
    } catch (error) {
      outcome =
        error instanceof sdk.DaykeeperReactNativeTransportError
          ? error.code
          : "unexpected-error";
    }
    const record = await receipt(id);
    check(dispatches === 1, `${id}: unexpected SDK dispatch count`);
    check(
      record.source.length === 1,
      `${id}: source request not confirmed once`,
    );
    check(record.source[0].receiver === 0, `${id}: source listener mismatch`);
    check(record.source[0].complete, `${id}: source body not completed`);
    check(
      record.source[0].method === (operation === "read" ? "GET" : "POST"),
      `${id}: method mismatch`,
    );
    check(
      record.source[0].body === ["send", "claim"].includes(operation),
      `${id}: source body mismatch`,
    );
    return { id, operation, outcome, dispatches, ...record };
  };
  const cases = [];
  // A direct request must work before redirect rejection is credited as safe.
  for (const operation of Object.keys(operations)) {
    const value = await invoke(
      `${run}-direct-${operation}`,
      "direct",
      operation,
    );
    check(value.outcome === "resolved", `${value.id}: direct control failed`);
    check(
      value.source[0].authorization,
      `${value.id}: token missing at source`,
    );
    cases.push(value);
  }
  for (const status of [301, 302, 303, 307, 308]) {
    for (const destination of ["same", "cross"]) {
      for (const operation of Object.keys(operations)) {
        cases.push(
          await invoke(
            `${run}-${status}-${destination}-${operation}`,
            `${status}/${destination}`,
            operation,
          ),
        );
      }
    }
  }
  const cookieId = `${run}-cookie`;
  let cookie;
  try {
    await control(`/cookie/${cookieId}/seed`, "include");
    const included = await control(`/cookie/${cookieId}/check`, "include");
    const value = await invoke(cookieId, "direct", "read");
    cookie = {
      controlPresent: included.present,
      sourceReceived: value.source[0].cookie,
    };
    cases.push(value);
  } finally {
    await control(`/cookie/${cookieId}/clear`, "include");
  }
  // Re-read after the whole run so late native arrivals are not missed merely
  // because the SDK promise already settled or aborted.
  for (const value of cases) Object.assign(value, await receipt(value.id));
  const redirects = cases.filter((value) =>
    /-(301|302|303|307|308)-/.test(value.id),
  );
  return {
    run,
    strict,
    cookie,
    cases,
    summary: {
      cases: cases.length,
      redirects: redirects.length,
      followed: redirects.filter((value) => value.sink.length > 0).length,
      forwardedAuthorization: redirects.filter((value) =>
        value.sink.some((entry) => entry.authorization),
      ).length,
      forwardedBodies: redirects.filter((value) =>
        value.sink.some((entry) => entry.body),
      ).length,
      incompleteRedirects: redirects.filter((value) =>
        value.sink.some((entry) => !entry.complete),
      ).length,
      timeouts: redirects.filter((value) => value.outcome === "REQUEST_TIMEOUT")
        .length,
      rejected: redirects.filter((value) => value.outcome === "NETWORK_ERROR")
        .length,
    },
  };
}
