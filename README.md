# `@skyporch/daykeeper-react-native`

The official headless React Native client for customer-facing Daykeeper support
experiences. It is generated from the Daykeeper customer API contract and is
designed for Expo and bare React Native applications on iOS and Android.

This package contains no native module and keeps its core client headless. An
optional presentational conversation template is available from the `/ui`
entrypoint. The core provides typed identity, conversation, message, unread,
seen, and anonymous-claim APIs.
Push notifications, attachments, deep links, and native UI can be added here
without coupling consuming applications to Daykeeper's private platform or to
Chatwoot.

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

## Recommended UI

For a ready-made conversation surface, import `DaykeeperConversationTemplate`
from `@skyporch/daykeeper-react-native/ui` and keep draft/send state in the
host application:

```tsx
import { DaykeeperConversationTemplate } from "@skyporch/daykeeper-react-native/ui";

const [draft, setDraft] = useState("");

<DaykeeperConversationTemplate
  draft={draft}
  onDraftChange={setDraft}
  onSend={(message) => sendMessageFromYourApp(message)}
>
  {transcript}
</DaykeeperConversationTemplate>;
```

The built-in composer never connects to the network, retries, or clears the
draft. The host should set `sending` while its operation is pending and clear
the draft only after confirmed success; render the transcript from host-owned
state. Use `composer={null}` to omit the composer or provide a custom slot.

See the full template contract and synthetic example below. For a headless
client with a fully custom renderer, use the core API instead.

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

The request timeout cannot forcibly cancel a token provider that never resolves,
but it does settle the SDK request and ignores any late token. Implement
providers with their own bounded backend operation to avoid wasted work.

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

## Conversation template contract

The package also exports a presentational conversation surface from `@skyporch/daykeeper-react-native/ui`.
It accepts a team name, greeting, body, optional starter topics, transcript
children, and either a built-in composer or custom composer slot. With the
default starter topics, pass `draft`, `onDraftChange`, and `onSend` for a
ready-made controlled composer; sending is disabled while `sending` is true or
when handlers/draft are missing. The host owns message state and calls its own
transport; the component never retries or clears draft text after an async
operation. The welcome intro stays at the start of the transcript through the
first outgoing message; set `hideWelcome` when rendering an older history that
should begin directly with its transcript. The component does
not create a client, make requests, track online state, or invent response
promises. Set `composer={null}` to hide the composer, or pass a custom
composer to preserve full host control. Pass `accentColor`, `accentTextColor`,
`accessibilityLabels`, `composerPlaceholder`, `sendLabel`, `sendingLabel`, and a
`keyboardVerticalOffset` when the host supplies branded colors, translations,
or a navigation bar. The host owns transcript and composer theming and
accessibility labels. On Android, set the host window to
`android:windowSoftInputMode="adjustResize"` and apply the host's keyboard
insets policy for edge-to-edge content; do not layer a second default resize
adjustment on top. See
[`examples/ConversationTemplateExample.tsx`](examples/ConversationTemplateExample.tsx)
for a synthetic integration.

## Release status

Version `0.1.0` is generated from the customer contract recorded in
[`openapi/SOURCE.md`](openapi/SOURCE.md). Releases use the protected,
provenance-producing process in [`RELEASING.md`](RELEASING.md).
