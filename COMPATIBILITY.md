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
forwarding anything. Native entry types require `fetch`; runtime validation
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
