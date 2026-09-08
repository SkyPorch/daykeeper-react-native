export const FIXTURE_BASE_URL = "https://fixture.invalid/support-api";

export function createFixtureFetch() {
  const calls: Array<{ path: string; method: string; authorization: string }> =
    [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const authorization = new Headers(init?.headers).get("authorization") ?? "";
    calls.push({ path: url.pathname, method, authorization });
    const payloads: Record<string, unknown> = {
      "/support-api/v1/identity": {
        baseUrl: FIXTURE_BASE_URL,
        websiteToken: "fixture-website-token",
        subject: "fixture-subject",
        identifier: "fixture-identifier",
        identifierHash: "fixture-identifier-hash",
        email: null,
        name: "Hermes Fixture",
      },
      "/support-api/v1/conversations": {
        conversations: [],
        widgetConversationId: null,
      },
      "/support-api/v1/unread": {
        unreadCount: 0,
        conversation: null,
        conversations: [],
      },
    };
    if (method !== "GET" || !(url.pathname in payloads))
      throw new Error("unexpected fixture request");
    return new Response(JSON.stringify(payloads[url.pathname]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch, calls };
}
