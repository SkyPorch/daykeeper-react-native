import { createServer } from "node:http";
import { once } from "node:events";

export async function startFixture(port = 0) {
  const counts = new Map();
  const results = [];
  const server = createServer((request, response) => {
    const json = (status, value) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(value));
    };
    const count = /^\/__fixture\/count\/([a-z0-9-]+)$/.exec(request.url);
    if (request.method === "GET" && count)
      return json(
        200,
        counts.get(count[1]) ?? { calls: 0, methods: [], paths: [] },
      );
    if (request.method === "GET" && request.url === "/__fixture/results")
      return json(200, results);
    if (request.method === "POST" && request.url === "/__fixture/result") {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        body += chunk;
        if (Buffer.byteLength(body) > 32768) request.destroy();
      });
      request.on("end", () => {
        try {
          results.push(JSON.parse(body));
          json(200, { accepted: true });
        } catch {
          json(400, { error: "invalid_fixture_result" });
        }
      });
      return;
    }
    const match = /^\/case\/([a-z0-9-]+)\/([a-z-]+)(\/v1\/[a-z0-9/-]+)$/.exec(
      request.url,
    );
    if (!match || !["GET", "POST"].includes(request.method))
      return json(404, {});
    if (request.headers.authorization !== "Bearer synthetic-customer-token")
      return json(403, {});
    const [, id, scenario, path] = match;
    const state = counts.get(id) ?? { calls: 0, methods: [], paths: [] };
    state.calls++;
    state.methods.push(request.method);
    state.paths.push(path);
    counts.set(id, state);
    request.resume();
    const denial = (status, error, retryable) =>
      json(status, {
        error,
        retryable,
        message: "synthetic-private-diagnostic",
        nextAction: "https://synthetic-private.example.test/token",
      });
    if (
      scenario === "success" ||
      (state.calls === 2 && ["auth-refresh", "auth-legacy"].includes(scenario))
    )
      return json(200, {
        unreadCount: 0,
        conversations: [],
        conversation: null,
        messages: [],
        status: "merged",
      });
    if (scenario === "auth-denied") return denial(401, "expired_token", false);
    if (scenario === "auth-refresh") return denial(401, "expired_token", true);
    if (scenario === "auth-legacy")
      return denial(401, "expired_token", undefined);
    if (scenario === "unavailable")
      return denial(503, "daykeeper_support_unavailable", true);
    if (scenario === "quota")
      return denial(429, "daykeeper_usage_limit_exceeded", false);
    if (scenario === "unknown-code")
      return denial(403, "synthetic-private-diagnostic", false);
    if (scenario === "drop") return request.socket.destroy();
    if (scenario === "stall" || scenario === "cancel") {
      response.writeHead(401, { "content-type": "application/json" });
      response.write('{"retryable":');
      return;
    }
    if (scenario === "malformed") {
      response.writeHead(200);
      return response.end("not JSON");
    }
    if (scenario === "oversized") {
      response.writeHead(200);
      return response.end("x".repeat(1024 * 1024 + 1));
    }
    return json(404, {});
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
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  const fixture = await startFixture(Number(process.argv[2] ?? 18244));
  console.log(`Synthetic Daykeeper fixture: ${fixture.origin}`);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => void fixture.close());
}
