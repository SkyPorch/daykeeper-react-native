import { createServer } from "node:http";
import { once } from "node:events";
import { pathToFileURL } from "node:url";

const idPattern = /^[a-z0-9-]{1,80}$/;
const payload = {
  unreadCount: 0,
  conversations: [],
  conversation: null,
  messages: [],
  status: "merged",
};

export async function startBoundaryFixture(ports = [0, 0]) {
  const records = new Map();
  const results = [];
  const origins = [];
  const servers = [0, 1].map((receiver) =>
    createServer(async (request, response) => {
      const json = (status, value, headers = {}) => {
        response.writeHead(status, {
          "content-type": "application/json",
          "cache-control": "no-store",
          ...headers,
        });
        response.end(JSON.stringify(value));
      };
      const parts = request.url.split("/").slice(1);
      const [action, id] = parts;
      let entry;
      try {
        // Record arrivals before reading the body: a redirected upload can
        // stall partway through. Counting only completed bodies hides attempts.
        if (["case", "sink"].includes(action) && idPattern.test(id ?? "")) {
          if (!records.has(id) && records.size >= 1024) return json(429, {});
          const record = records.get(id) ?? { source: [], sink: [] };
          const side = action === "case" ? "source" : "sink";
          if (record[side].length >= 8) return json(429, {});
          entry = {
            method: request.method,
            receiver,
            authorization: Boolean(request.headers.authorization),
            cookie: (request.headers.cookie ?? "").includes("daykeeper_"),
            body: false,
            bodyBytes: 0,
            declaredBody: Number(request.headers["content-length"] ?? 0) > 0,
            complete: false,
          };
          record[side].push(entry);
          records.set(id, record);
        }
        let body = "";
        for await (const chunk of request) {
          body += chunk.toString("utf8");
          if (entry) {
            entry.bodyBytes += chunk.length;
            entry.body = entry.bodyBytes > 0;
          }
          if (Buffer.byteLength(body) > 262144) return json(413, {});
        }
        if (entry) entry.complete = true;
        if (request.method === "GET" && request.url === "/results")
          return json(200, results);
        if (request.method === "POST" && request.url === "/result") {
          if (results.length >= 8) return json(429, {});
          results.push(JSON.parse(body));
          return json(200, { accepted: true });
        }
        if (!idPattern.test(id ?? "")) return json(404, {});
        if (action === "record")
          return json(200, records.get(id) ?? { source: [], sink: [] });
        const cookie = `daykeeper_${id}=synthetic`;
        if (action === "cookie") {
          const operation = parts[2];
          if (!["seed", "clear", "check"].includes(operation))
            return json(404, {});
          return json(
            200,
            {
              present: (request.headers.cookie ?? "")
                .split("; ")
                .includes(cookie),
            },
            operation === "check"
              ? {}
              : {
                  "set-cookie": `${cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${operation === "seed" ? 300 : 0}`,
                },
          );
        }
        if (!["case", "sink"].includes(action)) return json(404, {});
        if (!["GET", "POST"].includes(request.method)) return json(405, {});
        // Reject non-fixture credentials without persisting or echoing values.
        if (
          request.headers.authorization &&
          request.headers.authorization !== "Bearer synthetic-customer-token"
        )
          return json(403, {});
        if (
          body &&
          ![
            JSON.stringify({ content: "synthetic-message" }),
            JSON.stringify({ widgetToken: "synthetic-widget-token" }),
          ].includes(body)
        )
          return json(400, {});
        if (action === "sink" || parts[2] === "direct")
          return json(200, payload);
        const status = Number(parts[2]);
        const destination = parts[3];
        if (
          ![301, 302, 303, 307, 308].includes(status) ||
          !["same", "cross"].includes(destination)
        )
          return json(400, {});
        // Destinations are always these two synthetic loopback listeners.
        return json(
          status,
          {},
          {
            location: `${origins[destination === "same" ? 0 : 1]}/sink/${id}`,
          },
        );
      } catch {
        if (!response.headersSent) json(400, {});
        else response.end();
      }
    }),
  );
  const close = async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise((resolve) => {
            server.closeAllConnections();
            server.close(resolve);
          }),
      ),
    );
  };
  try {
    for (const [index, server] of servers.entries()) {
      server.listen(ports[index], "127.0.0.1");
      await once(server, "listening");
      origins.push(`http://127.0.0.1:${server.address().port}`);
    }
  } catch (error) {
    await close();
    throw error;
  }
  return { origin: origins[0], receiverOrigin: origins[1], close };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const fixture = await startBoundaryFixture([18246, 18247]);
  console.log(
    `Synthetic Daykeeper boundary fixture: ${fixture.origin}, ${fixture.receiverOrigin}`,
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => void fixture.close());
}
