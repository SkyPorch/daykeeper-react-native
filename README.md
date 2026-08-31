# `@skyporch/daykeeper-react-native`

The official headless React Native client for customer-facing Daykeeper support
experiences. It is generated from the Daykeeper customer API contract and is
designed for Expo and bare React Native applications on iOS and Android.

This package contains no native module and no embedded support UI. It provides
typed identity, conversation, message, unread, seen, and anonymous-claim APIs.
Push notifications, attachments, deep links, and native UI can be added here
without coupling consuming applications to Daykeeper's private platform or to
any infrastructure provider.

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
short-lived credentials. If the gateway returns HTTP 401, the SDK asks the
provider for one forced refresh and retries exactly once. Keep customer tokens
in memory where possible. Never place them in URLs, analytics, crash reports,
or application logs.

## API

- `getIdentity()`
- `listConversations()` and `createConversation()`
- `listMessages()` and `sendMessage()`
- `getUnread()` and `markConversationSeen()`
- `claimAnonymousConversation()`

See [`COMPATIBILITY.md`](COMPATIBILITY.md) for the supported runtime contract
and release certification matrix.

## Deadlines and cancellation

`timeoutMs` defaults to 30 seconds (allowed range: 1–60 seconds). One budget
covers token acquisition, both authentication attempts, and streaming or
buffered response reads. Token providers receive an optional `signal` alongside
`forceRefresh`; pass it to your backend exchange to cancel that work too.

Every customer API method accepts `{ signal }` request options. Use a caller
`AbortController` when a screen unmounts or the signed-in identity changes.
Pre-aborted calls do not invoke credentials or send a request. A late token
cannot start a request after cancellation or timeout.

Errors preserve `REQUEST_ABORTED` or `REQUEST_TIMEOUT` even if a credential
provider or native response stalls. Cancellation does not undo a message or
conversation the server already accepted. Reconcile history before retrying a
write with an uncertain outcome; network failures and timeouts are not
automatically replayed.

Credential-provider failures use the non-retryable `TOKEN_PROVIDER_ERROR`
code, distinct from network failures. Raw provider errors are not exposed.
Handle sign-in recovery in the token provider or the application; deadline and
caller cancellation still use their dedicated error codes.

`DaykeeperReactNativeApiError.retryable` respects an explicit boolean from the
server. A usage ceiling can return HTTP 429 with `retryable: false`; surface its
stable `code` and let a workspace administrator review usage instead of replaying
the write. Older responses without the hint keep status-based classification.
No response body message or diagnostic is copied into SDK errors, and the SDK
does not automatically retry these failures. Only the existing one-time 401
credential refresh is automatic.

## Release status

Version `0.1.1` is generated from the customer contract recorded in
[`openapi/SOURCE.md`](openapi/SOURCE.md). Releases use the protected,
provenance-producing process in [`RELEASING.md`](RELEASING.md).
