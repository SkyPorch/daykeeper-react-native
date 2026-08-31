# `@skyporch/daykeeper-react-native`

The official headless React Native client for customer-facing Daykeeper support
experiences. Its types come from the Daykeeper customer API contract; its transport is
designed for Expo and bare React Native applications on iOS and Android.

This package contains no native module and no embedded support UI. It provides
typed identity, conversation, message, unread, seen, and anonymous-claim APIs.
Push notifications, attachments, deep links, and native UI can be added here
without coupling consuming applications to Daykeeper's private platform or to
any infrastructure provider.

This README describes the unreleased `0.2.0` candidate. Production certification
is still open; a successful Metro build or Node test does not establish native
parity. See [`COMPATIBILITY.md`](COMPATIBILITY.md) before a release or upgrade.

## Install

After the candidate is approved and published:

```sh
npm install @skyporch/daykeeper-react-native@0.2.0
```

Before publication, test with the reviewed packed tarball. An unversioned npm
install may select the older published SDK, which does not enforce this policy.

## Use

```ts
import { createDaykeeperReactNativeClient } from "@skyporch/daykeeper-react-native";
import { fetch as expoFetch } from "expo/fetch";

const daykeeper = createDaykeeperReactNativeClient({
  baseUrl: "https://support.example.com/support-api",
  fetch: expoFetch,
  getAccessToken: async ({ forceRefresh }) => {
    // Exchange the signed-in app session for a short-lived, customer-scoped
    // Daykeeper token using your own backend. Bypass any local token cache when
    // forceRefresh is true.
    return getDaykeeperCustomerToken({ forceRefresh });
  },
});

const { conversations } = await daykeeper.listConversations();
```

The native export requires an explicit Fetch implementation. This example uses
the host's existing Expo 57 installation; the SDK does not install Expo. Bare
React Native applications may supply their own native Fetch implementation,
but it must reject redirects before following them, omit ambient cookies,
honor request Cache-Control directives, and support cancellation. The XHR-backed React Native global is not compliant;
wrapping it or setting Fetch flags does not repair its redirect behavior. Do not
pass it as the native transport. Omitting `fetch` fails before token acquisition.

Every request sets `redirect: "error"`, `credentials: "omit"`, and `cache: "no-store"`.
The native export also sends `Cache-Control: no-cache, no-store`, because the
validated Expo runtime ignores the standard Fetch cache option. This revalidates
existing cache entries and prevents new storage, including across account
changes. Node/web uses standard Fetch cache semantics without adding a custom
browser request header. Keep the API's response `Cache-Control: no-store` too.
A custom Fetch
function is a caller-owned trust boundary: the SDK cannot prevent an injected
implementation from ignoring those options. Use an exact HTTPS gateway URL,
not one that redirects. Node/web exports can use standard global Fetch.

The token provider runs for every request so the consuming app can rotate
short-lived credentials. For a GET returning HTTP 401 without an explicit
`retryable: false`, the SDK asks the provider for one forced refresh and retries
the read once. Writes never refresh and replay automatically. Keep customer tokens
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

## Safe recovery

All four writes (`createConversation`, `sendMessage`, `markConversationSeen`, and
`claimAnonymousConversation`) dispatch at most once per call, including after
HTTP 401. Their errors always have `retryable: false`, even when a server hint
says otherwise. Refresh credentials in your app before a deliberate new write;
do not wrap writes in a generic retry loop.

Both exported error classes include `outcomeUnknown` in their properties and
`toJSON()` output. It is true when a write may have reached the server but the
SDK cannot confirm its result: a timeout, cancellation, transport/body failure
after dispatch, or HTTP 408/5xx. Preserve the draft and read conversation history
before offering another send. Cancellation cannot roll back an accepted write.
`outcomeUnknown: false` is not an exactly-once guarantee or proof of no side
effects. The customer API has no SDK-supported idempotency-key contract yet.
The SDK's dispatch bound is not a wire-level guarantee: a native HTTP stack may
retry internally (observed for a dropped GET on iOS). Never treat this SDK as
an exactly-once delivery mechanism.

For reads, `DaykeeperReactNativeApiError.retryable` respects an explicit server
boolean; older responses fall back to status-based classification (408, 429,
and 5xx). No automatic backoff or rate-limit retry is performed. Only a first
read 401 without an explicit false hint permits one credential refresh. A
stalled, oversized, cancelled, or failed 401 body does not permit that refresh;
a completed legacy empty/non-JSON 401 does.

A usage ceiling can return HTTP 429 with `retryable: false`. Show suitable local
copy for its stable code and let a workspace administrator review usage.
Only documented, allowlisted error codes enter SDK error messages, stacks, and
serialization; unknown codes become `daykeeper_request_failed`. Raw server
messages, next-action URLs, and credential/transport errors are not copied.

On logout or account change, abort outstanding calls, clear customer UI/history
and in-memory token caches, and ignore results belonging to the old session.
The headless SDK does not own the app's login state or persistent storage.

## Release status

Candidate `0.2.0` is generated from the customer contract recorded in
[`openapi/SOURCE.md`](openapi/SOURCE.md). Releases use the protected,
provenance-producing process in [`RELEASING.md`](RELEASING.md).
