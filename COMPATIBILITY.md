# React Native compatibility

The initial supported target is Expo 57 with React Native 0.86 and Hermes. The
package declares React Native 0.79 or newer because Metro enables package
exports by default from that line onward. Releases must be smoke-tested through
Metro on both iOS and Android before this matrix is expanded.

The client depends only on the React Native web-compatible globals `fetch`,
`Headers`, `URL`, and `AbortController`. It handles both standards-based
streaming responses and React Native's buffered `Response.text()` response. A
custom `fetch` implementation must preserve those request and response
semantics.

Writes never automatically replay, including after 401. Read credential refresh
honors explicit non-retryable advice before a second dispatch. An uncertain
write result is marked `outcomeUnknown: true` and `retryable: false`; reconcile
server state before a deliberate retry. This is not server-side idempotency.
See the recovery contract in the README.

Version 0.1 is headless and ships no native module. It does not yet provide a
messenger UI, push-notification registration, attachment selection/upload,
deep-link routing, persistent offline queues, or background delivery. Consumers
own those surfaces until they are added here behind reviewed native interfaces.

Tokens must be short-lived and customer-scoped. Keep them in memory where
possible; if persistence is unavoidable, use an OS-backed secret store and
never AsyncStorage.
