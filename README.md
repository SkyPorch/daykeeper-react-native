# `@skyporch/daykeeper-react-native`

The official headless React Native client for customer-facing Daykeeper support
experiences. It is generated from the Daykeeper customer API contract and is
designed for Expo and bare React Native applications on iOS and Android.

This package contains no native module and no embedded support UI. It provides
typed identity, conversation, message, unread, seen, and anonymous-claim APIs.
Push notifications, attachments, deep links, and native UI can be added here
without coupling consuming applications to Daykeeper's private platform or to
any infrastructure provider.

API-only inbox gateways support customer conversations, messages, unread state,
and seen markers. They do not provide widget identity or anonymous-conversation
claim operations: those calls return `409` with `widget_unavailable` before the
conversation provider is contacted. Use a widget-enabled gateway for those
operations.

SDK errors preserve known gateway codes. Unknown remote codes are returned as
`daykeeper_request_failed`; arbitrary response text is not exposed through errors.

API-only inbox gateways support customer conversations, messages, unread state,
and seen markers. They do not provide widget identity or anonymous-conversation
claim operations: those calls return `409` with `widget_unavailable` before the
conversation provider is contacted. Use a widget-enabled gateway for those
operations.

SDK errors preserve known gateway codes. Unknown remote codes are returned as
`daykeeper_request_failed`; arbitrary response text is not exposed through errors.

## Install

```sh
npm install @skyporch/daykeeper-react-native
```

## Use

```ts
import { createDaykeeperReactNativeClient } from "@skyporch/daykeeper-react-native";

const daykeeper = createDaykeeperReactNativeClient({
  baseUrl: "https://support.example.com/support-api",
  getAccessToken: async ({ forceRefresh }) => {
    // Exchange the signed-in app session for a short-lived, customer-scoped
    // Daykeeper token using your own backend. Bypass any local token cache when
    // forceRefresh is true.
    return getDaykeeperCustomerToken({ forceRefresh });
  },
});

const { conversations } = await daykeeper.listConversations();
```

The token provider runs for every request so the consuming app can rotate
short-lived credentials. A GET may ask the provider for one forced refresh
after HTTP 401 unless the response says `retryable: false`; writes make one
SDK attempt and are never refreshed and replayed. Keep customer tokens in
memory where possible. Never place them in URLs, analytics, crash reports, or
application logs.

The request timeout cannot forcibly stop a token provider that never resolves;
implement providers with their own bounded backend operation so a late token is
not produced after the caller has abandoned the request.

## API

- `getIdentity()`
- `listConversations()` and `createConversation()`
- `listMessages()` and `sendMessage()`
- `getUnread()` and `markConversationSeen()`
- `claimAnonymousConversation()`

See [`COMPATIBILITY.md`](COMPATIBILITY.md) for the supported runtime contract
and release certification matrix.

When a dispatched write fails during transport, times out, returns an ambiguous
408/5xx, or has an invalid success response, `outcomeUnknown` is true and
`retryable` is false: read current server state before deciding on a deliberate
new action. Pre-dispatch failures remain ordinary retryable transport errors
where appropriate.

## Release status

Version `0.1.1` is generated from the customer contract recorded in
[`openapi/SOURCE.md`](openapi/SOURCE.md). Releases use the protected,
provenance-producing process in [`RELEASING.md`](RELEASING.md).
