import { createServer } from "node:http";
import { once } from "node:events";
import { pathToFileURL } from "node:url";

export async function startCacheFixture(port = 0) {
  const records = new Map();
  const results = [];
  const server = createServer(async (request, response) => {
    const json = (status, body, policy = "no-store") => {
      const encoded = JSON.stringify(body);
      response.writeHead(status, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(encoded),
        "cache-control": policy,
      });
      response.end(encoded);
    };
    try {
      if (request.url === "/results" && request.method === "GET")
        return json(200, results);
      if (request.url === "/result" && request.method === "POST") {
        if (results.length >= 8) return json(429, {});
        let body = "";
        for await (const chunk of request) {
          body += chunk;
          if (Buffer.byteLength(body) > 1048576) return json(413, {});
        }
        results.push(JSON.parse(body));
        return json(200, { accepted: true });
      }
      const record = request.url.match(/^\/record\/([a-z0-9-]{1,80})$/);
      if (record && request.method === "GET")
        return json(200, records.get(record[1]) ?? []);
      const match = request.url.match(
        /^\/case\/([a-z0-9-]{1,80})\/(public|private|no-store)\/v1\/(identity|unread|conversations(?:\/1\/messages)?)$/,
      );
      if (!match || request.method !== "GET") return json(404, {});
      const subjects = new Map([
        ["Bearer synthetic-a", "a"],
        ["Bearer synthetic-b", "b"],
        ["Bearer synthetic-revoked", "revoked"],
      ]);
      const subject = subjects.get(request.headers.authorization);
      // Never persist or echo a non-fixture credential.
      if (!subject) return json(403, {});
      if (!records.has(match[1]) && records.size >= 256) return json(429, {});
      const arrivals = records.get(match[1]) ?? [];
      if (arrivals.length >= 64) return json(429, {});
      const receipt = {
        subject,
        count: arrivals.length + 1,
        cacheControl: request.headers["cache-control"] ?? null,
        cookie: Boolean(request.headers.cookie),
      };
      arrivals.push(receipt);
      records.set(match[1], arrivals);
      // Deliberately misconfigured cacheable responses have no Vary. The real
      // API must continue returning no-store; this tests client defense in depth.
      const policy =
        match[2] === "no-store" ? "no-store" : `${match[2]}, max-age=600`;
      if (subject === "revoked")
        return json(403, { error: "invalid_token", retryable: false }, policy);
      return json(
        200,
        {
          identity: { identifier: subject },
          conversations: [],
          widgetConversationId: null,
          messages: [],
          unreadCount: 0,
          fixture: { subject, count: receipt.count },
        },
        policy,
      );
    } catch {
      if (!response.headersSent) json(400, {});
      else response.end();
    }
  });
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const fixture = await startCacheFixture(Number(process.argv[2] ?? 18248));
  console.log(JSON.stringify({ origin: fixture.origin }));
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => fixture.close());
}
