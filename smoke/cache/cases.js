const reads = {
  identity: ["identity", (client) => client.getIdentity()],
  conversations: ["conversations", (client) => client.listConversations()],
  messages: ["conversations/1/messages", (client) => client.listMessages(1)],
  unread: ["unread", (client) => client.getUnread()],
};
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const pause = () => new Promise((resolve) => setTimeout(resolve, 200));

// createClient accepts {baseUrl,getAccessToken}; native hosts must explicitly
// provide their actual transport. Node runs do not certify native cache behavior.
export async function runCacheCases({
  createClient,
  transport,
  origin,
  run,
  requireCache = false,
  nativeHeaders = false,
  operations = Object.keys(reads),
}) {
  check(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin), "Loopback origin required");
  check(/^[a-z0-9-]{1,30}$/.test(run), "Invalid fixture run identifier");
  check(
    operations.length > 0 &&
      operations.every((value) => Object.hasOwn(reads, value)),
    "Invalid fixture operations",
  );
  const control = async (path, subject) => {
    const controller = new AbortController();
    let timer;
    let completed = false;
    try {
      return await Promise.race([
        (async () => {
          const response = await transport(`${origin}${path}`, {
            redirect: "error",
            credentials: "omit",
            signal: controller.signal,
            ...(subject
              ? { headers: { authorization: `Bearer synthetic-${subject}` } }
              : {}),
          });
          check(response.ok, "Cache fixture control unavailable");
          const body = await response.json();
          completed = true;
          return body;
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Cache control timed out")),
            5000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      // Aborting a completed native control can race URLSession's cache commit.
      // Only cancel abandoned work; successful seeds must be allowed to cache.
      if (!completed) controller.abort();
    }
  };
  const cases = [];
  for (const operation of operations) {
    const [route, invoke] = reads[operation];
    for (const policy of ["public", "private", "no-store"]) {
      const id = `${run}-${operation}-${policy}`;
      const endpoint = `/case/${id}/${policy}`;
      let previous = await control(`${endpoint}/v1/${route}`, "a");
      let cacheObserved = false;
      const attempts = requireCache && policy !== "no-store" ? 12 : 1;
      for (let attempt = 0; attempt < attempts; attempt++) {
        if (requireCache) await pause();
        const next = await control(`${endpoint}/v1/${route}`, "a");
        check(next.fixture.subject === "a", `${id}: seed subject mismatch`);
        if (next.fixture.count === previous.fixture.count) {
          cacheObserved = true;
          break;
        }
        previous = next;
      }
      if (requireCache && policy !== "no-store")
        check(cacheObserved, `${id}: positive cache control not established`);
      if (policy === "no-store")
        check(!cacheObserved, `${id}: server no-store response was cached`);
      const warm = await control(`/record/${id}`);
      check(
        warm.length === previous.fixture.count,
        `${id}: seed wire count mismatch`,
      );
      let subject = "b";
      let tokens = 0;
      const client = createClient({
        baseUrl: `${origin}${endpoint}`,
        getAccessToken: () => {
          tokens++;
          return `synthetic-${subject}`;
        },
      });
      for (const [index, nextSubject] of ["b", "b", "a"].entries()) {
        if (requireCache) await pause();
        subject = nextSubject;
        const value = await invoke(client);
        check(
          value.fixture?.subject === subject,
          `${id}: previous account response reused`,
        );
        check(
          value.fixture.count === warm.length + index + 1,
          `${id}: stale response reused`,
        );
      }
      subject = "revoked";
      if (requireCache) await pause();
      let denied = false;
      try {
        await invoke(client);
      } catch (error) {
        denied = error.status === 403;
      }
      check(denied, `${id}: revoked credential received cached success`);
      const record = await control(`/record/${id}`);
      const protectedCalls = record.slice(warm.length);
      check(
        tokens === 4 && protectedCalls.length === 4,
        `${id}: unexpected protected dispatch count`,
      );
      check(
        protectedCalls.map((value) => value.subject).join() === "b,b,a,revoked",
        `${id}: wire identity mismatch`,
      );
      check(
        protectedCalls.every((value) => !value.cookie),
        `${id}: ambient cookie transmitted`,
      );
      if (nativeHeaders)
        check(
          protectedCalls.every(
            (value) => value.cacheControl === "no-cache, no-store",
          ),
          `${id}: native cache policy missing`,
        );
      cases.push({
        id,
        kind: "seeded",
        cacheObserved,
        warm,
        protectedCalls,
        tokens,
      });

      // A separate cold URL proves protected responses are not newly stored.
      const cold = `${id}-cold`;
      const freshClient = createClient({
        baseUrl: `${origin}/case/${cold}/${policy}`,
        getAccessToken: () => "synthetic-a",
      });
      const first = await invoke(freshClient);
      check(
        first.fixture?.subject === "a" && first.fixture.count === 1,
        `${cold}: first response missing`,
      );
      if (requireCache) await pause();
      const second = await control(`/case/${cold}/${policy}/v1/${route}`, "b");
      check(
        second.fixture.subject === "b" && second.fixture.count === 2,
        `${cold}: protected response was stored`,
      );
      const coldRecord = await control(`/record/${cold}`);
      check(coldRecord.length === 2, `${cold}: wire count mismatch`);
      check(
        coldRecord.map((value) => value.subject).join() === "a,b",
        `${cold}: wire identity mismatch`,
      );
      check(
        coldRecord.every((value) => !value.cookie),
        `${cold}: ambient cookie transmitted`,
      );
      if (nativeHeaders)
        check(
          coldRecord[0].cacheControl === "no-cache, no-store",
          `${cold}: native cache policy missing`,
        );
      cases.push({ id: cold, kind: "cold", record: coldRecord });
    }
  }
  return {
    run,
    cases,
    summary: {
      cases: cases.length,
      positiveCacheControls: cases.filter((value) => value.cacheObserved)
        .length,
      nativeHeaders,
      requireCache,
    },
  };
}
