# React Native compatibility

The initial validation target is Expo 57 with React Native 0.86 and Hermes. The
package declares React Native 0.79 or newer because Metro enables package
exports by default from that line onward. Releases must be smoke-tested through
Metro on both iOS and Android before this matrix is expanded.

The client uses an explicitly configured native Fetch transport plus the
web-compatible globals `Headers`, `URL`, and `AbortController`. It handles both standards-based
streaming responses and React Native's buffered `Response.text()` response. A
custom `fetch` implementation must preserve those request and response
semantics and enforce `redirect: "error"` plus `credentials: "omit"` before
forwarding anything. It must also honor `Cache-Control: no-cache, no-store`;
the native export adds this because Expo 57 ignores Fetch's `cache` option.
All exports set `cache: "no-store"`. Native entry types require `fetch`; runtime validation
rejects an omitted transport before credentials are requested. Standard
Node/web Fetch remains the non-native default. Expo is not an SDK dependency.

Writes never automatically replay, including after 401. Read credential refresh
honors explicit non-retryable advice before a second dispatch. An uncertain
write result is marked `outcomeUnknown: true` and `retryable: false`; reconcile
server state before a deliberate retry. This is not server-side idempotency.
See the recovery contract in the README.

The SDK is headless and ships no native module. It does not yet provide a
messenger UI, push-notification registration, attachment selection/upload,
deep-link routing, persistent offline queues, or background delivery. Consumers
own those surfaces until they are added here behind reviewed native interfaces.

Tokens must be short-lived and customer-scoped. Keep them in memory where
possible; if persistence is unavoidable, use an OS-backed secret store and
never AsyncStorage.

## Error codes: open vocabulary

The gateway's error vocabulary is open and grows without an SDK release, so
the SDK does not keep a list of known codes. Any `error` value shaped like a
code -- ASCII lowercase snake_case, 3 to 64 characters, matching
`^[a-z][a-z0-9_]{2,63}$` -- reaches the caller as
`DaykeeperReactNativeApiError.code` unchanged, including codes newer than the
installed SDK. Anything else, including the free-form English messages the
gateway returns for some 4xx failures, collapses to
`daykeeper_request_failed`. The error message is always the code alone: the
contract's `message` and `nextAction` fields are never projected into the
message, stack or serialization. Consuming apps must still handle an unknown
code safely, and must not treat `daykeeper_request_failed` as a specific
condition.

## Native network boundary: release gate

Candidate 0.2.0 sets strict redirect/cookie policy on every dispatch and refuses
implicit native transport selection. Supply explicit Expo57 `expo/fetch` on the
validated host or a custom compliant native implementation. A caller-provided
function remains trusted to implement those semantics; the SDK cannot repair
an XHR wrapper that ignores them. Checking `response.url` afterward cannot
prevent an already-forwarded request.

The synthetic two-listener fixture in [`smoke/boundary`](smoke/boundary/README.md)
measures arrivals, partial bodies, cookies and authorization without retaining
credential or message values. Direct positive controls must pass before a
rejected redirect is credited as a boundary. All four writes and one read are
tested against 301, 302, 303, 307 and 308, within and across origins.

On iOS 26.5 / React Native 0.86.2 / Hermes, the XHR-backed Fetch implementation
followed redirects despite `redirect: "error"`. Explicit `credentials: "omit"`
did omit a seeded cookie in this runtime. Explicit Expo 57 `expo/fetch` with
both options rejected all 50 redirects before receiver arrival and omitted the
cookie; its five direct API controls succeeded. These are observations for that
specific runtime, not a supported transport migration or Android certification.

Before release, verify each consumer's actual transport, rerun packed-package
tests on iOS and Android plus release builds, and certify standalone bare-native
transport coverage. Do not silently require Expo or claim that passing Fetch
flags fixes XHR redirect behavior. Exact gateway
URLs must not rely on canonicalization redirects. Do not broaden native HTTP
exceptions for this fixture or use it on signed-in devices.
