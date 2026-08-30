# `@skyporch/daykeeper-react-native`

The official headless React Native client for customer-facing Daykeeper support
experiences. It is generated from the Daykeeper customer API contract and is
designed for Expo and bare React Native applications on iOS and Android.

This package contains no native module and no embedded support UI. It provides
typed identity, conversation, message, unread, seen, and anonymous-claim APIs.
Push notifications, attachments, deep links, and native UI can be added here
without coupling consuming applications to Daykeeper's private platform or to
Chatwoot.

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

## Release status

Version `0.1.0` is generated from the customer contract recorded in
[`openapi/SOURCE.md`](openapi/SOURCE.md). Releases use the protected,
provenance-producing process in [`RELEASING.md`](RELEASING.md).
